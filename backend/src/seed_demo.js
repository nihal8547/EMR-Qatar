'use strict';
/**
 * Demo data for every page. Runs through the real API (in-process), so business rules, hooks, auto-codes,
 * charges, invoices and claims are produced the same way as in daily use. Run after seed.js: npm run db:demo
 */
const app = require('./server');
const db = require('./db');
const reg = require('./registry');

const PASS = process.env.DEMO_PASSWORD || 'Demo@12345';
const TARGET = 3;                     // minimum rows per page
let BASE; const tk = {}; const problems = [];
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function call(user, method, path, body) {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${tk[user]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, data: d };
}
async function must(label, user, method, path, body) {
  const r = await call(user, method, path, body);
  if (r.status >= 400) { problems.push(`${label}: ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`); return null; }
  return r.data;
}
const rows = async (user, key, q = '') => (await call(user, 'GET', `/r/${key}?limit=100${q}`)).data.rows || [];

async function workflows() {
  const P = [
    ['Fatima Al-Thani', 'Female', '1988-05-09', '+974 5501 2001', 'A+'], ['Khalid Al-Mannai', 'Male', '1975-12-30', '+974 5501 2002', 'B+'],
    ['Maria Gonzales', 'Female', '1995-08-18', '+974 5501 2003', 'O+'], ['Rahul Sharma', 'Male', '1982-02-11', '+974 5501 2004', 'AB+'],
    ['Aisha Rahman', 'Female', '2016-04-03', '+974 5501 2005', 'O-'], ['Omar Hassan', 'Male', '1969-09-21', '+974 5501 2006', 'A-'],
  ];
  const nat = (await rows('admin', 'nationalities'))[0];
  const pat = [];
  for (let i = 0; i < P.length; i++) {
    const [full_name, gender, dob, phone, blood_group] = P[i];
    const r = await must(`patient ${full_name}`, 'reception', 'POST', '/r/patients', { full_name, gender, dob, phone, blood_group, qid: `2${String(7000000000 + i * 1111).padStart(10, '0')}`, nationality_id: nat && nat.id, language: 'English' });
    if (r) pat.push(r.id);
  }
  const existing = await rows('admin', 'patients');
  const by = (n) => existing.find((p) => p.full_name === n);
  const moh = by('Mohammed Al-Kuwari'); const anita = by('Anita Nair'); const joseph = by('Joseph Santos');
  const users = await rows('admin', 'users');
  const u = (n) => users.find((x) => x.username === n);
  const sara = u('drsara'); const ravi = u('drravi'); const dent = u('drdental');
  const drugs = await rows('drsara', 'drugs'); const dr = (c) => drugs.find((d) => d.code === c);
  const tests = await rows('drsara', 'lab_tests'); const lt = (c) => tests.find((t) => t.code === c);
  const svcs = await rows('admin', 'services'); const sv = (c) => svcs.find((s) => s.code === c);
  const dx = await rows('drsara', 'diagnosis_codes'); const dc = (c) => dx.find((d) => d.code === c);
  const mods = await rows('admin', 'imaging_modalities');
  await must('cashier session', 'cashier', 'POST', '/billing/session/open', { opening_cash: 500 });

  async function journey({ p, doc, docUser, payer = 'Cash', policy, complaint, vitals, assess, dxCode, labs = [], imaging, rx = [], proc, witness, finish = true, invoice = false, pay = false, method = 'Cash', claim = false, dental }) {
    const v = await must(`visit ${complaint}`, 'reception', 'POST', '/visits/start', { patient_id: p, doctor_id: doc, payer_type: payer, policy_id: policy, complaint });
    if (!v) return null; const vid = v.id;
    if (vitals) await must('vitals', 'nurse', 'POST', '/r/vitals', { visit_id: vid, ...vitals });
    if (vitals) await must('nursing note', 'nurse', 'POST', '/r/nursing_notes', { visit_id: vid, note: 'Patient comfortable, advice given on hydration.' });
    if (!assess) return { vid };
    await must('encounter', docUser, 'PUT', `/consult/${vid}/encounter`, { chief_complaint: complaint, assessment: assess, plan: 'Treat symptomatically, review if not improving', history: 'No significant past history' });
    if (dxCode && dc(dxCode)) await must('dx', docUser, 'POST', `/consult/${vid}/diagnoses`, { code_id: dc(dxCode).id });
    let lab = null;
    if (labs.length) lab = await must('lab order', docUser, 'POST', `/consult/${vid}/lab-orders`, { test_ids: labs.map((c) => lt(c).id), priority: 'Routine' });
    if (imaging) await must('imaging', docUser, 'POST', `/consult/${vid}/imaging-orders`, { service_id: sv(imaging).id, modality_id: mods[0] && mods[0].id, clinical_info: complaint });
    if (proc) await must('procedure', docUser, 'POST', `/consult/${vid}/procedures`, { service_id: sv(proc).id, notes: 'Done without complications' });
    let rxr = null;
    if (rx.length) rxr = await must('rx', docUser, 'POST', `/consult/${vid}/prescriptions`, { items: rx.map(([c, dose, freq, days, qty]) => ({ drug_id: dr(c).id, dose, frequency: freq, duration_days: days, qty })) });
    await must('certificate', docUser, 'POST', '/r/certificates', { visit_id: vid, cert_type: 'Sick leave', days: 2, from_date: day(0), remarks: 'Advised rest' });
    if (assess && dxCode === 'J06.9') await must('referral', docUser, 'POST', '/r/referrals', { visit_id: vid, to_facility: 'Hamad General Hospital - ENT', urgency: 'Routine', reason: 'Recurrent infections' });
    if (lab) {
      const wl = (await call('lab', 'GET', '/lab/worklist')).data; const o = wl.find((x) => x.id === lab.id);
      if (o) {
        await must('collect', 'lab', 'POST', `/lab/orders/${o.id}/collect`, {});
        const o2 = (await call('lab', 'GET', '/lab/worklist')).data.find((x) => x.id === o.id);
        const vals = { 'CBC-HB': 13.4, 'GLU-R': 102, HBA1C: 6.8, CREA: 0.9, LDL: 118, TSH: 2.1 };
        for (const it of o2.items) { const code = labs.find((c) => it.test && lt(c) && it.test === lt(c).name); await must('result', 'lab', 'POST', `/lab/items/${it.id}/result`, { result_value: vals[code] ?? 10 }); }
        await must('validate', 'lab', 'POST', `/lab/orders/${o.id}/validate-all`, {});
      }
    }
    if (imaging) {
      const o = (await call('radiology', 'GET', '/radiology/worklist')).data.find((x) => x.study === sv(imaging).name);
      if (o) {
        await must('scan', 'radiology', 'POST', `/radiology/orders/${o.id}/status`, { status: 'Scanned' });
        await must('imaging report', 'radiology', 'POST', '/r/imaging_reports', { order_id: o.id, findings: 'No acute abnormality. Normal cardiac silhouette and clear lung fields.', impression: 'Normal study', status: 'Final' });
      }
    }
    if (finish) await must('complete', docUser, 'POST', `/consult/${vid}/complete`, {});
    if (rxr) {
      const pq = (await call('pharmacist', 'GET', '/pharmacy/queue')).data; const row = (Array.isArray(pq) ? pq : pq.rows || []).find((r) => r.id === rxr.id);
      if (row) await must('dispense', 'pharmacist', 'POST', '/pharmacy/dispense', { prescription_id: rxr.id, items: row.items.map((i) => ({ item_id: i.id, prescription_item_id: i.id, qty: i.qty })), witness, payment: { method: 'Card', reference: 'DEMO-PH' } });
    }
    let inv = null;
    if (invoice) inv = await must('invoice', 'cashier', 'POST', `/billing/visit/${vid}/invoice`, {});
    if (inv && pay && Number(inv.invoice.balance) > 0.005) {
      const i = inv.invoice; const due = Number(i.balance);
      await must('pay', 'cashier', 'POST', `/billing/invoices/${i.id}/pay`, { amount: method === 'Cash' ? Math.round(due / 2 * 100) / 100 : due, method, reference: method === 'Cash' ? undefined : 'DEMO-REF' });
      if (method === 'Cash') await must('pay2', 'cashier', 'POST', `/billing/invoices/${i.id}/pay`, { amount: Math.round((due - Math.round(due / 2 * 100) / 100) * 100) / 100, method: 'Card', reference: 'DEMO-CARD' });
    }
    if (inv && claim) {
      const c = await must('claim', 'claims', 'POST', `/claims/from-invoice/${inv.invoice.id}`, {});
      if (c) { await must('scrub', 'claims', 'POST', `/claims/${c.id}/scrub`, {}); return { vid, claim: c.id, inv: inv.invoice }; }
    }
    return { vid, inv: inv && inv.invoice };
  }

  const j1 = await journey({ p: joseph.id, doc: sara.id, docUser: 'drsara', complaint: 'Fever and sore throat', vitals: { temperature: 38.4, pulse: 94, bp_systolic: 118, bp_diastolic: 76, spo2: 98, triage_level: '3 - Urgent' }, assess: 'Acute upper respiratory infection', dxCode: 'J06.9', labs: ['CBC-HB', 'GLU-R'], rx: [['PARA500', '500 mg', 'TID', 5, 15]], invoice: true, pay: true });
  const j2 = await journey({ p: anita.id, doc: sara.id, docUser: 'drsara', payer: 'Insurance', policy: (await rows('admin', 'policy_members'))[0].id, complaint: 'Diabetes review', vitals: { temperature: 36.8, pulse: 80, bp_systolic: 132, bp_diastolic: 84, spo2: 99, weight_kg: 68, height_cm: 160, triage_level: '4 - Less urgent' }, assess: 'Type 2 diabetes, stable', dxCode: 'E11.9', labs: ['HBA1C', 'CREA'], imaging: 'RAD-CXR', rx: [['PARA500', '500 mg', 'BD', 3, 6]], invoice: true, claim: true });
  if (j2 && j2.claim) { const s = await must('submit', 'claims', 'POST', '/claims/submit', { claim_ids: [j2.claim] }); await must('approve', 'claims', 'POST', `/claims/${j2.claim}/decision`, { status: 'Accepted', approved_amount: j2.inv.payer_share }); }
  const j3 = await journey({ p: pat[0], doc: sara.id, docUser: 'drsara', complaint: 'Back pain', vitals: { temperature: 36.7, pulse: 78, bp_systolic: 125, bp_diastolic: 80, spo2: 99, triage_level: '4 - Less urgent' }, assess: 'Mechanical low back pain', dxCode: 'M54.5', proc: 'PROC-INJ', rx: [['PARA500', '500 mg', 'TID', 5, 15]], invoice: true, pay: true, method: 'Card' });
  const j4 = await journey({ p: pat[4], doc: ravi.id, docUser: 'drravi', complaint: 'Cough and runny nose (child)', vitals: { temperature: 37.9, pulse: 104, bp_systolic: 98, bp_diastolic: 62, spo2: 98, weight_kg: 18, triage_level: '3 - Urgent' }, assess: 'Viral URTI', dxCode: 'J06.9', rx: [['PARA500', '250 mg', 'TID', 3, 9]], invoice: true });
  const j5 = await journey({ p: pat[1], doc: sara.id, docUser: 'drsara', complaint: 'Chest tightness', vitals: { temperature: 36.9, pulse: 102, bp_systolic: 150, bp_diastolic: 95, spo2: 96, triage_level: '2 - Emergent' }, assess: 'Under evaluation', dxCode: 'I10', labs: ['LDL', 'TSH'], finish: false });
  await journey({ p: pat[2], doc: sara.id, docUser: 'drsara', complaint: 'Annual check-up', vitals: { temperature: 36.6, pulse: 72, bp_systolic: 115, bp_diastolic: 72, spo2: 99, triage_level: '5 - Non-urgent' } });
  await journey({ p: pat[3], doc: ravi.id, docUser: 'drravi', complaint: 'Skin rash' });
  await journey({ p: pat[5], doc: sara.id, docUser: 'drsara', complaint: 'Severe post-operative pain', vitals: { temperature: 36.8, pulse: 98, bp_systolic: 140, bp_diastolic: 88, spo2: 97, triage_level: '2 - Emergent' }, assess: 'Post-operative pain, opioid analgesia', dxCode: 'M54.5', rx: [['MORPH10', '10 mg', 'BD', 3, 6]], witness: 'Nurse Aisha', invoice: true });
  // dental visit for Mohammed and completion of two planned dental procedures
  const dv = await must('dental visit', 'reception', 'POST', '/visits/start', { patient_id: moh.id, doctor_id: dent.id, payer_type: 'Cash', complaint: 'Toothache - lower right' });
  if (dv) {
    const ch = (await call('drdental', 'GET', `/dental/chart/${moh.id}`)).data;
    const items = ch.plans && ch.plans[0] ? ch.plans[0].items : [];
    if (items[0]) await must('dental complete', 'drdental', 'POST', `/dental/plan-items/${items[0].id}/complete`, { visit_id: dv.id, condition: 'Filling' });
    await must('dental entry', 'drdental', 'POST', '/r/dental_chart_entries', { patient_id: moh.id, visit_id: dv.id, dentition: 'Permanent', tooth_no: '47', surface: 'O', condition: 'Caries', notes: 'Early lesion, monitor' });
  }
  // second dental patient with a child chart
  await must('dental plan 2', 'drdental', 'POST', '/r/dental_treatment_plans', { patient_id: pat[4], plan_date: day(0), status: 'Proposed', notes: 'Primary teeth sealants' });
  await must('dental entry p', 'drdental', 'POST', '/r/dental_chart_entries', { patient_id: pat[4], dentition: 'Primary', tooth_no: '54', surface: 'O', condition: 'Caries', notes: 'Child - seen with Dr. Layla' });
  await must('dental entry p2', 'drdental', 'POST', '/r/dental_chart_entries', { patient_id: pat[4], dentition: 'Primary', tooth_no: '65', surface: 'Whole tooth', condition: 'Sealant' });
  await must('OTC', 'pharmacist', 'POST', '/pharmacy/otc', { items: [{ drug_id: dr('PARA500').id, qty: 2 }], customer_name: 'Walk-in customer', payment_method: 'Cash' });
  await must('session close', 'cashier', 'POST', '/billing/session/close', { closing_cash: 0 }).catch(() => {});
}

