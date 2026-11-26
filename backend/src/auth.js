'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const reg = require('./registry');
const { wrap, bad, HttpError, audit } = require('./lib');
const sec = require('./security');
const QR = require('qrcode');

const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);
const IDLE_MIN = Number(process.env.SESSION_IDLE_MIN || (process.env.NODE_ENV === 'production' ? 60 : 0)); // 0 = no idle limit
const MFA_ROLES = String(process.env.MFA_REQUIRED_ROLES || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('JWT_SECRET must be set when NODE_ENV=production. Refusing to start.');
  process.exit(1);
}
if (process.env.JWT_SECRET && process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters in production. Refusing to start.');
  process.exit(1);
}
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET) console.warn('[warn] JWT_SECRET not set; using a development secret. Set JWT_SECRET in production.');

const permCache = new Map(); // role_id -> { at, perms:Set }
const TTL = 30 * 1000;
function clearPermCache() { permCache.clear(); }

async function rolePerms(roleId) {
  const c = permCache.get(roleId);
  if (c && Date.now() - c.at < TTL) return c.perms;
  const { rows } = await db.query(`SELECT perm_code FROM "auth"."role_permissions" WHERE role_id=$1`, [roleId]);
  const perms = new Set(rows.map((r) => r.perm_code));
  permCache.set(roleId, { at: Date.now(), perms });
  return perms;
}

