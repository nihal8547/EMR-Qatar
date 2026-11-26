'use strict';
/** Shared security helpers: password policy, TOTP (RFC 6238), AES-256-GCM secrets, rate limiter, SSRF guard. */
const crypto = require('crypto');

const PROD = process.env.NODE_ENV === 'production';

/* ---------- password policy ---------- */
const COMMON = new Set(['password', 'password1', 'password123', 'qwerty123', 'admin12345', 'letmein123', 'welcome123', '1234567890', 'iloveyou12']);
function passwordProblem(pw, username) {
  pw = String(pw || '');
  if (pw.length < 10) return 'Password must be at least 10 characters';
  if (pw.length > 128) return 'Password is too long (max 128)';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers';
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common';
  if (username && pw.toLowerCase().includes(String(username).toLowerCase()) && String(username).length >= 3) return 'Password must not contain the username';
  return null;
}

/* ---------- TOTP ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function b32dec(s) {
  let bits = '';
  for (const c of String(s).replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; bits += i.toString(2).padStart(5, '0'); }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
const newTotpSecret = () => b32enc(crypto.randomBytes(20));
function hotp(secret, counter) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
/** returns the matched time-step (for replay protection) or null */
function totpCheck(secret, code, lastStep = 0, now = Date.now()) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const d of [-1, 0, 1]) {
    const s = step + d;
    if (s <= Number(lastStep || 0)) continue;
    const a = Buffer.from(hotp(secret, s)), b = Buffer.from(code);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return s;
  }
  return null;
}
const totpUri = (secret, label, issuer = 'Qatar HMS') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/* ---------- AES-256-GCM for secrets at rest ---------- */
function encKey() {
  const base = process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-secret-change-me';
  return crypto.createHash('sha256').update('hms-enc:' + base).digest();
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function decrypt(s) {
  s = String(s || '');
  if (!s.startsWith('enc:v1:')) return s; // legacy plaintext
  try {
    const raw = Buffer.from(s.slice(7), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

/* ---------- global rate limiter (per IP, sliding window, in-memory) ---------- */
function rateLimit({ windowMs = 60000, max = 600, name = 'rl' } = {}) {
  const hits = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (n - v.at > windowMs) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = req.ip || 'x', n = Date.now();
    let v = hits.get(k);
    if (!v || n - v.at > windowMs) { v = { at: n, c: 0 }; hits.set(k, v); }
    if (++v.c > max) { res.set('Retry-After', String(Math.ceil((v.at + windowMs - n) / 1000))); return res.status(429).json({ error: 'Too many requests. Slow down.' }); }
    next();
  };
}

/* ---------- SSRF guard for admin-configured outbound URLs ---------- */
function assertSafeUrl(u, label = 'URL') {
  let x;
  try { x = new URL(String(u)); } catch { throw Object.assign(new Error(`${label} is not a valid URL`), { status: 400 }); }
  const allowHttp = !PROD || process.env.ALLOW_INSECURE_URLS === '1';
  if (!(x.protocol === 'https:' || (allowHttp && x.protocol === 'http:'))) throw Object.assign(new Error(`${label} must use https`), { status: 400 });
  if (x.username || x.password) throw Object.assign(new Error(`${label} must not contain credentials`), { status: 400 });
  const h = x.hostname.toLowerCase();
  const meta = /^(169\.254\.|metadata\.google|100\.100\.100\.200)/.test(h) || h === 'metadata';
  const priv = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/.test(h) || h.endsWith('.internal') || h.endsWith('.local');
  if (meta || (PROD && priv && process.env.ALLOW_PRIVATE_URLS !== '1')) throw Object.assign(new Error(`${label} points to a private or metadata address`), { status: 400 });
  return x.toString().replace(/\/$/, '');
}

module.exports = { PROD, passwordProblem, newTotpSecret, totpCheck, totpUri, encrypt, decrypt, rateLimit, assertSafeUrl };
