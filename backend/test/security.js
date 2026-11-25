'use strict';
/** Authorization / leak / robustness audit. Needs seeded DB + running API. BASE=http://localhost:4000 node test/security.js */
const BASE = process.env.BASE || 'http://localhost:4000';
const PASS = process.env.DEMO_PASSWORD || 'Demo@12345';
let passed = 0; const failed = [];
async function call(token, method, path, body, raw) {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? (raw ? body : JSON.stringify(body)) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, data: d, text: t, headers: r.headers };
}
const ok = (n, c, x) => { if (c) { passed++; } else { failed.push(n); console.log(`FAIL ${n}${x ? ' -> ' + JSON.stringify(x).slice(0, 250) : ''}`); } };
const roles = ['admin','manager','reception','nurse','drsara','drravi','lab','radiology','pharmacist','store','cashier','claims','accountant','hr','patient'];
(async () => {
  const tk = {};
  for (const r of roles) tk[r] = (await call(null, 'POST', '/auth/login', { username: r, password: PASS })).data.token;
  // 1. unauthenticated
  for (const p of ['/auth/me', '/meta', '/r/patients', '/lookup/patients', '/dashboard', '/reports', '/queue', '/admin/matrix', '/portal/summary', '/claims/list'])
    ok(`anon ${p} -> 401`, (await call(null, 'GET', p)).status === 401, (await call(null, 'GET', p)).status);
  ok('garbage token -> 401', (await call('abc.def.ghi', 'GET', '/auth/me')).status === 401);
  ok('unknown /api path -> 404 json', (await call(tk.admin, 'GET', '/nope')).status === 404);
  // 2. per role: every resource in meta; list must be allowed iff meta lists it; non-listed must 403; no password_hash anywhere
  const full = (await call(tk.admin, 'GET', '/meta')).data;
  const allKeys = Object.keys(full).filter((k) => full[k] && full[k].fields);
  ok('meta has resources', allKeys.length > 50, allKeys.length);
  for (const r of roles) {
    const m = (await call(tk[r], 'GET', '/meta')).data;
    const mine = new Set(Object.keys(m).filter((k) => m[k] && m[k].fields));
    for (const k of allKeys) {
      const res = await call(tk[r], 'GET', `/r/${k}?limit=2`);
      const should = mine.has(k) && !(r === 'patient');
      if (should) ok(`${r} list ${k} allowed`, res.status === 200, res.status);
      else ok(`${r} list ${k} denied`, res.status === 403, res.status);
      if (res.status === 200) ok(`${r} ${k} no password_hash leak`, !/password_hash|\$2[aby]\$/.test(res.text));
      const lk = await call(tk[r], 'GET', `/lookup/${k}?limit=1`);
      if (!mine.has(k) || r === 'patient') ok(`${r} lookup ${k} denied`, lk.status === 403 || lk.status === 404, lk.status);
      if (lk.status === 200) ok(`${r} lookup ${k} no hash`, !/password_hash/.test(lk.text));
      // writes by non-privileged: create must never 500
      const w = await call(tk[r], 'POST', `/r/${k}`, {});
      ok(`${r} POST ${k} {} no 5xx`, w.status < 500, [w.status, w.data]);
    }
  }
  // 3. privilege escalation
  const adminRole = (await call(tk.admin, 'GET', '/lookup/roles')).data;
  const rl = Array.isArray(adminRole) ? adminRole : adminRole.rows || adminRole.items || [];
  const sa = rl.find((x) => (x.label || x.name) === 'Super Admin');
  const me = (await call(tk.hr, 'GET', '/auth/me')).data.user || (await call(tk.hr, 'GET', '/auth/me')).data;
  if (sa) {
    const esc = await call(tk.hr, 'PUT', `/r/users/${me.id}`, { role_id: sa.id });
    ok('hr cannot self-promote to Super Admin', esc.status === 403 || esc.status === 400, esc);
    const mk = await call(tk.hr, 'POST', '/r/users', { username: 'evil1', full_name: 'Evil', role_id: sa.id, password: 'Password1!' });
    ok('hr cannot create Super Admin', mk.status === 403 || mk.status === 400, mk);
  }
  const adm = (await call(tk.admin, 'GET', '/auth/me')).data; const aid = (adm.user || adm).id;
  ok('admin cannot delete self', (await call(tk.admin, 'DELETE', `/r/users/${aid}`)).status === 409);
  ok('admin cannot deactivate self', (await call(tk.admin, 'PUT', `/r/users/${aid}`, { active: false })).status === 400);
  ok('non-admin cannot edit role matrix', (await call(tk.hr, 'PUT', '/admin/roles/1/permissions', { permissions: [] })).status === 403);
  // 4. portal isolation
  const pat = await call(tk.patient, 'GET', '/portal/summary');
  ok('patient portal ok', pat.status === 200, pat.status);
  for (const p of ['/queue', '/consult/list', '/dashboard', '/reports', '/billing/worklist', '/claims/list', '/admin/matrix', '/patients/1/360'])
    ok(`patient ${p} denied`, [401, 403, 404].includes((await call(tk.patient, 'GET', p)).status), (await call(tk.patient, 'GET', p)).status);
  // 5. doctor consult list scoped to self even with doctor_id param
  const a = await call(tk.drsara, 'GET', '/consult/list?doctor_id=999'); const b = await call(tk.drsara, 'GET', '/consult/list');
  ok('doctor cannot read other doctor list', JSON.stringify(a.data) === JSON.stringify(b.data));
  // 6. fuzz: malformed input must not 5xx
  const bads = ['abc', '-1', '0', '99999999999999999999', "1;DROP TABLE x", '%00', '1e9'];
  for (const k of ['patients', 'visits', 'invoices', 'users', 'items']) {
    for (const v of bads) {
      for (const p of [`/r/${k}/${encodeURIComponent(v)}`, `/r/${k}?limit=${encodeURIComponent(v)}&page=${encodeURIComponent(v)}`, `/r/${k}?search=${encodeURIComponent(v)}&sort=${encodeURIComponent(v)}`, `/r/${k}?id=${encodeURIComponent(v)}`]) {
        const x = await call(tk.admin, 'GET', p); ok(`fuzz GET ${p} no 5xx`, x.status < 500, [x.status, x.data]);
      }
    }
  }
  for (const body of ['{bad json', '[]', 'null', '"str"', '123']) {
    const x = await call(tk.admin, 'POST', '/r/patients', body, true); ok(`bad body ${body} no 5xx`, x.status < 500, [x.status, x.data]);
  }
  const big = await call(tk.admin, 'POST', '/r/patients', { full_name: 'x'.repeat(5000), mobile: '1'.repeat(500) });
  ok('oversized fields no 5xx', big.status < 500, [big.status, big.data]);
  const inj = await call(tk.admin, 'GET', `/r/patients?search=${encodeURIComponent("' OR 1=1 --")}`);
  ok('sql-injection search no 5xx', inj.status < 500);
  ok('login injection rejected', (await call(null, 'POST', '/auth/login', { username: "admin' OR '1'='1", password: 'x' })).status === 401);
  ok('login non-string -> 4xx', (await call(null, 'POST', '/auth/login', { username: { $ne: 1 }, password: [] })).status < 500);
  // 7. headers + error leakage
  const h = await call(tk.admin, 'GET', '/auth/me');
  ok('nosniff header', h.headers.get('x-content-type-options') === 'nosniff');
  ok('no x-powered-by', !h.headers.get('x-powered-by'));
  const e = await call(tk.admin, 'GET', '/r/patients/abc');
  ok('error has no stack/SQL', !/at .*\.js|SELECT |pg_|node_modules/.test(e.text), e.text.slice(0, 200));
  ok('login response has no hash', !/password_hash/.test(JSON.stringify((await call(null, 'POST', '/auth/login', { username: 'admin', password: PASS })).data)));
  console.log(`\nsecurity: ${passed} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
