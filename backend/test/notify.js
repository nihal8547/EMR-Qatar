'use strict';
/** WhatsApp/n8n integration test with a mock n8n. Server must run with N8N_WEBHOOK_SECRET=testsecret on a fresh demo DB. */
const http = require('http');
const BASE = process.env.BASE || 'http://localhost:4000'; const PASS = 'Demo@12345'; const SECRET = process.env.N8N_WEBHOOK_SECRET || 'testsecret';
let passed = 0; const failed = []; const got = [];
const ok = (n, c, x) => { if (c) { passed++; console.log('  ok  ', n); } else { failed.push(n); console.log('  FAIL', n, x ? JSON.stringify(x).slice(0, 300) : ''); } };
const call = async (t, m, p, b) => { const r = await fetch(`${BASE}/api${p}`, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.text(); let d; try { d = JSON.parse(x); } catch { d = x; } return { status: r.status, data: d }; };
const login = async (u) => (await call(null, 'POST', '/auth/login', { username: u, password: PASS })).data.token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mode = 'ok';
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
  got.push({ path: req.url, secret: req.headers['x-hms-secret'], body: JSON.parse(b || '{}') });
  res.writeHead(mode === 'ok' ? 200 : 500, { 'content-type': 'application/json' }); res.end(JSON.stringify(mode === 'ok' ? { ok: true } : { ok: false, error: 'evolution down' })); }); });

