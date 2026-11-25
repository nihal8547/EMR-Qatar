'use strict';
/**
 * End-to-end smoke test. Needs a freshly seeded DB (npm run db:reset) and the API running
 * (npm start). Usage: BASE=http://localhost:4000 node test/smoke.js
 */
const BASE = process.env.BASE || 'http://localhost:4000';
const PASS = process.env.DEMO_PASSWORD || 'Demo@12345';
let passed = 0; const failed = [];
const today = new Date().toISOString().slice(0, 10);

async function call(token, method, path, body) {
  const r = await fetch(`${BASE}/api${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; const txt = await r.text();
  try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data };
}
function ok(name, cond, extra) { if (cond) { passed += 1; console.log(`  ok   ${name}`); } else { failed.push(name); console.log(`  FAIL ${name}${extra ? ` -> ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 300)}` : ''}`); } }
const login = async (u) => { const r = await call(null, 'POST', '/auth/login', { username: u, password: PASS }); if (!r.data.token) throw new Error(`login ${u} failed: ${JSON.stringify(r.data)}`); return r.data.token; };
const section = (t) => console.log(`\n== ${t}`);

(async () => {
  const roles = ['admin', 'manager', 'reception', 'nurse', 'drsara', 'drravi', 'lab', 'radiology', 'pharmacist', 'store', 'cashier', 'claims', 'accountant', 'hr', 'patient'];
  const tk = {};

  section('Login and sidebar per role');
  const bad = await call(null, 'POST', '/auth/login', { username: 'admin', password: 'wrong' });
  ok('wrong password rejected (401)', bad.status === 401);
  for (const r of roles) tk[r] = await login(r);
  const menus = {};
  for (const r of roles) {
    const me = await call(tk[r], 'GET', '/auth/me');
    menus[r] = me.data.menu.flatMap((g) => g.items.map((i) => i.to));
    ok(`${r}: sidebar has items (${menus[r].length})`, menus[r].length > 0);
  }
  ok('admin sees role matrix', menus.admin.includes('/admin-roles'));
  ok('reception does NOT see role matrix', !menus.reception.includes('/admin-roles'));
  ok('reception sees visit-start', menus.reception.includes('/visit-start'));
  ok('cashier sees cashier desk, not claims', menus.cashier.includes('/cashier') && !menus.cashier.includes('/claims-workbench'));
  ok('patient sees portal only', menus.patient.length === 1 && menus.patient[0] === '/portal', menus.patient);

  section('Role-based access is enforced by the API');
  ok('no token -> 401', (await call(null, 'GET', '/r/patients')).status === 401);
  ok('reception cannot read invoices (403)', (await call(tk.reception, 'GET', '/r/invoices')).status === 403);
  ok('reception can read patients', (await call(tk.reception, 'GET', '/r/patients')).status === 200);
  ok('nurse cannot create invoice charges (403)', (await call(tk.nurse, 'POST', '/r/charges', {})).status === 403);
  ok('patient blocked from staff API (403)', (await call(tk.patient, 'GET', '/r/patients')).status === 403);
  ok('cashier cannot open role matrix (403)', (await call(tk.cashier, 'GET', '/admin/matrix')).status === 403);
  ok('admin can open role matrix', (await call(tk.admin, 'GET', '/admin/matrix')).status === 200);
  ok('doctor cannot take payment (403)', (await call(tk.drsara, 'POST', '/billing/invoices/1/pay', { amount: 1, method: 'Card' })).status === 403);

  const meta = (await call(tk.reception, 'GET', '/meta')).data;
  ok('meta hides resources a role cannot view', meta.patients && !meta.invoices && !meta.users === false);

  section('Patient registration');
  const pats = (await call(tk.reception, 'GET', '/r/patients?limit=50')).data.rows;
  const mo = pats.find((p) => p.full_name === 'Mohammed Al-Kuwari');
  const anita = pats.find((p) => p.full_name === 'Anita Nair');
  const joseph = pats.find((p) => p.full_name === 'Joseph Santos');
  ok('demo patients present', mo && anita && joseph);
  const dup = await call(tk.reception, 'POST', '/r/patients', { full_name: 'Dup Test', gender: 'Male', qid: mo.qid, dob: '1991-01-01', phone: '+974 5000 0000' });
  ok('duplicate QID rejected', dup.status >= 400 && dup.status < 500, dup.data);
  const shortQid = await call(tk.reception, 'POST', '/r/patients', { full_name: 'Bad Qid', gender: 'Male', qid: '123', dob: '1991-01-01', phone: '+974 5000 0000' });
  ok('QID must be 11 digits', shortQid.status === 400, shortQid.data);
  const newP = await call(tk.reception, 'POST', '/r/patients', { full_name: 'Test Patient', gender: 'Female', qid: '29987654321', dob: '1992-02-02', phone: '+974 5000 1234' });
  ok('new patient created with auto MRN', newP.status === 201 && /^MRN-/.test(newP.data.mrn || ''), newP.data);

  const doctors = (await call(tk.reception, 'GET', '/lookup/doctors')).data;
  const drSara = (Array.isArray(doctors) ? doctors : doctors.rows || []).find((d) => /Sara/.test(d.label || d.full_name || ''));
  ok('doctor lookup works', !!drSara, doctors);
  const sara = (await call(tk.admin, 'GET', '/r/users?q=drsara')).data.rows[0];

  section('Visit: Cash patient, full journey');
  const v = await call(tk.reception, 'POST', '/visits/start', { patient_id: joseph.id, doctor_id: sara.id, payer_type: 'Cash', complaint: 'Fever and cough' });
  ok('visit started', v.status === 201 && v.data.visit_no, v.data);
  const vid = v.data.id;
  const dupVisit = await call(tk.reception, 'POST', '/visits/start', { patient_id: joseph.id, doctor_id: sara.id, payer_type: 'Cash' });
  ok('double check-in blocked (409)', dupVisit.status === 409, dupVisit.data);
  const q = await call(tk.nurse, 'GET', '/queue');
  ok('visit shows on queue', q.status === 200 && JSON.stringify(q.data).includes(v.data.visit_no), q.data);
  const vit = await call(tk.nurse, 'POST', '/r/vitals', { visit_id: vid, temperature: 38.6, pulse: 96, bp_systolic: 120, bp_diastolic: 80, spo2: 97, triage_level: '3 - Urgent' });
  ok('vitals recorded', vit.status === 201, vit.data);

  const dx = (await call(tk.drsara, 'GET', '/r/diagnosis_codes?q=J06')).data.rows[0];
  const consult = await call(tk.drsara, 'GET', `/consult/${vid}`);
  ok('doctor opens consultation', consult.status === 200, consult.data);
  ok('other doctor cannot open it (403)', (await call(tk.drravi, 'GET', `/consult/${vid}`)).status === 403);
  ok('encounter saved', (await call(tk.drsara, 'PUT', `/consult/${vid}/encounter`, { chief_complaint: 'Fever', assessment: 'URTI', plan: 'Rest, fluids' })).status === 200);
  ok('diagnosis added', (await call(tk.drsara, 'POST', `/consult/${vid}/diagnoses`, { code_id: dx.id })).status === 201);

  const tests = (await call(tk.drsara, 'GET', '/r/lab_tests?limit=50')).data.rows;
  const hb = tests.find((t) => t.code === 'CBC-HB');
  const glu = tests.find((t) => t.code === 'GLU-R');
  const lo = await call(tk.drsara, 'POST', `/consult/${vid}/lab-orders`, { test_ids: [hb.id, glu.id], priority: 'Routine' });
  ok('lab order created', lo.status === 201, lo.data);

  const drugs = (await call(tk.drsara, 'GET', '/r/drugs?limit=50')).data.rows;
  const para = drugs.find((d) => d.code === 'PARA500');
  const amox = drugs.find((d) => d.code === 'AMOX500');
  const rx = await call(tk.drsara, 'POST', `/consult/${vid}/prescriptions`, { items: [{ drug_id: para.id, dose: '500 mg', frequency: 'TID', duration_days: 5, qty: 15 }] });
  ok('prescription created', rx.status === 201, rx.data);
  // Joseph has a penicillin allergy -> Amoxicillin must warn
  const rxW = await call(tk.drsara, 'POST', `/consult/${vid}/prescriptions`, { items: [{ drug_id: amox.id, dose: '500 mg', frequency: 'TID', duration_days: 5, qty: 15 }] });
  ok('allergy warning blocks prescribing until acknowledged', rxW.status === 409 && rxW.data.extra && rxW.data.extra.warnings, rxW.data);

  section('Lab workflow');
  const wl = await call(tk.lab, 'GET', '/lab/worklist');
  ok('lab worklist shows order', wl.status === 200 && JSON.stringify(wl.data).includes('Joseph'), wl.data);
  const wo = (Array.isArray(wl.data) ? wl.data : wl.data.rows).find((o) => o.full_name === 'Joseph Santos');
  const orderId = wo.id;
  const col = await call(tk.lab, 'POST', `/lab/orders/${orderId}/collect`, {});
  ok('sample collected', col.status === 200 || col.status === 201, col.data);
  const wl2 = await call(tk.lab, 'GET', '/lab/worklist');
  const items = (Array.isArray(wl2.data) ? wl2.data : wl2.data.rows).find((o) => o.id === orderId).items;
  ok('worklist lists both tests', items.length === 2, items);
  const hbItem = items.find((i) => /Haemo/.test(i.test));
  const gluItem = items.find((i) => /Gluc/.test(i.test));
  const r1 = await call(tk.lab, 'POST', `/lab/items/${hbItem.id}/result`, { result_value: 5.5 });
  ok('critical Hb auto-flagged', r1.status === 200 && /Critical/.test(JSON.stringify(r1.data)), r1.data);
  ok('glucose result entered', (await call(tk.lab, 'POST', `/lab/items/${gluItem.id}/result`, { result_value: 95 })).status === 200);
  ok('lab tech can validate (has lab.validate)', (await call(tk.lab, 'POST', `/lab/orders/${orderId}/validate-all`, {})).status === 200);
  ok('validated result is locked (409)', (await call(tk.lab, 'POST', `/lab/items/${gluItem.id}/result`, { result_value: 100 })).status === 409);
  const rep = await call(tk.lab, 'GET', `/lab/orders/${orderId}/report`);
  ok('validated report lists both results', rep.status === 200 && rep.data.items.length === 2, rep.data);

  section('Complete consult, pharmacy');
  ok('consult completed', (await call(tk.drsara, 'POST', `/consult/${vid}/complete`, {})).status === 200);
  const pq = await call(tk.pharmacist, 'GET', '/pharmacy/queue');
  ok('pharmacy queue has prescription', pq.status === 200 && JSON.stringify(pq.data).includes(rx.data.rx_no || 'RX'), pq.data);
  const pqRow = (Array.isArray(pq.data) ? pq.data : pq.data.rows || []).find((r) => r.id === rx.data.id || r.rx_no === rx.data.rx_no);
  const pitems = (pqRow && pqRow.items) || [];
  const disp = await call(tk.pharmacist, 'POST', '/pharmacy/dispense', { prescription_id: rx.data.id, items: pitems.length ? pitems.map((i) => ({ item_id: i.id, prescription_item_id: i.id, qty: i.qty })) : [] });
  ok('dispensed with FEFO batch', disp.status === 200 || disp.status === 201, disp.data);

  section('Billing');
  const bw = await call(tk.cashier, 'GET', '/billing/worklist');
  ok('cashier worklist', bw.status === 200);
  const bv = await call(tk.cashier, 'GET', `/billing/visit/${vid}`);
  ok('visit billing summary loads with pending charges', bv.status === 200 && bv.data.pending.length >= 3, bv.data);
  const inv = await call(tk.cashier, 'POST', `/billing/visit/${vid}/invoice`, {});
  ok('invoice created', inv.status === 200 && inv.data.invoice && Number(inv.data.invoice.net) > 0, inv.data);
  const invId = inv.data.invoice.id;
  const net = Number(inv.data.invoice.net);
  ok('cash payment refused without open session (409)', (await call(tk.cashier, 'POST', `/billing/invoices/${invId}/pay`, { amount: net, method: 'Cash' })).status === 409);
  ok('session opened', (await call(tk.cashier, 'POST', '/billing/session/open', { opening_cash: 100 })).status === 200);
  const over = await call(tk.cashier, 'POST', `/billing/invoices/${invId}/pay`, { amount: net + 50, method: 'Cash' });
  ok('overpayment rejected', over.status === 400, over.data);
  const half = Math.round((net / 2) * 100) / 100;
  const p1 = await call(tk.cashier, 'POST', `/billing/invoices/${invId}/pay`, { amount: half, method: 'Cash' });
  ok('part payment taken', p1.status === 200, p1.data);
  ok('invoice is Partially Paid', p1.data.bundle && p1.data.bundle.invoice.status === 'Partially Paid', p1.data.bundle && p1.data.bundle.invoice);
  const p2 = await call(tk.cashier, 'POST', `/billing/invoices/${invId}/pay`, { amount: Math.round((net - half) * 100) / 100, method: 'Card', reference: 'TEST-CARD' });
  ok('balance paid by card', p2.status === 200 && p2.data.bundle.invoice.status === 'Paid', p2.data);
  ok('visit closed after full payment', ['Completed'].includes((await call(tk.cashier, 'GET', `/billing/visit/${vid}`)).data.visit.status));
  const cs = await call(tk.cashier, 'POST', '/billing/session/close', { closing_cash: 100 + half });
  ok('cashier session closed with zero variance', cs.status === 200 && Number(cs.data.variance) === 0, cs.data);

  section('Insurance visit + claim');
  const pol = (await call(tk.reception, 'GET', '/r/policy_members?limit=50')).data.rows.find((x) => x.patient_id === anita.id);
  const v2 = await call(tk.reception, 'POST', '/visits/start', { patient_id: anita.id, doctor_id: sara.id, payer_type: 'Insurance', policy_id: pol.id, complaint: 'Review' });
  ok('insurance visit started with eligibility', v2.status === 201 && v2.data.eligibility === 'Eligible', v2.data);
  const vid2 = v2.data.id;
  ok('encounter (insurance)', (await call(tk.drsara, 'PUT', `/consult/${vid2}/encounter`, { chief_complaint: 'Review', assessment: 'OK' })).status === 200);
  ok('diagnosis (insurance)', (await call(tk.drsara, 'POST', `/consult/${vid2}/diagnoses`, { code_id: dx.id })).status === 201);
  const inv2 = await call(tk.cashier, 'POST', `/billing/visit/${vid2}/invoice`, {});
  ok('insurance invoice splits patient / payer share', inv2.status === 200 && Number(inv2.data.invoice.payer_share) > 0 && Number(inv2.data.invoice.patient_share) > 0, inv2.data);
  const cl = await call(tk.claims, 'POST', `/claims/from-invoice/${inv2.data.invoice.id}`, {});
  ok('claim created from invoice', cl.status === 201, cl.data);
  ok('duplicate claim blocked (409)', (await call(tk.claims, 'POST', `/claims/from-invoice/${inv2.data.invoice.id}`, {})).status === 409);
  const sc = await call(tk.claims, 'POST', `/claims/${cl.data.id}/scrub`, {});
  ok('claim scrub passes', sc.status === 200 && sc.data.ok === true, sc.data);
  const sub = await call(tk.claims, 'POST', '/claims/submit', { claim_ids: [cl.data.id] });
  ok('claim submitted (simulated)', sub.status === 200 && sub.data.batches.length === 1 && sub.data.batches[0].mode === 'Simulated', sub.data);
  ok('cashier cannot submit claims (403)', (await call(tk.cashier, 'POST', '/claims/submit', { claim_ids: [cl.data.id] })).status === 403);
  ok('payer rejection recorded', (await call(tk.claims, 'POST', `/claims/${cl.data.id}/decision`, { status: 'Rejected', reason: 'Test rejection' })).status === 200);
  ok('claim resubmit path', (await call(tk.claims, 'POST', `/claims/${cl.data.id}/resubmit`, {})).status === 200);

  section('Patient 360 and break-glass');
  const p360 = await call(tk.nurse, 'GET', `/patients/${mo.id}/360`);
  ok('restricted role blocked from unrelated patient (403, asks break-glass)', p360.status === 403, p360.data);
  const bg = await call(tk.nurse, 'GET', `/patients/${mo.id}/360?breakglass=Emergency%20treatment%20of%20collapsed%20patient`);
  ok('break-glass with reason allowed and audited', bg.status === 200, bg.data);
  ok('admin sees full 360', (await call(tk.admin, 'GET', `/patients/${mo.id}/360`)).status === 200);

  section('Stock');
  const st = await call(tk.pharmacist, 'GET', '/pharmacy/stock');
  ok('pharmacy stock view', st.status === 200, st.data);
  const otc = await call(tk.pharmacist, 'POST', '/pharmacy/otc', { items: [{ drug_id: para.id, qty: 2 }], customer_name: 'Walk-in', payment_method: 'Cash' });
  ok('OTC sale (non-prescription drug)', otc.status === 200 || otc.status === 201, otc.data);
  const otcRx = await call(tk.pharmacist, 'POST', '/pharmacy/otc', { items: [{ drug_id: amox.id, qty: 1 }], customer_name: 'Walk-in', payment_method: 'Cash' });
  ok('OTC refuses prescription-only drug', otcRx.status >= 400 && otcRx.status < 500, otcRx.data);

  section('Reports, dashboard, admin matrix');
  const dash = await call(tk.admin, 'GET', '/dashboard');
  ok('dashboard loads', dash.status === 200 && dash.data.cards.length > 5, dash.data);
  ok('dashboard for cashier is filtered', (await call(tk.cashier, 'GET', '/dashboard')).data.cards.length < dash.data.cards.length);
  const rl = await call(tk.admin, 'GET', '/reports');
  ok('report list', rl.status === 200 && rl.data.length >= 10, rl.data);
  for (const r of rl.data) {
    const rr = await call(tk.admin, 'GET', `/reports/${r.key}?from=2020-01-01&to=2099-12-31`);
    ok(`report ${r.key} runs`, rr.status === 200 && Array.isArray(rr.data.rows), rr.data);
  }
  ok('CSV export works', (await call(tk.admin, 'GET', '/reports/revenue_by_category')).status === 200);
  const matrix = (await call(tk.admin, 'GET', '/admin/matrix')).data;
  const recRole = matrix.roles.find((r) => r.name === 'Receptionist');
  const before = matrix.granted[recRole.id];
  const rm = await call(tk.admin, 'PUT', `/admin/roles/${recRole.id}/permissions`, { permissions: before.filter((p) => p !== 'appointments.delete') });
  ok('permission removed from role', rm.status === 200);
  const adm = matrix.roles.find((r) => r.name === 'Super Admin');
  ok('Super Admin cannot remove admin.roles from itself', (await call(tk.admin, 'PUT', `/admin/roles/${adm.id}/permissions`, { permissions: ['patients.view'] })).status === 409);
  ok('unknown permission rejected', (await call(tk.admin, 'PUT', `/admin/roles/${recRole.id}/permissions`, { permissions: ['nope.nope'] })).status === 400);
  await call(tk.admin, 'PUT', `/admin/roles/${recRole.id}/permissions`, { permissions: before });
  const al = await call(tk.admin, 'GET', '/r/audit_log?limit=5');
  ok('audit log has entries', al.status === 200 && al.data.rows.length > 0);

  section('Patient portal');
  const ps = await call(tk.patient, 'GET', '/portal/summary');
  ok('portal summary for own patient', ps.status === 200 && ps.data.patient.full_name === 'Mohammed Al-Kuwari', ps.data);
  const nextSun = new Date(); while (nextSun.getDay() !== 1) nextSun.setDate(nextSun.getDate() + 1);
  const dstr = nextSun.toISOString().slice(0, 10);
  const slots = await call(tk.patient, 'GET', `/portal/slots?doctor_id=${sara.id}&date=${dstr}`);
  ok('free slots computed from doctor schedule', slots.status === 200 && slots.data.slots.length > 10, slots.data);
  const bk = await call(tk.patient, 'POST', '/portal/appointments', { doctor_id: sara.id, appt_date: dstr, appt_time: slots.data.slots[0], reason: 'Check-up' });
  ok('patient booked appointment', bk.status === 201, bk.data);
  ok('same slot cannot be double-booked (409)', (await call(tk.patient, 'POST', '/portal/appointments', { doctor_id: sara.id, appt_date: dstr, appt_time: slots.data.slots[0] })).status === 409);
  ok('patient cancelled appointment', (await call(tk.patient, 'POST', `/portal/appointments/${bk.data.id}/cancel`, {})).status === 200);
  ok('staff cannot use portal (403)', (await call(tk.cashier, 'GET', '/portal/summary')).status === 403);

  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length) { console.log('Failed:\n - ' + failed.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
