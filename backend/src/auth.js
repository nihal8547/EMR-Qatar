'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const reg = require('./registry');
const { wrap, bad, HttpError, audit } = require('./lib');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('JWT_SECRET must be set when NODE_ENV=production. Refusing to start.');
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
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.full_name, u.role_id, u.patient_id, u.active, u.is_deleted,
              r.name AS role_name, r.restrict_to_own_visits, r.discount_limit_pct
         FROM "auth"."users" u JOIN "auth"."roles" r ON r.id = u.role_id WHERE u.id = $1`, [payload.uid]);
    const u = rows[0];
    if (!u || u.is_deleted || !u.active) throw new HttpError(401, 'Account disabled');
    req.user = {
      id: u.id, username: u.username, full_name: u.full_name, role_id: u.role_id, role_name: u.role_name,
      patient_id: u.patient_id, restrict: !!u.restrict_to_own_visits, discount_limit: Number(u.discount_limit_pct || 0),
      isPortal: u.role_name === 'Patient',
      perms: await rolePerms(u.role_id),
    };
    next();
  } catch (e) { next(e); }
}

/* very small in-memory login throttle: 8 failures / 5 min per username+ip */
const fails = new Map();
function throttled(key) {
  const now = Date.now();
  const arr = (fails.get(key) || []).filter((t) => now - t < 5 * 60 * 1000);
  fails.set(key, arr);
  return arr.length >= 8;
}

const router = express.Router();

router.post('/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) throw bad('Enter username and password');
  const key = `${username}|${req.ip}`;
  if (throttled(key)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
  const { rows } = await db.query(
    `SELECT id, username, password_hash, active, is_deleted FROM "auth"."users" WHERE lower(username)=$1`, [username]);
  const u = rows[0];
  const ok = u && !u.is_deleted && u.password_hash && (await bcrypt.compare(password, u.password_hash));
  if (!ok) {
    fails.get(key).push(Date.now());
    await audit(null, { username, id: null }, 'LOGIN_FAILED', 'auth', null, null, req.ip);
    throw new HttpError(401, 'Wrong username or password');
  }
  if (!u.active) throw new HttpError(403, 'This account is disabled');
  await db.query(`UPDATE "auth"."users" SET last_login=now() WHERE id=$1`, [u.id]);
  await audit(null, { username: u.username, id: u.id }, 'LOGIN', 'auth', u.id, null, req.ip);
  const token = jwt.sign({ uid: u.id }, SECRET, { expiresIn: '8h' });
  res.json({ token });
}));

router.get('/me', authenticate, wrap(async (req, res) => {
  const u = req.user;
  const has = (p) => (p === 'portal.use' && !u.patient_id) ? false : u.perms.has(p);
  res.json({
    user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role_name, role_id: u.role_id, patient_id: u.patient_id, isPortal: u.isPortal },
    permissions: [...u.perms],
    menu: reg.buildMenu(has),
  });
}));

router.post('/change-password', authenticate, wrap(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || String(new_password).length < 8) throw bad('New password must be at least 8 characters');
  const { rows } = await db.query(`SELECT password_hash FROM "auth"."users" WHERE id=$1`, [req.user.id]);
  if (!(await bcrypt.compare(String(current_password || ''), rows[0].password_hash))) throw bad('Current password is wrong');
  await db.query(`UPDATE "auth"."users" SET password_hash=$1, updated_at=now() WHERE id=$2`, [await bcrypt.hash(String(new_password), 10), req.user.id]);
  await audit(null, req.user, 'PASSWORD_CHANGE', 'auth', req.user.id, null, req.ip);
  res.json({ ok: true });
}));

module.exports = { router, authenticate, clearPermCache };
