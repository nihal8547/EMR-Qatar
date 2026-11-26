'use strict';
/** Auth hardening test: sessions, logout, password policy, forced change, MFA (TOTP), audit chain, SSRF. Needs a fresh demo DB + running server. */
const crypto = require('crypto');
const sec = require('../src/security');
const BASE = process.env.BASE || 'http://localhost:4000'; const PASS = 'Demo@12345';
let passed = 0; const failed = [];
const ok = (n, c, x) => { if (c) { passed++; console.log('  ok  ', n); } else { failed.push(n); console.log('  FAIL', n, x ? JSON.stringify(x).slice(0, 300) : ''); } };
const call = async (t, m, p, b) => { const r = await fetch(`${BASE}/api${p}`, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.text(); let d; try { d = JSON.parse(x); } catch { d = x; } return { status: r.status, data: d }; };
const login = (u, p = PASS, code) => call(null, 'POST', '/auth/login', { username: u, password: p, code });
(async () => {
  const adm = (await login('admin')).data.token;
  // sessions
  const t1 = (await login('cashier')).data.token, t2 = (await login('cashier')).data.token;
  ok('session token works', (await call(t1, 'GET', '/auth/me')).status === 200);
  ok('logout ends session', (await call(t1, 'POST', '/auth/logout')).status === 200 && (await call(t1, 'GET', '/auth/me')).status === 401);
  ok('other session still valid after single logout', (await call(t2, 'GET', '/auth/me')).status === 200);
  ok('old token without sid rejected', (await call(require('jsonwebtoken').sign({ uid: 1 }, process.env.JWT_SECRET || 'dev-secret-change-me'), 'GET', '/auth/me')).status === 401);
  const t3 = (await login('cashier')).data.token;
  await call(t3, 'POST', '/auth/logout-all');
  ok('logout-all revokes every session', (await call(t2, 'GET', '/auth/me')).status === 401 && (await call(t3, 'GET', '/auth/me')).status === 401);
  // password policy + change
  const tk = (await login('manager')).data.token;
  for (const [pw, why] of [['short1', 'too short'], ['onlyletterslong', 'no digit'], ['1234567890', 'no letter'], ['Password123', 'common'], ['my-manager-77x', 'contains username']]) {
    ok(`policy rejects ${why}`, (await call(tk, 'POST', '/auth/change-password', { current_password: PASS, new_password: pw })).status === 400);
  }
  ok('same password refused', (await call(tk, 'POST', '/auth/change-password', { current_password: PASS, new_password: PASS })).status === 400);
  const other = (await login('manager')).data.token;
  ok('change password ok', (await call(tk, 'POST', '/auth/change-password', { current_password: PASS, new_password: 'Str0ng-Passphrase-77' })).status === 200);
  ok('other sessions signed out after change', (await call(other, 'GET', '/auth/me')).status === 401);
  ok('old password no longer works', (await login('manager')).status === 401);
  ok('new password works', (await login('manager', 'Str0ng-Passphrase-77')).status === 200);
  // admin creates user -> weak refused, strong -> must change
  const roles = (await call(adm, 'GET', '/r/roles?limit=50')).data.rows; const rid = roles.find((r) => r.name === 'Cashier').id;
  ok('admin cannot set weak password', (await call(adm, 'POST', '/r/users', { username: 'newcash', full_name: 'New Cash', role_id: rid, password: 'abc12345' })).status === 400);
  const mk = await call(adm, 'POST', '/r/users', { username: 'newcash', full_name: 'New Cash', role_id: rid, password: 'Temp-Pass-2026x' });
  ok('admin creates user with policy-compliant password', mk.status === 201 || mk.status === 200, mk);
  const nt = (await login('newcash', 'Temp-Pass-2026x')).data.token;
  const me = (await call(nt, 'GET', '/auth/me')).data;
  ok('new user flagged must_change_password', me.user && me.user.must_change_password === true, me);
  const blocked = await call(nt, 'GET', '/r/patients?limit=1');
  ok('data API blocked until password changed', blocked.status === 403 && blocked.data.code === 'PASSWORD_CHANGE_REQUIRED', blocked);
  ok('user sets own password', (await call(nt, 'POST', '/auth/change-password', { current_password: 'Temp-Pass-2026x', new_password: 'Own-Secret-Pass-9' })).status === 200);
  ok('then data API open', (await call(nt, 'GET', '/r/patients?limit=1')).status === 200);
  // MFA
  const mt = (await login('accountant')).data.token;
  const st = await call(mt, 'POST', '/auth/mfa/setup');
  ok('mfa setup returns secret + QR', st.status === 200 && /^[A-Z2-7]{32}$/.test(st.data.secret) && st.data.qr.startsWith('data:image/png'), st.data && Object.keys(st.data));
  const secret = st.data.secret;
  ok('enable with wrong code refused', (await call(mt, 'POST', '/auth/mfa/enable', { code: '000000' })).status === 400);
  const now = Date.now();
  const { createHmac } = crypto; const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const dec = (s) => { let bits = ''; for (const ch of s) bits += B32.indexOf(ch).toString(2).padStart(5, '0'); const by = []; for (let i = 0; i + 8 <= bits.length; i += 8) by.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(by); };
  const gen = (sc, step) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(step)); const h = createHmac('sha1', dec(sc)).update(b).digest(); const o = h[19] & 15; return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
  const step0 = Math.floor(now / 30000);
  ok('enable with correct code', (await call(mt, 'POST', '/auth/mfa/enable', { code: gen(secret, step0) })).status === 200);
  ok('login without code asks for it', (await login('accountant')).data.mfa_required === true);
  ok('login with wrong code refused', (await login('accountant', PASS, '123456')).status === 401);
  ok('replay of already-used code refused', (await login('accountant', PASS, gen(secret, step0))).status === 401);
  const r = await login('accountant', PASS, gen(secret, step0 + 1));
  ok('login with next-step code works', r.status === 200 && !!r.data.token, r.data);
  ok('/me shows mfa_enabled', (await call(r.data.token, 'GET', '/auth/me')).data.user.mfa_enabled === true);
  ok('non-admin cannot reset MFA', (await call(r.data.token, 'POST', '/auth/mfa/reset/1')).status === 403);
  const uid = (await call(adm, 'GET', '/r/users?q=accountant')).data.rows[0].id;
  ok('admin resets MFA', (await call(adm, 'POST', `/auth/mfa/reset/${uid}`)).status === 200 && (await login('accountant')).status === 200);
  // audit chain
  const v = await call(adm, 'GET', '/admin/audit-verify');
  ok('audit chain verifies', v.status === 200 && v.data.ok === true && v.data.checked > 10, v.data);
  // security helpers
  ok('SSRF: metadata blocked', (() => { try { sec.assertSafeUrl('http://169.254.169.254/'); return false; } catch { return true; } })());
  ok('SSRF: credentials in URL blocked', (() => { try { sec.assertSafeUrl('https://a:b@x.com'); return false; } catch { return true; } })());
  ok('encrypt/decrypt roundtrip + tamper', sec.decrypt(sec.encrypt('k-123')) === 'k-123' && sec.decrypt(sec.encrypt('k-123').slice(0, -3) + 'AAA') === '');
  ok('config rejects metadata URL', (await call(adm, 'PUT', '/whatsapp/config', { evolution_base_url: 'http://169.254.169.254' })).status === 400);
  console.log(`\n${passed} passed, ${failed.length} failed`); if (failed.length) { console.log('Failed:\n - ' + failed.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