async function authenticate(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw new HttpError(401, 'Not signed in');
    let payload;
    try { payload = jwt.verify(token, SECRET); } catch (e) { throw new HttpError(401, 'Session expired, please sign in again'); }
    if (!payload.sid) throw new HttpError(401, 'Session expired, please sign in again');
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.full_name, u.role_id, u.patient_id, u.active, u.is_deleted, u.must_change_password, u.mfa_enabled,
              r.name AS role_name, r.restrict_to_own_visits, r.discount_limit_pct,
              s.revoked AS s_revoked, s.expires_at AS s_exp, s.last_seen AS s_seen
         FROM "auth"."users" u JOIN "auth"."roles" r ON r.id = u.role_id
         JOIN "auth"."sessions" s ON s.id = $2 AND s.user_id = u.id WHERE u.id = $1`, [payload.uid, payload.sid]);
    const u = rows[0];
    if (!u || u.is_deleted || !u.active) throw new HttpError(401, 'Account disabled');
    if (u.s_revoked || new Date(u.s_exp) < new Date()) throw new HttpError(401, 'Session ended, please sign in again');
    if (IDLE_MIN && Date.now() - new Date(u.s_seen).getTime() > IDLE_MIN * 60000) throw new HttpError(401, 'Signed out due to inactivity');
    if (Date.now() - new Date(u.s_seen).getTime() > 60000) db.query(`UPDATE "auth"."sessions" SET last_seen=now() WHERE id=$1`, [payload.sid]).catch(() => {});
    const mfaRequired = MFA_ROLES.includes(String(u.role_name).toLowerCase()) && !u.mfa_enabled;
    req.user = {
      id: u.id, username: u.username, full_name: u.full_name, role_id: u.role_id, role_name: u.role_name, sid: payload.sid,
      patient_id: u.patient_id, restrict: !!u.restrict_to_own_visits, discount_limit: Number(u.discount_limit_pct || 0),
      isPortal: u.role_name === 'Patient', mustChange: !!u.must_change_password, mfaEnabled: !!u.mfa_enabled, mfaRequired,
      perms: await rolePerms(u.role_id),
    };
    // forced password change / mandatory MFA enrolment: only the account endpoints work until done
    if ((req.user.mustChange || mfaRequired) && !/^\/api\/auth\/(me|logout|change-password|mfa\/)/.test(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ error: req.user.mustChange ? 'You must change your password before continuing' : 'Two-factor authentication must be set up before continuing', code: req.user.mustChange ? 'PASSWORD_CHANGE_REQUIRED' : 'MFA_SETUP_REQUIRED' });
    }
    next();
  } catch (e) { next(e); }
}

/* in-memory login throttle: 8 failures / 5 min per username (not per IP, so rotating IPs / spoofed headers cannot bypass it) */
const fails = new Map();
function throttled(key) {
  const now = Date.now();
  const arr = (fails.get(key) || []).filter((t) => now - t < 5 * 60 * 1000);
  fails.set(key, arr);
  return arr.length >= 8;
}

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const router = express.Router();

router.post('/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const code = req.body.code;
  if (!username || !password) throw bad('Enter username and password');
  const key = username;
  if (throttled(key)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
  const { rows } = await db.query(
    `SELECT id, username, password_hash, active, is_deleted, mfa_enabled, mfa_secret, mfa_last_step FROM "auth"."users" WHERE lower(username)=$1`, [username]);
  const u = rows[0];
  // always run one bcrypt compare so response time does not reveal whether the username exists
  const ok = (await bcrypt.compare(password, (u && u.password_hash) || DUMMY_HASH)) && u && !u.is_deleted && u.password_hash;
  const fail = async (msg, status = 401, extra = {}) => {
    fails.get(key).push(Date.now());
    await audit(null, { username, id: u ? u.id : null }, 'LOGIN_FAILED', 'auth', null, null, req.ip);
    return res.status(status).json({ error: msg, ...extra });
  };
  if (!ok) return fail('Wrong username or password');
  if (!u.active) throw new HttpError(403, 'This account is disabled');
  if (u.mfa_enabled) {
    if (!code) return res.status(401).json({ error: 'Enter the 6-digit code from your authenticator app', mfa_required: true, extra: { mfa_required: true } });
    const step = sec.totpCheck(sec.decrypt(u.mfa_secret), code, u.mfa_last_step);
    if (!step) return fail('Wrong or expired authenticator code', 401, { mfa_required: true, extra: { mfa_required: true } });
    await db.query(`UPDATE "auth"."users" SET mfa_last_step=$1 WHERE id=$2`, [step, u.id]);
  }
  await db.query(`UPDATE "auth"."users" SET last_login=now() WHERE id=$1`, [u.id]);
  const s = await db.query(`INSERT INTO "auth"."sessions" (user_id, expires_at, ip, ua) VALUES ($1, now() + ($2 || ' hours')::interval, $3, $4) RETURNING id`,
    [u.id, String(SESSION_HOURS), req.ip, String(req.headers['user-agent'] || '').slice(0, 200)]);
  await audit(null, { username: u.username, id: u.id }, 'LOGIN', 'auth', u.id, null, req.ip);
  const token = jwt.sign({ uid: u.id, sid: s.rows[0].id }, SECRET, { expiresIn: `${SESSION_HOURS}h` });
  res.json({ token });
}));

router.post('/logout', authenticate, wrap(async (req, res) => {
  await db.query(`UPDATE "auth"."sessions" SET revoked=true WHERE id=$1`, [req.user.sid]);
  await audit(null, req.user, 'LOGOUT', 'auth', req.user.id, null, req.ip);
  res.json({ ok: true });
}));
router.post('/logout-all', authenticate, wrap(async (req, res) => {
  await db.query(`UPDATE "auth"."sessions" SET revoked=true WHERE user_id=$1`, [req.user.id]);
  await audit(null, req.user, 'LOGOUT_ALL', 'auth', req.user.id, null, req.ip);
  res.json({ ok: true });
}));

/* ----- MFA (TOTP) ----- */
router.post('/mfa/setup', authenticate, wrap(async (req, res) => {
  if (req.user.mfaEnabled) throw bad('Two-factor authentication is already on');
  const secret = sec.newTotpSecret();
  await db.query(`UPDATE "auth"."users" SET mfa_pending=$1 WHERE id=$2`, [sec.encrypt(secret), req.user.id]);
  const uri = sec.totpUri(secret, req.user.username);
  res.json({ secret, uri, qr: await QR.toDataURL(uri, { margin: 1, width: 220 }) });
}));
router.post('/mfa/enable', authenticate, wrap(async (req, res) => {
  const { rows } = await db.query(`SELECT mfa_pending FROM "auth"."users" WHERE id=$1`, [req.user.id]);
  if (!rows[0].mfa_pending) throw bad('Start setup first');
  const step = sec.totpCheck(sec.decrypt(rows[0].mfa_pending), req.body.code);
  if (!step) throw bad('That code is not correct. Check your phone clock and try again.');
  await db.query(`UPDATE "auth"."users" SET mfa_secret=mfa_pending, mfa_pending=NULL, mfa_enabled=true, mfa_last_step=$1 WHERE id=$2`, [step, req.user.id]);
  await audit(null, req.user, 'MFA_ENABLED', 'auth', req.user.id, null, req.ip);
  res.json({ ok: true });
}));
router.post('/mfa/disable', authenticate, wrap(async (req, res) => {
  if (req.user.mfaRequired || MFA_ROLES.includes(String(req.user.role_name).toLowerCase())) throw bad('Two-factor authentication is mandatory for your role');
  const { rows } = await db.query(`SELECT password_hash, mfa_secret, mfa_last_step FROM "auth"."users" WHERE id=$1`, [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.password || ''), rows[0].password_hash))) throw bad('Password is wrong');
  if (!sec.totpCheck(sec.decrypt(rows[0].mfa_secret), req.body.code, rows[0].mfa_last_step)) throw bad('Authenticator code is wrong');
  await db.query(`UPDATE "auth"."users" SET mfa_secret=NULL, mfa_pending=NULL, mfa_enabled=false WHERE id=$1`, [req.user.id]);
  await audit(null, req.user, 'MFA_DISABLED', 'auth', req.user.id, null, req.ip);
  res.json({ ok: true });
}));
/** admin: reset a user's MFA (lost phone) */
router.post('/mfa/reset/:id', authenticate, wrap(async (req, res) => {
  if (!req.user.perms.has('users.edit')) throw new HttpError(403, 'Not allowed');
  const t = (await db.query(`SELECT u.id, r.name AS role FROM "auth"."users" u JOIN "auth"."roles" r ON r.id=u.role_id WHERE u.id=$1`, [Number(req.params.id) || 0])).rows[0];
  if (!t) throw new HttpError(404, 'User not found');
  if (t.role === 'Super Admin' && req.user.role_name !== 'Super Admin') throw new HttpError(403, 'Only a Super Admin can reset a Super Admin');
  await db.query(`UPDATE "auth"."users" SET mfa_secret=NULL, mfa_pending=NULL, mfa_enabled=false WHERE id=$1`, [t.id]);
  await db.query(`UPDATE "auth"."sessions" SET revoked=true WHERE user_id=$1`, [t.id]);
  await audit(null, req.user, 'MFA_RESET', 'auth', t.id, null, req.ip);
  res.json({ ok: true });
}));

router.get('/me', authenticate, wrap(async (req, res) => {
  const u = req.user;
  const has = (p) => (p === 'portal.use' && !u.patient_id) ? false : u.perms.has(p);
  res.json({
    user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role_name, role_id: u.role_id, patient_id: u.patient_id, isPortal: u.isPortal, must_change_password: u.mustChange, mfa_enabled: u.mfaEnabled, mfa_required: u.mfaRequired },
    permissions: [...u.perms],
    menu: reg.buildMenu(has),
  });
}));

router.post('/change-password', authenticate, wrap(async (req, res) => {
  const { current_password, new_password } = req.body;
  const pp = sec.passwordProblem(new_password, req.user.username);
  if (pp) throw bad(pp);
  const { rows } = await db.query(`SELECT password_hash FROM "auth"."users" WHERE id=$1`, [req.user.id]);
  if (!(await bcrypt.compare(String(current_password || ''), rows[0].password_hash))) throw bad('Current password is wrong');
  if (String(current_password) === String(new_password)) throw bad('Choose a different password from the current one');
  await db.query(`UPDATE "auth"."users" SET password_hash=$1, must_change_password=false, password_changed_at=now(), updated_at=now() WHERE id=$2`, [await bcrypt.hash(String(new_password), 10), req.user.id]);
  await db.query(`UPDATE "auth"."sessions" SET revoked=true WHERE user_id=$1 AND id<>$2`, [req.user.id, req.user.sid]); // sign out everywhere else
  await audit(null, req.user, 'PASSWORD_CHANGE', 'auth', req.user.id, null, req.ip);
  res.json({ ok: true });
}));

async function revokeUserSessions(userId, client) {
  if (!userId) return;
  await (client || db).query(`UPDATE "auth"."sessions" SET revoked=true WHERE user_id=$1`, [userId]);
}

module.exports = { router, authenticate, clearPermCache, revokeUserSessions };