(async () => {
  await new Promise((r) => mock.listen(5678, r));
  const adm = await login('admin'); const rec = await login('reception'); const lab = await login('lab'); const cash = await login('cashier'); const pat = await login('patient');
  const set = async (key, value) => { const l = await call(adm, 'GET', `/r/settings?q=${key}&limit=50`); const row = (l.data.rows || l.data.items || l.data).find((x) => x.key === key); return call(adm, 'PUT', `/r/settings/${row.id}`, { ...row, value }); };
  console.log('\n== Switched off by default');
  const st0 = await call(adm, 'GET', '/notify/status'); ok('status endpoint works', st0.status === 200 && st0.data.enabled === false, st0.data);
  ok('patient role cannot send', (await call(pat, 'POST', '/notify/send', { type: 'welcome', patient_id: 1 })).status === 403);
  const off = await call(rec, 'POST', '/notify/send', { type: 'welcome', patient_id: 1 }); ok('manual send refused while disabled', off.status === 502 && off.data.status === 'disabled', off.data);

  await set('n8n_enabled', 'true'); await set('n8n_webhook_base', 'http://localhost:5678/webhook/hms'); await set('public_base_url', BASE);
  console.log('\n== Registration → welcome');
  const np = await call(rec, 'POST', '/r/patients', { full_name: 'Notify Test Patient', dob: '1990-02-02', gender: 'Female', phone: '55123456', qid: '29012345671', language: 'Arabic' });
  ok('patient registered', np.status === 201, np.data);
  await sleep(2500);
  const w = got.find((g) => g.body.event === 'patient.registered' && g.body.patient.name === 'Notify Test Patient');
  ok('welcome event sent to the right webhook path', w && w.path === '/webhook/hms/patient-registered', got.map((g) => g.path));
  ok('secret header present', w && w.secret === SECRET);
  ok('phone normalised with +974', w && w.body.patient.phone === '97455123456', w && w.body.patient);
  ok('language passed', w && w.body.patient.language === 'Arabic');
  const nPrev = got.length;
  const again = await call(rec, 'POST', '/notify/send', { type: 'welcome', patient_id: np.data.id }); ok('manual welcome re-send works', again.status === 200 && got.length === nPrev + 1, again.data);

  console.log('\n== Opt-out and no phone');
  await call(adm, 'PUT', `/r/patients/${np.data.id}`, { ...np.data, whatsapp_ok: false });
  const oo = await call(rec, 'POST', '/notify/send', { type: 'welcome', patient_id: np.data.id }); ok('opted-out patient is not messaged', oo.status === 409 && oo.data.status === 'opted-out', oo.data);
  const np2 = await call(rec, 'POST', '/r/patients', { full_name: 'No Phone Person', dob: '1985-05-05', gender: 'Male', qid: '28512345678', phone: '12' });
  await sleep(2000);
  ok('auto event skipped when no phone', !got.some((g) => g.body.patient && g.body.patient.name === 'No Phone Person'));
  ok('no-phone patient created', np2.status === 201, np2.data); const np3 = await call(rec, 'POST', '/notify/send', { type: 'welcome', patient_id: np2.data.id }); ok('manual send says no phone', np3.status === 409 && np3.data.status === 'no-phone', np3.data);

  console.log('\n== Result ready (lab) -> WhatsApp');
  await call(adm, 'PUT', `/r/patients/${np.data.id}`, { ...np.data, whatsapp_ok: true });
  const sara = (await call(adm, 'GET', '/r/users?q=drsara')).data.rows[0]; const drsara = await login('drsara');
  const v = await call(rec, 'POST', '/visits/start', { patient_id: np.data.id, doctor_id: sara.id, payer_type: 'Cash', complaint: 'Check-up' }); ok('visit started', v.status === 201, v.data);
  const tests = (await call(drsara, 'GET', '/r/lab_tests?limit=50')).data.rows; const hb = tests.find((t) => t.code === 'CBC-HB'); const glu = tests.find((t) => t.code === 'GLU-R');
  const lo = await call(drsara, 'POST', `/consult/${v.data.id}/lab-orders`, { test_ids: [hb.id, glu.id], priority: 'Routine' }); ok('lab ordered', lo.status === 201, lo.data);
  const wl = await call(lab, 'GET', '/lab/worklist'); const wo = (Array.isArray(wl.data) ? wl.data : wl.data.rows).find((o) => o.full_name === 'Notify Test Patient');
  await call(lab, 'POST', `/lab/orders/${wo.id}/collect`, {});
  const items = (await call(lab, 'GET', '/lab/worklist')).data; const its = (Array.isArray(items) ? items : items.rows).find((o) => o.id === wo.id).items;
  for (const it of its) await call(lab, 'POST', `/lab/items/${it.id}/result`, { result_value: 90 });
  const early = await call(lab, 'POST', '/notify/send', { type: 'result', lab_order_id: wo.id }); ok('manual result send refused before validation (400)', early.status === 400, early.data);
  const before = got.length;
  ok('validated', (await call(lab, 'POST', `/lab/orders/${wo.id}/validate-all`, {})).status === 200);
  await sleep(2500);
  const rr = got.slice(before).find((g) => g.body.event === 'result.ready');
  ok('result-ready sent automatically on validation', rr && rr.path === '/webhook/hms/result-ready', got.slice(before));
  const doc = rr && rr.body.documents[0];
  ok('payload has lab report link', doc && doc.type === 'lab_report' && doc.url.startsWith(BASE), doc);
  const pdf = doc && await fetch(doc.url); ok('report link serves a real PDF', pdf && pdf.status === 200 && (await pdf.arrayBuffer()).byteLength > 800);
  const n2 = got.length; await call(lab, 'POST', '/notify/send', { type: 'result', lab_order_id: wo.id }); ok('manual result send works (resend)', got.length === n2 + 1);
  await call(lab, 'POST', `/lab/orders/${wo.id}/validate-all`, {}); await sleep(1800);
  ok('no duplicate auto message', got.filter((g) => g.body.event_id === 'result.ready:lab:' + wo.id).length === 2);

  console.log('\n== Bill + thanks');
  const nb = await call(cash, 'POST', '/notify/send', { type: 'bill', visit_id: v.data.id }); ok('bill refused while no invoice yet (400)', nb.status === 400, nb.data);
  const invs = (await call(adm, 'GET', '/r/invoices?limit=5')).data.rows; const inv = invs.find((i) => i.visit_id);
  const b1 = await call(cash, 'POST', '/notify/send', { type: 'bill', visit_id: inv.visit_id }); ok('bill sent or patient lacks phone (409)', b1.status === 200 || b1.status === 409, b1.data);
  if (b1.status === 200) { const bg = got[got.length - 1]; ok('bill payload carries invoice + pdf', bg.path === '/webhook/hms/bill-send' && bg.body.invoice && bg.body.documents[0].type === 'invoice', bg.body); const ip = await fetch(bg.body.documents[0].url); ok('invoice PDF served', ip.status === 200 && ip.headers.get('content-type') === 'application/pdf'); }
  const noBill = await call(cash, 'POST', '/notify/send', { type: 'bill', visit_id: 999999 }); ok('missing visit is a clean 404', noBill.status === 404, noBill.data);
  const badT = await call(adm, 'POST', '/notify/send', { type: 'x' }); ok('unknown type is 400', badT.status === 400);

  console.log('\n== Signed PDF links');
  const notify = require('../src/notify');
  const t = notify.signFile('inv', 1); const pr = await fetch(`${BASE}/api/public/f/${t}.pdf`);
  ok('valid link serves a PDF (or 404 if absent)', (pr.status === 200 && pr.headers.get('content-type') === 'application/pdf') || pr.status === 404, pr.status);
  ok('tampered link refused', (await fetch(`${BASE}/api/public/f/${t.slice(0, -2)}xx.pdf`)).status === 403);
  ok('expired link refused', (await fetch(`${BASE}/api/public/f/${notify.signFile('inv', 1, -10)}.pdf`)).status === 403);

  console.log('\n== n8n failure is reported, not hidden');
  mode = 'fail'; const f = await call(rec, 'POST', '/notify/send', { type: 'welcome', patient_id: 1 }); ok('n8n error surfaces as 502', f.status === 502 && f.data.ok === false, f.data); mode = 'ok';
  const st = await call(adm, 'GET', '/notify/status'); ok('delivery log has entries', st.data.recent.length > 0 && st.data.webhook_base && st.data.secret, st.data);
  mock.close();
  console.log(`\n${passed} passed, ${failed.length} failed`); if (failed.length) { console.log(failed.join('\n')); process.exit(1); } process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
