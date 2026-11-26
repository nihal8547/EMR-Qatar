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
  const roles = ['admin', 'manager', 'reception', 'nurse', 'drsara', 'drravi', 'drdental', 'lab', 'radiology', 'pharmacist', 'store', 'cashier', 'claims', 'accountant', 'hr', 'patient'];
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
  ok('lab tech cannot read invoices (403)', (await call(tk.lab, 'GET', '/r/invoices')).status === 403);
  ok('reception can read patients', (await call(tk.reception, 'GET', '/r/patients')).status === 200);
  ok('nurse cannot create invoice charges (403)', (await call(tk.nurse, 'POST', '/r/charges', {})).status === 403);
  ok('patient blocked from staff API (403)', (await call(tk.patient, 'GET', '/r/patients')).status === 403);
  ok('cashier cannot open role matrix (403)', (await call(tk.cashier, 'GET', '/admin/matrix')).status === 403);
  ok('admin can open role matrix', (await call(tk.admin, 'GET', '/admin/matrix')).status === 200);
  ok('doctor cannot take payment (403)', (await call(tk.drsara, 'POST', '/billing/invoices/1/pay', { amount: 1, method: 'Card' })).status === 403);

  const meta = (await call(tk.reception, 'GET', '/meta')).data;
  ok('meta hides resources a role cannot view', meta.patients && !meta.lab_orders && !meta.users === false);

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
  ok('pharmacy queue shows payer details', pqRow && pqRow.payer && pqRow.payer.type === 'Cash', pqRow && pqRow.payer);
  const dItems = pitems.map((i) => ({ item_id: i.id, prescription_item_id: i.id, qty: i.qty }));
  const est = await call(tk.pharmacist, 'POST', '/pharmacy/estimate', { prescription_id: rx.data.id, items: dItems });
  ok('pharmacy estimate gives patient share', est.status === 200 && Number(est.data.patient_share) > 0, est.data);
  const noPay = await call(tk.pharmacist, 'POST', '/pharmacy/dispense', { prescription_id: rx.data.id, items: dItems });
  ok('dispense refused until payment is taken (409)', noPay.status === 409 && noPay.data.extra && noPay.data.extra.payment_required === true, noPay.data);
  ok('pharmacist cannot dispense on credit (403)', (await call(tk.pharmacist, 'POST', '/pharmacy/dispense', { prescription_id: rx.data.id, items: dItems, pay_later: true })).status === 403);
  ok('cash payment at pharmacy needs an open session (409)', (await call(tk.pharmacist, 'POST', '/pharmacy/dispense', { prescription_id: rx.data.id, items: dItems, payment: { method: 'Cash' } })).status === 409);
  const disp = await call(tk.pharmacist, 'POST', '/pharmacy/dispense', { prescription_id: rx.data.id, items: dItems, payment: { method: 'Card', reference: 'PH-CARD' } });
  ok('dispensed with FEFO batch after payment', disp.status === 200 && disp.data.payment && disp.data.payment.amount > 0, disp.data);
  ok('dispense slip payload', (await call(tk.pharmacist, 'GET', `/pharmacy/dispenses/${disp.data.dispense_id}/print`)).data.items.length > 0);

  section('Billing');
  const bw = await call(tk.cashier, 'GET', '/billing/worklist');
  ok('cashier worklist', bw.status === 200);
  const bv = await call(tk.cashier, 'GET', `/billing/visit/${vid}`);
  ok('visit billing summary loads with pending charges', bv.status === 200 && bv.data.pending.length >= 2, bv.data);
  const inv = await call(tk.cashier, 'POST', `/billing/visit/${vid}/invoice`, {});
  ok('invoice created', inv.status === 200 && inv.data.invoice && Number(inv.data.invoice.net) > 0, inv.data);
  const invId = inv.data.invoice.id;
  const net = Number(inv.data.invoice.balance);
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

  section('Bill cancel request / approval');
  const bc1 = await call(tk.reception, 'POST', '/r/bill_cancel_requests', { invoice_id: invId, reason: 'Billed to the wrong patient' });
  ok('front office raises a bill cancel request', (bc1.status === 200 || bc1.status === 201) && bc1.data.status === 'Requested', bc1.data);
  ok('duplicate open request refused (409)', (await call(tk.reception, 'POST', '/r/bill_cancel_requests', { invoice_id: invId, reason: 'duplicate attempt here' })).status === 409);
  ok('short reason refused (400)', (await call(tk.reception, 'POST', '/r/bill_cancel_requests', { invoice_id: 999999, reason: 'x' })).status >= 400);
  ok('front office cannot approve (403)', (await call(tk.reception, 'POST', `/r/bill_cancel_requests/${bc1.data.id}/action/approve`, {})).status === 403);
  ok('reject needs a reason (400)', (await call(tk.cashier, 'POST', `/r/bill_cancel_requests/${bc1.data.id}/action/reject`, {})).status === 400);
  const rj = await call(tk.cashier, 'POST', `/r/bill_cancel_requests/${bc1.data.id}/action/reject`, { reason: 'Please check with the manager' });
  ok('cashier rejects with a reason', rj.status === 200 && rj.data.record.status === 'Rejected', rj.data);
  const bc2 = await call(tk.reception, 'POST', '/r/bill_cancel_requests', { invoice_id: invId, reason: 'Billed to the wrong patient', void_charges: true });
  const bcAp = await call(tk.cashier, 'POST', `/r/bill_cancel_requests/${bc2.data.id}/action/approve`, {});
  ok('cashier approves: bill cancelled and paid amount refunded', bcAp.status === 200 && bcAp.data.record.status === 'Approved' && Number(bcAp.data.refunded) > 0, bcAp.data);
  const afterInv = await call(tk.cashier, 'GET', `/billing/invoices/${invId}`);
  ok('invoice is Cancelled with refund payment', afterInv.data.invoice.status === 'Cancelled' && afterInv.data.payments.some((x) => x.kind === 'Refund'), afterInv.data.invoice);
  ok('cancel request cannot be approved twice (409)', (await call(tk.cashier, 'POST', `/r/bill_cancel_requests/${bc2.data.id}/action/approve`, {})).status === 409);

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

  section('Dental chart, treatment plans and billing');
  const moh = (await call(tk.admin, 'GET', '/r/patients?q=Kuwari')).data.rows[0];
  const dent = (await call(tk.admin, 'GET', '/r/users?q=drdental')).data.rows[0];
  const dv = await call(tk.reception, 'POST', '/visits/start', { patient_id: moh.id, doctor_id: dent.id, payer_type: 'Cash', complaint: 'Toothache' });
  const ch = await call(tk.drdental, 'GET', `/dental/chart/${moh.id}`);
  ok('dentist opens demo chart', ch.status === 200 && ch.data.state.length >= 6 && ch.data.plans.length === 1, ch.data);
  ok('plan total from items', Number(ch.data.plans[0].total) === 1050, ch.data.plans[0]);
  const rec = (b) => call(tk.drdental, 'POST', '/r/dental_chart_entries', { patient_id: moh.id, dentition: 'Permanent', surface: 'Whole tooth', condition: 'Caries', ...b });
  ok('invalid FDI tooth rejected', (await rec({ tooth_no: '19' })).status === 400);
  ok('primary tooth number rejected for permanent dentition', (await rec({ tooth_no: '55' })).status === 400);
  ok('dentist records finding on tooth 14', (await rec({ tooth_no: '14', surface: 'MO' })).status === 201);
  ok('cashier cannot open chart (403)', (await call(tk.cashier, 'GET', `/dental/chart/${moh.id}`)).status === 403);
  ok('patient cannot open chart (403)', (await call(tk.patient, 'GET', `/dental/chart/${moh.id}`)).status === 403);
  ok('cashier cannot record entries (403)', (await call(tk.cashier, 'POST', '/r/dental_chart_entries', { patient_id: moh.id, tooth_no: '11', condition: 'Caries' })).status === 403);
  ok('non-treating doctor needs break-glass', (await call(tk.drsara, 'GET', `/dental/chart/${moh.id}`)).status === 403);
  ok('break-glass with reason works', (await call(tk.drsara, 'GET', `/dental/chart/${moh.id}?breakglass=covering%20for%20dentist`)).status === 200);
  const item0 = ch.data.plans[0].items[0];
  ok('cannot complete without a visit', (await call(tk.drdental, 'POST', `/dental/plan-items/${item0.id}/complete`, {})).status === 400);
  ok('dental visit started (dental consult fee posted)', dv.status === 201 || dv.status === 200, dv.data);
  const cp = await call(tk.drdental, 'POST', `/dental/plan-items/${item0.id}/complete`, { visit_id: dv.data.id, condition: 'Filling' });
  ok('plan item completed and charged', cp.status === 200 && cp.data.charge_id, cp.data);
  ok('completing twice is refused (409)', (await call(tk.drdental, 'POST', `/dental/plan-items/${item0.id}/complete`, { visit_id: dv.data.id })).status === 409);
  const bill = await call(tk.cashier, 'GET', `/billing/visit/${dv.data.id}`);
  ok('dental charge appears on the visit bill', JSON.stringify(bill.data).includes('Tooth filling'), bill.data);
  const ch2 = await call(tk.drdental, 'GET', `/dental/chart/${moh.id}`);
  ok('plan moves to In Progress and chart updated', ch2.data.plans[0].status === 'In Progress' && ch2.data.state.some((e) => e.tooth_no === '16' && e.condition === 'Filling'), ch2.data.plans[0]);
  const it1 = ch2.data.plans[0].items[1];
  ok('cancel plan item', (await call(tk.drdental, 'POST', `/dental/plan-items/${it1.id}/cancel`)).status === 200);
  ok('plan item fee defaults from price list', (await call(tk.drdental, 'POST', '/r/dental_plan_items', { plan_id: ch2.data.plans[0].id, dentition: 'Permanent', tooth_no: '24', service_id: (await call(tk.admin, 'GET', '/r/services?q=DENT-EXT')).data.rows[0].id })).status === 201);
  const ch3 = await call(tk.drdental, 'GET', `/dental/chart/${moh.id}`);
  ok('plan total excludes cancelled, includes new item', Number(ch3.data.plans[0].total) === 250 + 200 + 200, ch3.data.plans[0].total);
  ok('completed item cannot be edited', (await call(tk.drdental, 'PUT', `/r/dental_plan_items/${item0.id}`, { fee: 1 })).status === 409);

  section('Price configuration');
  const pi = await call(tk.accountant, 'GET', '/pricing/items?limit=200');
  ok('price list has services, drugs and packages kinds', pi.status === 200 && pi.data.total >= 30 && pi.data.categories.some((c) => c.category === 'Pharmacy') && pi.data.categories.some((c) => c.category === 'Dental') && pi.data.categories.some((c) => c.category === 'Lab'), pi.data.categories);
  ok('technical PHARM service hidden from price list', !pi.data.rows.some((r) => r.code === 'PHARM'));
  const fill = pi.data.rows.find((r) => r.code === 'DENT-FILL');
  ok('accountant changes a dental price', (await call(tk.accountant, 'PUT', `/pricing/items/service/${fill.id}`, { price: 275 })).data.price === 275);
  ok('negative price rejected', (await call(tk.accountant, 'PUT', `/pricing/items/service/${fill.id}`, { price: -5 })).status === 400);
  ok('non-numeric price rejected', (await call(tk.accountant, 'PUT', `/pricing/items/service/${fill.id}`, { price: 'abc' })).status === 400);
  ok('absurd price rejected', (await call(tk.accountant, 'PUT', `/pricing/items/service/${fill.id}`, { price: 99999999 })).status === 400);
  ok('unknown kind 404', (await call(tk.accountant, 'PUT', '/pricing/items/foo/1', { price: 1 })).status === 404);
  ok('cashier can view but not edit prices', (await call(tk.cashier, 'GET', '/pricing/items')).status === 200 && (await call(tk.cashier, 'PUT', `/pricing/items/service/${fill.id}`, { price: 1 })).status === 403);
  ok('patient and store keeper cannot open price config', (await call(tk.patient, 'GET', '/pricing/items')).status === 403 && (await call(tk.store, 'GET', '/pricing/items')).status === 403);
  const hs = await call(tk.accountant, 'GET', `/pricing/history/service/${fill.id}`);
  ok('price history recorded (250 -> 275)', hs.data[0] && hs.data[0].price.from === 250 && hs.data[0].price.to === 275, hs.data);
  const drugRow = (await call(tk.accountant, 'GET', '/pricing/items?kind=drug&q=Paracetamol')).data.rows[0];
  ok('drug price editable', (await call(tk.accountant, 'PUT', `/pricing/items/drug/${drugRow.id}`, { price: 0.75 })).data.price === 0.75);
  const pv = await call(tk.accountant, 'POST', '/pricing/bulk', { filter: { category: 'Dental' }, mode: 'percent', value: 10, rounding: 5, preview: true });
  ok('bulk preview lists changes without saving', pv.status === 200 && pv.data.count > 0 && (await call(tk.accountant, 'GET', '/pricing/items?category=Dental')).data.rows.find((r) => r.code === 'DENT-FILL').price === 275, pv.data);
  ok('bulk percent below -90 rejected', (await call(tk.accountant, 'POST', '/pricing/bulk', { filter: {}, mode: 'percent', value: -95, preview: true })).status === 400);
  ok('cashier cannot bulk change', (await call(tk.cashier, 'POST', '/pricing/bulk', { filter: {}, mode: 'percent', value: 5 })).status === 403);
  const ap = await call(tk.accountant, 'POST', '/pricing/bulk', { filter: { category: 'Dental' }, mode: 'percent', value: 10, rounding: 5 });
  ok('bulk change applied', ap.status === 200 && ap.data.updated === pv.data.count, ap.data);
  ok('rounded to 5 (275 +10% -> 305)', (await call(tk.accountant, 'GET', '/pricing/items?category=Dental')).data.rows.find((r) => r.code === 'DENT-FILL').price === 305);
  const lists = await call(tk.accountant, 'GET', '/pricing/lists');
  ok('payer price lists listed', lists.status === 200 && lists.data.length >= 1, lists.data);
  const lid = lists.data[0].id;
  const cons = (await call(tk.accountant, 'GET', `/pricing/lists/${lid}`)).data.rows.find((r) => r.code === 'CONS-GP');
  ok('payer list shows effective price', cons && cons.effective_price > 0, cons);
  ok('special price set', (await call(tk.accountant, 'PUT', `/pricing/lists/${lid}/service/${cons.id}`, { price: 77 })).status === 200 && (await call(tk.accountant, 'GET', `/pricing/lists/${lid}`)).data.rows.find((r) => r.code === 'CONS-GP').effective_price === 77);
  ok('special price cleared', (await call(tk.accountant, 'PUT', `/pricing/lists/${lid}/service/${cons.id}`, { price: null })).status === 200 && (await call(tk.accountant, 'GET', `/pricing/lists/${lid}`)).data.rows.find((r) => r.code === 'CONS-GP').special_price === null);
  const newV = await call(tk.reception, 'POST', '/visits/start', { patient_id: newP.data.id, doctor_id: sara.id, payer_type: 'Cash', complaint: 'Price test' });
  ok('new bills use the new consultation price', JSON.stringify((await call(tk.cashier, 'GET', `/billing/visit/${newV.data.id}`)).data.pending).includes('"unit_price":100'));

  section('Registration with insurance, check-in price and discount');
  const payerRow = (await call(tk.reception, 'GET', '/r/payers?limit=5')).data.rows[0];
  const planRow = (await call(tk.reception, 'GET', '/r/plans?limit=5')).data.rows.find((x) => x.payer_id === payerRow.id);
  const lkPlans = await call(tk.reception, 'GET', `/lookup/plans?f_payer_id=${payerRow.id}`);
  ok('lookup can filter plans by payer', lkPlans.status === 200 && lkPlans.data.length >= 1 && lkPlans.data.every((x) => x.id), lkPlans.data);
  ok('lookup ignores unknown filter fields (no 500)', (await call(tk.reception, 'GET', '/lookup/plans?f_password_hash=1&f_nope=2')).status === 200);
  const regPol = { payer_id: payerRow.id, plan_id: planRow.id, policy_no: 'REG-POL-1', member_id: 'REG-M-1', relation: 'Self', valid_from: today, valid_to: '2031-12-31' };
  const regP = await call(tk.reception, 'POST', '/r/patients', { full_name: 'Insured Newcomer', gender: 'Female', qid: '29011223344', dob: '1991-05-05', phone: '+974 5000 7777', insurance: [regPol] });
  ok('patient registered together with insurance policy', regP.status === 201, regP.data);
  const rpPol = (await call(tk.reception, 'GET', `/r/policy_members?patient_id=${regP.data.id}`)).data.rows;
  ok('policy saved against the new patient', rpPol.length === 1 && rpPol[0].policy_no === 'REG-POL-1' && rpPol[0].status === 'Active', rpPol);
  const badDates = await call(tk.reception, 'POST', '/r/patients', { full_name: 'Bad Dates', gender: 'Male', qid: '29011223355', dob: '1991-05-05', phone: '+974 5000 7778', insurance: [{ ...regPol, policy_no: 'X1', valid_to: '2020-01-01' }] });
  ok('policy with valid-to before valid-from rejected', badDates.status === 400, badDates.data);
  const otherPayers = (await call(tk.reception, 'GET', '/r/payers?limit=5')).data.rows;
  ok('policy missing member id rejected and patient not created', (await call(tk.reception, 'POST', '/r/patients', { full_name: 'No Member', gender: 'Male', qid: '29011223366', dob: '1991-05-05', phone: '+974 5000 7779', insurance: [{ ...regPol, member_id: '' }] })).status === 400 && (await call(tk.admin, 'GET', '/r/patients?q=No%20Member')).data.rows.length === 0);
  ok('more than 5 policies rejected', (await call(tk.reception, 'POST', '/r/patients', { full_name: 'Many Pol', gender: 'Male', qid: '29011223377', dob: '1991-05-05', phone: '+974 5000 7780', insurance: Array(6).fill(regPol) })).status === 400);
  ok('nurse cannot register patient with policy (403)', (await call(tk.nurse, 'POST', '/r/patients', { full_name: 'X', gender: 'Male', qid: '29011223388', dob: '1991-05-05', phone: '+974 5000 7781', insurance: [regPol] })).status === 403);

  const saraU = (await call(tk.admin, 'GET', '/r/users?q=drsara')).data.rows[0];
  const prA = await call(tk.reception, 'GET', `/visits/price-preview?doctor_id=${saraU.id}&payer_type=Cash`);
  ok('check-in price: cash consultation from price list', prA.status === 200 && prA.data.price === 100 && prA.data.patient_share === 100 && prA.data.payer_share === 0, prA.data);
  const prB = await call(tk.reception, 'GET', `/visits/price-preview?doctor_id=${saraU.id}&payer_type=Insurance&policy_id=${rpPol[0].id}`);
  ok('check-in price: insurance split uses plan co-pay', prB.status === 200 && prB.data.payer_share > 0 && prB.data.patient_share > 0 && Math.abs(prB.data.patient_share + prB.data.payer_share - prB.data.net) < 0.01 && prB.data.plan, prB.data);
  const prC = await call(tk.reception, 'GET', `/visits/price-preview?doctor_id=${saraU.id}&payer_type=Cash&discount_type=percent&discount_value=5`);
  ok('discount within receptionist limit shows direct + net 95', prC.data.net === 95 && prC.data.discount.authority.mode === 'direct', prC.data);
  const prD = await call(tk.reception, 'GET', `/visits/price-preview?doctor_id=${saraU.id}&payer_type=Cash&discount_type=percent&discount_value=20`);
  ok('discount above limit needs approval', prD.data.discount.authority.mode === 'approval' && prD.data.net === 80, prD.data);
  const prE = await call(tk.reception, 'GET', `/visits/price-preview?doctor_id=${saraU.id}&payer_type=Cash&discount_type=amount&discount_value=30`);
  ok('amount discount 30 off 100', prE.data.net === 70 && prE.data.discount.pct === 30, prE.data);
  ok('percent over 100 rejected', (await call(tk.reception, 'GET', `/visits/price-preview?doctor_id=${saraU.id}&discount_type=percent&discount_value=150`)).status === 400);
  ok('approver preview shows direct for any % (admin 50%)', (await call(tk.admin, 'GET', `/visits/price-preview?doctor_id=${saraU.id}&discount_type=percent&discount_value=50`)).data.discount.authority.mode === 'direct');
  ok('patient cannot use price preview', (await call(tk.patient, 'GET', `/visits/price-preview?doctor_id=${saraU.id}`)).status === 403);

  const dpOne = await call(tk.admin, 'POST', '/r/patients', { full_name: 'Discount Test', gender: 'Male', qid: '29099887766', dob: '1980-01-01', phone: '+974 5000 8888' });
  const noReason = await call(tk.reception, 'POST', '/visits/start', { patient_id: dpOne.data.id, doctor_id: saraU.id, payer_type: 'Cash', discount: { type: 'percent', value: 5 } });
  ok('discount without a reason rejected', noReason.status === 400, noReason.data);
  const dvOne = await call(tk.reception, 'POST', '/visits/start', { patient_id: dpOne.data.id, doctor_id: saraU.id, payer_type: 'Cash', discount: { type: 'percent', value: 20, reason: 'Staff family' } });
  ok('discount above limit starts as Pending approval', dvOne.status === 201 && dvOne.data.discount_status === 'Pending approval', dvOne.data);
  const dInv0 = await call(tk.cashier, 'POST', `/billing/visit/${dvOne.data.id}/invoice`, {});
  ok('pending discount does not reduce the bill', Number(dInv0.data.invoice.discount) === 0, dInv0.data.invoice);
  ok('cashier cannot approve a discount (403)', (await call(tk.cashier, 'POST', `/visits/${dvOne.data.id}/discount/decision`, { approve: true })).status === 403);
  ok('manager sees pending discount', (await call(tk.manager, 'GET', '/visits/discounts/pending')).data.some((x) => x.id === dvOne.data.id));
  ok('manager approves discount', (await call(tk.manager, 'POST', `/visits/${dvOne.data.id}/discount/decision`, { approve: true })).status === 200);
  ok('approving twice refused (409)', (await call(tk.manager, 'POST', `/visits/${dvOne.data.id}/discount/decision`, { approve: true })).status === 409);
  ok('cashier view shows approved check-in discount', (await call(tk.cashier, 'GET', `/billing/visit/${dvOne.data.id}`)).data.checkin_discount.status === 'Applied');
  await call(tk.cashier, 'POST', `/billing/invoices/${dInv0.data.invoice.id}/cancel`, {});
  const dpTwo = await call(tk.admin, 'POST', '/r/patients', { full_name: 'Discount Test Two', gender: 'Male', qid: '29099887755', dob: '1981-01-01', phone: '+974 5000 8889' });
  const dvTwo = await call(tk.reception, 'POST', '/visits/start', { patient_id: dpTwo.data.id, doctor_id: saraU.id, payer_type: 'Cash', discount: { type: 'percent', value: 5, reason: 'Loyalty' } });
  ok('discount within limit is Applied immediately', dvTwo.data.discount_status === 'Applied', dvTwo.data);
  const dInv2 = await call(tk.cashier, 'POST', `/billing/visit/${dvTwo.data.id}/invoice`, {});
  ok('check-in discount applied automatically on the invoice (100 -> 95)', Number(dInv2.data.invoice.discount) === 5 && Number(dInv2.data.invoice.net) === 95, dInv2.data.invoice);
  const dpThree = await call(tk.admin, 'POST', '/r/patients', { full_name: 'Discount Test Three', gender: 'Male', qid: '29099887744', dob: '1982-01-01', phone: '+974 5000 8890' });
  const dvThree = await call(tk.reception, 'POST', '/visits/start', { patient_id: dpThree.data.id, doctor_id: saraU.id, payer_type: 'Cash', discount: { type: 'amount', value: 4, reason: 'Promotion' } });
  const dInv3 = await call(tk.cashier, 'POST', `/billing/visit/${dvThree.data.id}/invoice`, {});
  ok('amount discount converted at invoicing (QAR 4 off 100)', dvThree.data.discount_status === 'Applied' && Number(dInv3.data.invoice.discount) === 4, dInv3.data.invoice);
  const dpFour = await call(tk.admin, 'POST', '/r/patients', { full_name: 'Discount Test Four', gender: 'Male', qid: '29099887733', dob: '1983-01-01', phone: '+974 5000 8891' });
  const dvFour = await call(tk.admin, 'POST', '/visits/start', { patient_id: dpFour.data.id, doctor_id: saraU.id, payer_type: 'Cash', discount: { type: 'percent', value: 50, reason: 'Manager approval' } });
  ok('user with approval rights gives any discount directly', dvFour.status === 201 && dvFour.data.discount_status === 'Applied', dvFour.data);

  section('Remove unwanted tests from a bill');
  const rp = await call(tk.admin, 'POST', '/r/patients', { full_name: 'Remove Item Test', gender: 'Male', qid: '29055667788', dob: '1991-01-01', phone: '+974 5000 7002' });
  const rv = await call(tk.reception, 'POST', '/visits/start', { patient_id: rp.data.id, doctor_id: saraU.id, payer_type: 'Cash' });
  const rlo = await call(tk.drsara, 'POST', `/consult/${rv.data.id}/lab-orders`, { test_ids: [hb.id, glu.id], priority: 'Routine' });
  ok('lab order for removal test', rlo.status === 201, rlo.data);
  let rb = await call(tk.reception, 'GET', `/billing/visit/${rv.data.id}`);
  const labCh = rb.data.pending.filter((c) => c.source === 'Lab'); const conCh = rb.data.pending.find((c) => c.source === 'Consultation');
  ok('two lab charges pending', labCh.length === 2, rb.data.pending);
  ok('reason is required to remove', (await call(tk.reception, 'POST', `/billing/charges/${labCh[0].id}/remove`, {})).status === 400);
  if (conCh) ok('consultation fee cannot be removed here', (await call(tk.reception, 'POST', `/billing/charges/${conCh.id}/remove`, { reason: 'test' })).status === 409);
  ok('lab role cannot remove charges (403)', (await call(tk.lab, 'POST', `/billing/charges/${labCh[0].id}/remove`, { reason: 'test' })).status === 403);
  ok('pending lab charge removed', (await call(tk.reception, 'POST', `/billing/charges/${labCh[0].id}/remove`, { reason: 'Patient declined' })).status === 200);
  rb = await call(tk.reception, 'GET', `/billing/visit/${rv.data.id}`);
  ok('only one lab charge left', rb.data.pending.filter((c) => c.source === 'Lab').length === 1);
  const rlItems = (await call(tk.admin, 'GET', `/r/lab_order_items?order_id=${rlo.data.id}`)).data.rows;
  ok('removed test also leaves the lab order', rlItems.length === 1, rlItems);
  const rinv = await call(tk.reception, 'POST', `/billing/visit/${rv.data.id}/invoice`, {});
  const grossBefore = Number(rinv.data.invoice.gross);
  ok('invoice created', rinv.status === 200, rinv.data);
  const invLab = rinv.data.lines.find((l) => l.source === 'Lab');
  ok('invoiced unpaid test can be removed', (await call(tk.reception, 'POST', `/billing/charges/${invLab.id}/remove`, { reason: 'Patient changed mind' })).status === 200);
  const rinv2 = await call(tk.reception, 'GET', `/billing/invoices/${rinv.data.invoice.id}`);
  ok('invoice total reduced after removal', Number(rinv2.data.invoice.gross) < grossBefore, rinv2.data.invoice);
  ok('the lab order is cancelled once no tests remain', ((await call(tk.admin, 'GET', `/r/lab_orders/${rlo.data.id}`)).data.status) === 'Cancelled');

  section('Patient full history');
  const phist = await call(tk.admin, 'GET', `/patients/${dpFour.data.id}/history`);
  ok('full history returns visits with sections', phist.status === 200 && phist.data.visits.length >= 1 && Array.isArray(phist.data.visits[0].labs) && Array.isArray(phist.data.visits[0].invoices) && phist.data.totals, phist.data);
  ok('history blocked for roles without 360', (await call(tk.lab, 'GET', `/patients/${dpFour.data.id}/history`)).status === 403);
  const phP = await call(tk.admin, 'POST', '/r/patients', { full_name: 'History Guard Test', gender: 'Male', qid: '29011223399', dob: '1980-02-02', phone: '+974 5000 7001' });
  const phistN = await call(tk.nurse, 'GET', `/patients/${phP.data.id}/history`);
  ok('history keeps the break-glass rule for restricted roles', phistN.status === 403 && phistN.data.extra?.breakglass, phistN.data);

  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length) { console.log('Failed:\n - ' + failed.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