/* ---------------- generic filler: tops every page up to TARGET rows ---------------- */
const refCache = {};
async function refIds(ref) {
  if (!refCache[ref]) refCache[ref] = ((await call('admin', 'GET', `/lookup/${ref}?limit=50`)).data || []).map((x) => x.id);
  return refCache[ref];
}
const OVERRIDE = {};  // key -> (n) => extra payload, filled in by observation
function value(f, key, n) {
  const N = n + 1; const nm = f.name;
  switch (f.type) {
    case 'text':
      if (/qid|national_id|iqama|passport/.test(nm)) return `29${String(8000000000 + N * 7919 + key.length).slice(0, 9)}`;
      if (/phone|mobile|contact/.test(nm)) return `+974 55${String(10000 + N * 137).slice(0, 5)}`;
      if (/code/.test(nm)) return `${key.slice(0, 3).toUpperCase()}${N}${Math.floor(Math.random() * 900 + 100)}`;
      if (/^(name|title)$/.test(nm)) return `${f.label.replace(/ \(.*/, '')} ${N}`;
      return `${f.label.replace(/ \(.*/, '')} ${N}`.slice(0, 60);
    case 'textarea': return `Sample ${f.label.toLowerCase()} entry ${N} for demonstration.`;
    case 'email': return `sample${N}.${key}@demo.local`;
    case 'phone': return `+974 55${String(20000 + N * 211).slice(0, 5)}`;
    case 'int': return /day|year|qty|count|level|no$/.test(nm) ? N + 1 : 10 * N;
    case 'money': return 100 * N + 50;
    case 'decimal': return 10 + N;
    case 'date': return day(/expiry|due|valid_to|end|to_date/.test(nm) ? 90 + N * 30 : /birth|dob/.test(nm) ? -9000 - N * 400 : -N);
    case 'datetime': return new Date(Date.now() - N * 3600000).toISOString();
    case 'time': return `${String(8 + N).padStart(2, '0')}:00`;
    case 'bool': return f.def === 'false' ? false : true;
    case 'select': { const o = f.options || []; return f.def && o.includes(f.def) ? (n === 0 ? f.def : o[n % o.length]) : o[n % o.length]; }
    case 'password': return PASS;
    case 'json': return {};
    default: return `Sample ${N}`;
  }
}
async function fill(m, key, n) {
  const body = {};
  for (const f of m.fields) {
    if (f.readonly || f.auto) continue;
    if (f.type === 'ref') {
      if (!f.required && n % 2) continue;
      const ids = await refIds(f.ref); if (ids.length) body[f.name] = ids[n % ids.length]; continue;
    }
    body[f.name] = value(f, key, n);
  }
  Object.assign(body, (OVERRIDE[key] || (() => ({})))(n, body));
  return call('admin', 'POST', `/r/${key}`, body);
}
async function topUp() {
  const meta = (await call('admin', 'GET', '/meta')).data;
  for (let pass = 0; pass < 4; pass++) {
    let progress = false;
    for (const key of reg.order) {
      const m = meta[key]; if (!m || m.noCreate) continue;
      const have = (await call('admin', 'GET', `/r/${key}?limit=1`)).data.total;
      for (let n = have; n < TARGET; n++) {
        const r = await fill(m, key, n);
        if (r.status < 300) { progress = true; delete refCache[key]; } else { if (pass === 3) problems.push(`fill ${key}: ${r.status} ${JSON.stringify(r.data).slice(0, 170)}`); break; }
      }
    }
    if (!progress) break;
  }
}

(async () => {
  await new Promise((r) => { const s = app.listen(0, () => { BASE = `http://127.0.0.1:${s.address().port}`; r(); }); });
  for (const u of ['admin', 'reception', 'nurse', 'drsara', 'drravi', 'drdental', 'lab', 'radiology', 'pharmacist', 'cashier', 'claims']) tk[u] = (await call(null, 'POST', '/auth/login', { username: u, password: PASS })).data.token;
  const has = (await call('admin', 'GET', '/r/visits?limit=1')).data.total;
  if (has > 0 && !process.argv.includes('--force')) { console.log('Demo data already present (use --force to add more).'); process.exit(0); }
  await workflows();
  await topUp();
  const empty = [];
  for (const k of reg.order) { const n = (await db.query(`SELECT count(*)::int n FROM "${reg.resources[k].schema}"."${reg.resources[k].table}" WHERE is_deleted=false`)).rows[0].n; if (n === 0) empty.push(k); }
  console.log(`Demo data loaded. Empty pages: ${empty.length ? empty.join(', ') : 'none'}`);
  if (problems.length) console.log(`Notes (${problems.length}):\n - ${[...new Set(problems)].join('\n - ')}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
