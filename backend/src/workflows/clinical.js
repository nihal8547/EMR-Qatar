'use strict';
/** Front desk + clinical workflows: start visit, queue, patient 360, doctor consultation */
const express = require('express');
const db = require('../db');
const crud = require('../crud');
const { allergyMatches, wrap, bad, forbidden, notFound, conflict, need, can, audit, today, getVisit, addCharge, cancelCharges } = require('../lib');

const vp = require('../visitPricing');

const router = express.Router();
const VISIT_STATUSES = ['Registered', 'Triage', 'With Doctor', 'Diagnostics', 'Pharmacy', 'Billing', 'Completed', 'Cancelled'];

const age = (dob) => {
  if (!dob) return null;
  const d = new Date(dob); const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a -= 1;
  return a;
};

/* ---------------------------------------------------------------- Start visit */
router.post('/visits/start', need('visits.start'), wrap(async (req, res) => {
  const b = req.body;
  const out = await db.tx(async (client) => {
    const patient = (await client.query(`SELECT * FROM "mpi"."patients" WHERE id=$1 AND is_deleted=false AND active`, [b.patient_id])).rows[0];
    if (!patient) throw bad('Select a patient');
    const doctor = (await client.query(
      `SELECT u.id, u.department_id, u.full_name FROM "auth"."users" u JOIN "auth"."roles" r ON r.id=u.role_id
        WHERE u.id=$1 AND r.name='Doctor' AND u.active AND NOT u.is_deleted`, [b.doctor_id])).rows[0];
    if (!doctor) throw bad('Select a doctor');
    const payer_type = b.payer_type || 'Cash';
    if (!['Cash', 'Insurance', 'Corporate'].includes(payer_type)) throw bad('Invalid payer type');
    const visit_type = b.visit_type || 'OPD';
    const department_id = b.department_id || doctor.department_id || null;
    const warnings = [];

    // an open visit with the same doctor today = probable double check-in
    const dup = (await client.query(
      `SELECT visit_no FROM "scheduling"."visits" WHERE patient_id=$1 AND doctor_id=$2 AND visit_date=CURRENT_DATE
         AND status NOT IN ('Completed','Cancelled') AND is_deleted=false LIMIT 1`, [patient.id, doctor.id])).rows[0];
    if (dup && !b.allow_duplicate) throw conflict(`Patient already has open visit ${dup.visit_no} with this doctor today`);

    let eligibility = 'Not checked';
    let eligibilityMsg = null;
    let policy = null;
    if (payer_type === 'Insurance') {
      policy = (await client.query(`SELECT * FROM "insurance"."policy_members" WHERE id=$1 AND patient_id=$2 AND is_deleted=false`, [b.policy_id, patient.id])).rows[0];
      if (!policy) throw bad('Select one of the patient\'s insurance policies');
      const t = today();
      if (policy.status !== 'Active') eligibilityMsg = `Policy status is ${policy.status}`;
      else if (policy.valid_from && policy.valid_from > t) eligibilityMsg = `Policy starts on ${policy.valid_from}`;
      else if (policy.valid_to < t) eligibilityMsg = `Policy expired on ${policy.valid_to}`;
      eligibility = eligibilityMsg ? 'Not eligible' : 'Eligible';
      if (eligibility === 'Not eligible' && visit_type !== 'Emergency') {
        throw conflict(`Not eligible: ${eligibilityMsg}. Register as Cash, or choose another policy.`);
      }
      if (eligibility === 'Not eligible') warnings.push(`Emergency visit proceeds although insurance is not valid (${eligibilityMsg}). Billing will treat the payer share carefully.`);
    }
    if (payer_type === 'Corporate') {
      const c = (await client.query(`SELECT * FROM "insurance"."corporate_accounts" WHERE id=$1 AND is_deleted=false AND active`, [b.corporate_id])).rows[0];
      if (!c) throw bad('Select an active corporate account');
    }

    // check-in discount: authorised now if within the user's limit, otherwise waits for a manager
    const discount = vp.parseDiscount(b.discount);
    let discStatus = null;
    if (discount) {
      if (discount.reason.length < 3) throw bad('Give a reason for the discount');
      const corp = payer_type === 'Corporate' ? (await client.query(`SELECT id FROM "insurance"."corporate_accounts" WHERE id=$1`, [b.corporate_id])).rows[0] : null;
      const est = await vp.estimate(client, req.user, { doctor, visit_type, payer_type, policy, corporate: corp, discount });
      if (!est.service) throw bad('No consultation service is configured, so a discount cannot be calculated');
      discStatus = est.discount.authority.mode === 'direct' ? 'Applied' : 'Pending approval';
      if (discStatus === 'Pending approval') warnings.push(`Discount of ${discount.type === 'percent' ? discount.value + '%' : 'QAR ' + discount.value} is above your limit and waits for manager approval. Until then the bill is at full price.`);
    }

    const tok = (await client.query(
      `SELECT COALESCE(MAX(token_no),0)+1 AS t FROM "scheduling"."visits" WHERE doctor_id=$1 AND visit_date=CURRENT_DATE AND is_deleted=false`, [doctor.id])).rows[0].t;
    const visit_no = await db.nextCode(client, 'VIS', 6);
    const vid = (await client.query(
      `INSERT INTO "scheduling"."visits"("visit_no","patient_id","doctor_id","department_id","visit_date","visit_type","status","payer_type","policy_id","corporate_id",
         "eligibility_status","token_no","complaint","appointment_id","discount_type","discount_value","discount_reason","discount_status","discount_by","created_by","updated_by")
       VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,'Registered',$6,$7,$8,$9,$10,$11,$12,$14,$15,$16,$17,$18,$13,$13) RETURNING id`,
      [visit_no, patient.id, doctor.id, department_id, visit_type, payer_type, payer_type === 'Insurance' ? policy.id : null,
        payer_type === 'Corporate' ? b.corporate_id : null, eligibility, tok, b.complaint || null, b.appointment_id || null, req.user.id,
        discount ? discount.type : null, discount ? discount.value : null, discount ? discount.reason : null, discStatus, discount ? req.user.id : null])).rows[0].id;

    if (payer_type === 'Insurance') {
      await client.query(
        `INSERT INTO "insurance"."eligibility_checks"("visit_id","policy_id","status","response","checked_by","checked_at","created_by","updated_by")
         VALUES ($1,$2,$3,$4,$5,now(),$5,$5)`,
        [vid, policy.id, eligibility, eligibilityMsg || 'Policy active and within validity dates (simulated check)', req.user.id]);
    }
    if (b.appointment_id) {
      await client.query(`UPDATE "scheduling"."appointments" SET status='Arrived', updated_at=now() WHERE id=$1 AND patient_id=$2`, [b.appointment_id, patient.id]);
    }

    // consultation fee
    const svc = await vp.pickConsultService(client, visit_type, department_id);
    if (svc) {
      const visit = await getVisit(client, vid);
      await addCharge(client, { visit, service_id: svc.id, source: 'Consultation', source_id: vid, user: req.user });
    } else warnings.push('No consultation service found in the price list; no consultation charge was added.');

    await audit(client, req.user, 'VISIT_START', 'visits', vid, { visit_no, payer_type, discount: discount ? { ...discount, status: discStatus } : undefined }, req.ip);
    return { id: vid, visit_no, token_no: tok, eligibility, warnings, discount_status: discStatus };
  });
  res.status(201).json(out);
}));


/* ---------------------------------------------------------------- Check-in price preview + discount approval */
/** Printable prescription payload. */
router.get('/prescriptions/:id/print', need('prescriptions.view'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw notFound('Prescription not found');
  const rx = (await db.query(
    `SELECT r.id, r.rx_no, r.status, r.notes, r.created_at, p.mrn, p.full_name, p.dob, p.gender, p.qid, p.phone,
            d.full_name AS doctor, d.licence_no AS doctor_licence, v.visit_no
       FROM "clinical"."prescriptions" r JOIN "mpi"."patients" p ON p.id=r.patient_id
       LEFT JOIN "auth"."users" d ON d.id=r.doctor_id LEFT JOIN "scheduling"."visits" v ON v.id=r.visit_id
      WHERE r.id=$1 AND r.is_deleted=false`, [id])).rows[0];
  if (!rx) throw notFound('Prescription not found');
  const items = (await db.query(
    `SELECT COALESCE(g.brand_name, g.generic_name) AS drug, g.generic_name, g.strength, g.form, i.dose, i.frequency, i.route, i.duration_days, i.qty, i.instructions
       FROM "clinical"."prescription_items" i JOIN "pharmacy"."drugs" g ON g.id=i.drug_id
      WHERE i.prescription_id=$1 AND i.is_deleted=false ORDER BY i.id`, [id])).rows;
  const allergies = (await db.query(
    `SELECT a.allergen, a.severity FROM "mpi"."patient_allergies" a JOIN "clinical"."prescriptions" r ON r.patient_id=a.patient_id
      WHERE r.id=$1 AND a.is_deleted=false`, [id])).rows;
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  await audit(null, req.user, 'RX_PRINT', 'prescriptions', id, null, req.ip);
  res.json({ rx, items, allergies, centre: Object.fromEntries(s.map((r) => [r.key, r.value])) });
}));

router.get('/visits/price-preview', need('visits.start'), wrap(async (req, res) => {
  const q = req.query;
  const payer_type = ['Cash', 'Insurance', 'Corporate'].includes(q.payer_type) ? q.payer_type : 'Cash';
  const doctor = q.doctor_id ? (await db.query(`SELECT id, department_id FROM "auth"."users" WHERE id=$1 AND NOT is_deleted`, [Number(q.doctor_id) || 0])).rows[0] : null;
  const policy = payer_type === 'Insurance' && q.policy_id ? (await db.query(`SELECT * FROM "insurance"."policy_members" WHERE id=$1 AND is_deleted=false`, [Number(q.policy_id) || 0])).rows[0] : null;
  const corporate = payer_type === 'Corporate' && q.corporate_id ? (await db.query(`SELECT id, name, discount_pct FROM "insurance"."corporate_accounts" WHERE id=$1 AND is_deleted=false`, [Number(q.corporate_id) || 0])).rows[0] : null;
  const discount = vp.parseDiscount({ type: q.discount_type, value: q.discount_value });
  const est = await vp.estimate(db, req.user, { doctor, visit_type: ['OPD', 'Emergency', 'Follow-up', 'Tele'].includes(q.visit_type) ? q.visit_type : 'OPD', payer_type, policy, corporate, discount });
  if (payer_type === 'Insurance' && !policy) est.warnings = [...(est.warnings || []), 'Select the insurance policy to see the insurer / patient split.'];
  res.json({ ...est, my_limit: req.user.discount_limit, can_discount: req.user.perms.has('billing.discount') || req.user.perms.has('billing.approve_discount') });
}));

router.get('/visits/discounts/pending', need('billing.approve_discount'), wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT v.id, v.visit_no, v.discount_type, v.discount_value, v.discount_reason, v.created_at, p.mrn, p.full_name, u.full_name AS requested_by
       FROM "scheduling"."visits" v JOIN "mpi"."patients" p ON p.id=v.patient_id LEFT JOIN "auth"."users" u ON u.id=v.discount_by
      WHERE v.discount_status='Pending approval' AND v.is_deleted=false AND v.status <> 'Cancelled' ORDER BY v.id DESC LIMIT 50`);
  res.json(rows);
}));

router.post('/visits/:id/discount/decision', need('billing.approve_discount'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Visit not found');
  const approve = req.body.approve === true;
  await db.tx(async (client) => {
    const v = (await client.query(`SELECT id, discount_status FROM "scheduling"."visits" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [id])).rows[0];
    if (!v) throw notFound('Visit not found');
    if (v.discount_status !== 'Pending approval') throw conflict('This discount is not waiting for approval');
    const inv = (await client.query(`SELECT 1 FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false LIMIT 1`, [id])).rows.length;
    await client.query(`UPDATE "scheduling"."visits" SET discount_status=$2, updated_at=now() WHERE id=$1`, [id, approve ? 'Applied' : 'Rejected']);
    await audit(client, req.user, approve ? 'DISCOUNT_APPROVE' : 'DISCOUNT_REJECT', 'visits', id, { invoice_already_raised: !!inv }, req.ip);
  });
  res.json({ ok: true });
}));

/* ---------------------------------------------------------------- Queue */
router.get('/queue', need('queue.view'), wrap(async (req, res) => {
  const date = req.query.date || today();
  const params = [date];
  let where = `v.visit_date = $1 AND v.is_deleted=false`;
  if (req.query.doctor_id) { params.push(Number(req.query.doctor_id)); where += ` AND v.doctor_id=$${params.length}`; }
  if (req.query.status) { params.push(req.query.status); where += ` AND v.status=$${params.length}`; }
  if (req.query.open === '1') where += ` AND v.status NOT IN ('Completed','Cancelled')`;
  const { rows } = await db.query(
    `SELECT v.id, v.visit_no, v.token_no, v.status, v.payer_type, v.eligibility_status, v.complaint, v.visit_type, v.created_at,
            p.id AS patient_id, p.mrn, p.full_name, p.dob, p.gender, d.full_name AS doctor_name, v.doctor_id,
            EXTRACT(EPOCH FROM (now() - v.created_at))/60 AS waiting_min
       FROM "scheduling"."visits" v
       JOIN "mpi"."patients" p ON p.id=v.patient_id
       LEFT JOIN "auth"."users" d ON d.id=v.doctor_id
      WHERE ${where} ORDER BY v.doctor_id, v.token_no`, params);
  res.json(rows.map((r) => ({ ...r, age: age(r.dob), waiting_min: Math.round(r.waiting_min) })));
}));

router.put('/visits/:id/status', need('queue.view'), wrap(async (req, res) => {
  const { status } = req.body;
  if (!VISIT_STATUSES.includes(status)) throw bad('Invalid status');
  await db.tx(async (client) => {
    const v = await getVisit(client, Number(req.params.id));
    if (v.status === 'Completed' && status !== 'Completed') throw conflict('Completed visits cannot be reopened');
    if (status === 'Cancelled') {
      const paid = (await client.query(`SELECT COUNT(*)::int n FROM "billing"."payments" p JOIN "billing"."invoices" i ON i.id=p.invoice_id WHERE i.visit_id=$1`, [v.id])).rows[0].n;
      if (paid) throw conflict('A payment exists for this visit; use a refund instead of cancelling');
      await client.query(`UPDATE "billing"."charges" SET status='Cancelled', updated_at=now() WHERE visit_id=$1 AND status='Pending'`, [v.id]);
      await client.query(`UPDATE "billing"."invoices" SET status='Cancelled', updated_at=now() WHERE visit_id=$1 AND status <> 'Cancelled'`, [v.id]);
    }
    await client.query(`UPDATE "scheduling"."visits" SET status=$1, updated_at=now(), closed_at = CASE WHEN $1 IN ('Completed','Cancelled') THEN now() ELSE closed_at END WHERE id=$2`, [status, v.id]);
    await audit(client, req.user, 'VISIT_STATUS', 'visits', v.id, { from: v.status, to: status }, req.ip);
  });
  res.json({ ok: true });
}));

/* ---------------------------------------------------------------- Patient 360 */
async function access360(req, id) {
  const patient = await crud.fetchOne(db, crud.getRes('patients'), id);
  if (!patient) throw notFound('Patient not found');
  // roles flagged "restrict to own patients" must have treated the patient or give a break-glass reason
  if (req.user.restrict) {
    const rel = (await db.query(`SELECT 1 FROM "scheduling"."visits" WHERE patient_id=$1 AND doctor_id=$2 AND is_deleted=false LIMIT 1`, [id, req.user.id])).rows.length;
    const open = (await db.query(`SELECT 1 FROM "scheduling"."visits" WHERE patient_id=$1 AND visit_date=CURRENT_DATE AND status NOT IN ('Completed','Cancelled') AND is_deleted=false LIMIT 1`, [id])).rows.length;
    const nurseToday = req.user.role_name !== 'Doctor' && open;
    if (!rel && !nurseToday) {
      const reason = String(req.query.breakglass || '').trim();
      if (reason.length < 8) throw new (require('../lib').HttpError)(403, 'BREAKGLASS_REQUIRED', { breakglass: true });
      await audit(null, req.user, 'BREAK_GLASS', 'patients', id, { reason }, req.ip);
    }
  }
  return patient;
}

router.get('/patients/:id/360', need('patients.360'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const patient = await access360(req, id);
  await audit(null, req.user, 'VIEW_PATIENT_360', 'patients', id, null, req.ip);
  const [allergies, visits, vitals, invoices, labs, rx, imaging, policies, family, docs] = await Promise.all([
    db.query(`SELECT allergen, reaction, severity, noted_on FROM "mpi"."patient_allergies" WHERE patient_id=$1 AND is_deleted=false`, [id]),
    db.query(`SELECT v.id, v.visit_no, v.visit_date, v.status, v.payer_type, d.full_name AS doctor, e.chief_complaint, e.assessment,
                     (SELECT string_agg(dc.code || ' ' || dc.description, '; ') FROM "clinical"."diagnoses" dx JOIN "clinical"."diagnosis_codes" dc ON dc.id=dx.code_id WHERE dx.visit_id=v.id AND dx.is_deleted=false) AS diagnoses
                FROM "scheduling"."visits" v LEFT JOIN "auth"."users" d ON d.id=v.doctor_id LEFT JOIN "clinical"."encounters" e ON e.visit_id=v.id AND e.is_deleted=false
               WHERE v.patient_id=$1 AND v.is_deleted=false ORDER BY v.id DESC LIMIT 20`, [id]),
    db.query(`SELECT recorded_at, temperature, pulse, bp_systolic, bp_diastolic, spo2, weight_kg, height_cm FROM "clinical"."vitals" WHERE patient_id=$1 AND is_deleted=false ORDER BY id DESC LIMIT 5`, [id]),
    db.query(`SELECT id, invoice_no, invoice_date, net, patient_share, payer_share, paid, balance, status FROM "billing"."invoices" WHERE patient_id=$1 AND is_deleted=false ORDER BY id DESC LIMIT 10`, [id]),
    db.query(`SELECT o.id, o.order_no, o.status, o.ordered_at, (SELECT string_agg(t.name || COALESCE(': ' || i.result_value::text || ' ' || COALESCE(t.unit,''), ''), '; ') FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id WHERE i.order_id=o.id AND i.is_deleted=false) AS tests
                FROM "lab"."lab_orders" o WHERE o.patient_id=$1 AND o.is_deleted=false ORDER BY o.id DESC LIMIT 10`, [id]),
    db.query(`SELECT r.id, r.rx_no, r.status, r.created_at, (SELECT string_agg(d.generic_name || ' ' || COALESCE(d.strength,''), '; ') FROM "clinical"."prescription_items" i JOIN "pharmacy"."drugs" d ON d.id=i.drug_id WHERE i.prescription_id=r.id AND i.is_deleted=false) AS medicines
                FROM "clinical"."prescriptions" r WHERE r.patient_id=$1 AND r.is_deleted=false ORDER BY r.id DESC LIMIT 10`, [id]),
    db.query(`SELECT o.id, o.order_no, o.status, s.name AS study FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id WHERE o.patient_id=$1 AND o.is_deleted=false ORDER BY o.id DESC LIMIT 10`, [id]),
    db.query(`SELECT pm.id, pm.policy_no, pm.member_id, pm.valid_to, pm.status, py.name AS payer, pl.name AS plan FROM "insurance"."policy_members" pm
                JOIN "insurance"."payers" py ON py.id=pm.payer_id LEFT JOIN "insurance"."plans" pl ON pl.id=pm.plan_id WHERE pm.patient_id=$1 AND pm.is_deleted=false`, [id]),
    db.query(`SELECT name, relation, phone FROM "mpi"."patient_family" WHERE patient_id=$1 AND is_deleted=false`, [id]),
    db.query(`SELECT doc_type, file_name, expiry FROM "mpi"."patient_documents" WHERE patient_id=$1 AND is_deleted=false`, [id]),
  ]);
  res.json({ patient: { ...patient, age: age(patient.dob) }, allergies: allergies.rows, visits: visits.rows, vitals: vitals.rows, invoices: can(req, 'invoices.view') ? invoices.rows : [], labs: labs.rows, prescriptions: rx.rows, imaging: imaging.rows, policies: policies.rows, family: family.rows, documents: docs.rows });
}));

/* Full history: every visit with everything done in it */
router.get('/patients/:id/history', need('patients.360'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const patient = await access360(req, id);
  await audit(null, req.user, 'VIEW_PATIENT_HISTORY', 'patients', id, null, req.ip);
  const money = can(req, 'invoices.view');
  const q = (sql) => db.query(sql, [id]).then((r) => r.rows);
  const [visits, encs, dx, vitals, notes, labs, imgs, rx, procs, certs, refs, dental, invs, pays, allergies, consents, docs] = await Promise.all([
    q(`SELECT v.id, v.visit_no, v.visit_date, v.visit_type, v.status, v.payer_type, v.token_no, v.complaint, d.full_name AS doctor, dep.name AS department
         FROM "scheduling"."visits" v LEFT JOIN "auth"."users" d ON d.id=v.doctor_id LEFT JOIN "admin"."departments" dep ON dep.id=v.department_id
        WHERE v.patient_id=$1 AND v.is_deleted=false ORDER BY v.visit_date DESC, v.id DESC`),
    q(`SELECT visit_id, chief_complaint, history, examination, assessment, plan, follow_up_date FROM "clinical"."encounters" WHERE patient_id=$1 AND is_deleted=false`),
    q(`SELECT dx.visit_id, dc.code, dc.description, dx.dx_type, dx.notes FROM "clinical"."diagnoses" dx JOIN "clinical"."diagnosis_codes" dc ON dc.id=dx.code_id WHERE dx.patient_id=$1 AND dx.is_deleted=false ORDER BY dx.id`),
    q(`SELECT visit_id, recorded_at, temperature, pulse, bp_systolic, bp_diastolic, resp_rate, spo2, weight_kg, height_cm, pain_score, triage_level, notes FROM "clinical"."vitals" WHERE patient_id=$1 AND is_deleted=false ORDER BY id`),
    q(`SELECT visit_id, noted_at, note FROM "clinical"."nursing_notes" WHERE patient_id=$1 AND is_deleted=false ORDER BY id`),
    q(`SELECT o.id AS order_id, o.visit_id, o.order_no, o.status, o.priority, o.ordered_at, t.name AS test, t.unit, t.ref_low, t.ref_high, i.result_value, i.result_text, i.flag, i.status AS item_status, i.resulted_at
         FROM "lab"."lab_orders" o LEFT JOIN "lab"."lab_order_items" i ON i.order_id=o.id AND i.is_deleted=false LEFT JOIN "lab"."lab_tests" t ON t.id=i.test_id
        WHERE o.patient_id=$1 AND o.is_deleted=false ORDER BY o.id, i.id`),
    q(`SELECT o.id, o.visit_id, o.order_no, o.status, o.priority, o.ordered_at, o.clinical_info, s.name AS study, r.findings, r.impression, r.status AS report_status, r.reported_at
         FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id LEFT JOIN "radiology"."imaging_reports" r ON r.order_id=o.id AND r.is_deleted=false
        WHERE o.patient_id=$1 AND o.is_deleted=false ORDER BY o.id`),
    q(`SELECT r.id AS rx_id, r.visit_id, r.rx_no, r.status, r.created_at, r.notes, d.generic_name, d.strength, i.dose, i.frequency, i.route, i.duration_days, i.qty, i.dispensed_qty, i.instructions
         FROM "clinical"."prescriptions" r LEFT JOIN "clinical"."prescription_items" i ON i.prescription_id=r.id AND i.is_deleted=false LEFT JOIN "pharmacy"."drugs" d ON d.id=i.drug_id
        WHERE r.patient_id=$1 AND r.is_deleted=false ORDER BY r.id, i.id`),
    q(`SELECT po.visit_id, s.name AS service, po.status, po.notes FROM "clinical"."procedure_orders" po JOIN "billing"."services" s ON s.id=po.service_id WHERE po.patient_id=$1 AND po.is_deleted=false ORDER BY po.id`),
    q(`SELECT visit_id, cert_type, days, from_date, remarks FROM "clinical"."certificates" WHERE patient_id=$1 AND is_deleted=false ORDER BY id`),
    q(`SELECT visit_id, to_facility, to_department, urgency, reason FROM "clinical"."referrals" WHERE patient_id=$1 AND is_deleted=false ORDER BY id`),
    q(`SELECT visit_id, entry_date, dentition, tooth_no, surface, condition, notes FROM "dental"."dental_chart_entries" WHERE patient_id=$1 AND is_deleted=false ORDER BY entry_date, id`),
    money ? q(`SELECT id, visit_id, invoice_no, invoice_date, gross, discount, net, patient_share, payer_share, paid, balance, status FROM "billing"."invoices" WHERE patient_id=$1 AND is_deleted=false ORDER BY id`) : [],
    money ? q(`SELECT p.invoice_id, p.receipt_no, p.kind, p.amount, p.method, p.paid_at FROM "billing"."payments" p WHERE p.patient_id=$1 ORDER BY p.id`) : [],
    q(`SELECT allergen, reaction, severity, noted_on FROM "mpi"."patient_allergies" WHERE patient_id=$1 AND is_deleted=false`),
    q(`SELECT consent_type, signed_at, withdrawn FROM "mpi"."consents" WHERE patient_id=$1 AND is_deleted=false ORDER BY id DESC`),
    q(`SELECT doc_type, file_name, expiry FROM "mpi"."patient_documents" WHERE patient_id=$1 AND is_deleted=false`),
  ]);
  const by = (arr) => arr.reduce((m, r) => ((m[r.visit_id] = m[r.visit_id] || []).push(r), m), {});
  const E = Object.fromEntries(encs.map((e) => [e.visit_id, e]));
  const DX = by(dx), VT = by(vitals), NN = by(notes), PR = by(procs), CE = by(certs), RF = by(refs), DN = by(dental), IM = by(imgs);
  const group = (rows, key) => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], { ...r, items: [] }); if (r.test || r.generic_name) m.get(r[key]).items.push(r); } return [...m.values()]; };
  const LB = by(group(labs, 'order_id')), RX = by(group(rx, 'rx_id'));
  const payByInv = pays.reduce((m, r) => ((m[r.invoice_id] = m[r.invoice_id] || []).push(r), m), {});
  const INV = by(invs.map((i) => ({ ...i, payments: payByInv[i.id] || [] })));
  const out = visits.map((v) => ({
    ...v, encounter: E[v.id] || null, diagnoses: DX[v.id] || [], vitals: VT[v.id] || [], nursing_notes: NN[v.id] || [], labs: LB[v.id] || [], imaging: IM[v.id] || [],
    prescriptions: RX[v.id] || [], procedures: PR[v.id] || [], certificates: CE[v.id] || [], referrals: RF[v.id] || [], dental: DN[v.id] || [], invoices: INV[v.id] || [],
  }));
  const totals = money ? { billed: invs.reduce((a, i) => a + Number(i.net || 0), 0), paid: invs.reduce((a, i) => a + Number(i.paid || 0), 0), due: invs.reduce((a, i) => a + Number(i.balance || 0), 0) } : null;
  res.json({ patient: { ...patient, age: age(patient.dob) }, allergies, consents, documents: docs, visits: out, dental_no_visit: dental.filter((d) => !d.visit_id), totals });
}));

/* ---------------------------------------------------------------- Consultation */
const consultGuard = need('consult.use');

router.get('/consult/list', consultGuard, wrap(async (req, res) => {
  const mayViewOthers = req.user.perms.has('visits.view') && req.user.role_name !== 'Doctor';
  const doctorId = req.query.doctor_id && mayViewOthers ? Number(req.query.doctor_id) : req.user.id;
  const { rows } = await db.query(
    `SELECT v.id, v.visit_no, v.token_no, v.status, v.complaint, v.visit_type, v.payer_type, p.mrn, p.full_name, p.dob, p.gender,
            EXTRACT(EPOCH FROM (now() - v.created_at))/60 AS waiting_min,
            (SELECT COUNT(*)::int FROM "mpi"."patient_allergies" a WHERE a.patient_id=p.id AND a.is_deleted=false) AS allergies,
            (SELECT x.triage_level FROM "clinical"."vitals" x WHERE x.visit_id=v.id AND x.is_deleted=false ORDER BY x.id DESC LIMIT 1) AS triage_level
       FROM "scheduling"."visits" v JOIN "mpi"."patients" p ON p.id=v.patient_id
      WHERE v.doctor_id=$1 AND v.visit_date=CURRENT_DATE AND v.is_deleted=false AND v.status NOT IN ('Cancelled')
      ORDER BY (v.status='Completed'), v.token_no`, [doctorId]);
  res.json(rows.map((r) => ({ ...r, age: age(r.dob), waiting_min: Math.round(r.waiting_min) })));
}));

async function loadVisitForDoctor(client, req, visitId) {
  const v = await getVisit(client, visitId);
  if (req.user.role_name === 'Doctor' && v.doctor_id !== req.user.id) throw forbidden('This visit belongs to another doctor');
  if (['Completed', 'Cancelled'].includes(v.status)) throw conflict(`Visit is ${v.status}`);
  return v;
}

router.get('/consult/:visitId', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const v = await getVisit(db, vid);
  if (req.user.role_name === 'Doctor' && v.doctor_id !== req.user.id) throw forbidden('This visit belongs to another doctor');
  const patient = await crud.fetchOne(db, crud.getRes('patients'), v.patient_id);
  await audit(null, req.user, 'VIEW_CONSULT', 'visits', vid, null, req.ip);
  const [allergies, vitals, enc, dx, lab, img, rx, proc, pre, past, charges] = await Promise.all([
    db.query(`SELECT allergen, reaction, severity FROM "mpi"."patient_allergies" WHERE patient_id=$1 AND is_deleted=false`, [v.patient_id]),
    db.query(`SELECT * FROM "clinical"."vitals" WHERE visit_id=$1 AND is_deleted=false ORDER BY id DESC LIMIT 1`, [vid]),
    db.query(`SELECT * FROM "clinical"."encounters" WHERE visit_id=$1 AND is_deleted=false`, [vid]),
    db.query(`SELECT dx.id, dx.dx_type, dx.notes, dc.code, dc.description FROM "clinical"."diagnoses" dx JOIN "clinical"."diagnosis_codes" dc ON dc.id=dx.code_id WHERE dx.visit_id=$1 AND dx.is_deleted=false ORDER BY dx.id`, [vid]),
    db.query(`SELECT o.id, o.order_no, o.status, o.priority,
                     (SELECT json_agg(json_build_object('id',i.id,'test',t.name,'result',COALESCE(i.result_text, i.result_value::text),'unit',t.unit,'flag',i.flag,'status',i.status) ORDER BY i.id)
                        FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id WHERE i.order_id=o.id AND i.is_deleted=false) AS items
                FROM "lab"."lab_orders" o WHERE o.visit_id=$1 AND o.is_deleted=false ORDER BY o.id`, [vid]),
    db.query(`SELECT o.id, o.order_no, o.status, s.name AS study, (SELECT impression FROM "radiology"."imaging_reports" r WHERE r.order_id=o.id AND r.is_deleted=false ORDER BY id DESC LIMIT 1) AS impression
                FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id WHERE o.visit_id=$1 AND o.is_deleted=false ORDER BY o.id`, [vid]),
    db.query(`SELECT r.id, r.rx_no, r.status, (SELECT json_agg(json_build_object('id',i.id,'drug',d.generic_name || ' ' || COALESCE(d.strength,''),'dose',i.dose,'frequency',i.frequency,'days',i.duration_days,'qty',i.qty,'dispensed',i.dispensed_qty) ORDER BY i.id)
                       FROM "clinical"."prescription_items" i JOIN "pharmacy"."drugs" d ON d.id=i.drug_id WHERE i.prescription_id=r.id AND i.is_deleted=false) AS items
                FROM "clinical"."prescriptions" r WHERE r.visit_id=$1 AND r.is_deleted=false ORDER BY r.id`, [vid]),
    db.query(`SELECT po.id, po.status, s.name FROM "clinical"."procedure_orders" po JOIN "billing"."services" s ON s.id=po.service_id WHERE po.visit_id=$1 AND po.is_deleted=false ORDER BY po.id`, [vid]),
    db.query(`SELECT pa.auth_no, pa.status, s.name FROM "insurance"."pre_auths" pa JOIN "billing"."services" s ON s.id=pa.service_id WHERE pa.visit_id=$1 AND pa.is_deleted=false`, [vid]),
    db.query(`SELECT v.visit_date, v.visit_no, e.chief_complaint, e.assessment, (SELECT string_agg(dc.code || ' ' || dc.description, '; ') FROM "clinical"."diagnoses" dx JOIN "clinical"."diagnosis_codes" dc ON dc.id=dx.code_id WHERE dx.visit_id=v.id AND dx.is_deleted=false) AS diagnoses
                FROM "scheduling"."visits" v LEFT JOIN "clinical"."encounters" e ON e.visit_id=v.id WHERE v.patient_id=$1 AND v.id<>$2 AND v.is_deleted=false ORDER BY v.id DESC LIMIT 5`, [v.patient_id, vid]),
    db.query(`SELECT description, qty, amount, status FROM "billing"."charges" WHERE visit_id=$1 AND is_deleted=false AND status <> 'Cancelled' ORDER BY id`, [vid]),
  ]);
  res.json({
    visit: v, patient: { ...patient, age: age(patient.dob) }, allergies: allergies.rows, vitals: vitals.rows[0] || null, encounter: enc.rows[0] || null,
    diagnoses: dx.rows, lab_orders: lab.rows, imaging_orders: img.rows, prescriptions: rx.rows, procedures: proc.rows, preauths: pre.rows, past_visits: past.rows, charges: charges.rows,
  });
}));

router.put('/consult/:visitId/encounter', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const b = req.body;
  await db.tx(async (client) => {
    const v = await loadVisitForDoctor(client, req, vid);
    const ex = (await client.query(`SELECT id FROM "clinical"."encounters" WHERE visit_id=$1 AND is_deleted=false`, [vid])).rows[0];
    const vals = [b.chief_complaint || null, b.history || null, b.examination || null, b.assessment || null, b.plan || null, b.follow_up_date || null];
    if (ex) {
      await client.query(
        `UPDATE "clinical"."encounters" SET chief_complaint=$1, history=$2, examination=$3, assessment=$4, plan=$5, follow_up_date=$6, updated_at=now(), updated_by=$7 WHERE id=$8`,
        [...vals, req.user.id, ex.id]);
    } else {
      await client.query(
        `INSERT INTO "clinical"."encounters"("visit_id","patient_id","doctor_id","chief_complaint","history","examination","assessment","plan","follow_up_date","status","created_by","updated_by")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Open',$10,$10)`, [vid, v.patient_id, v.doctor_id, ...vals, req.user.id]);
    }
    if (['Registered', 'Triage'].includes(v.status)) await client.query(`UPDATE "scheduling"."visits" SET status='With Doctor', updated_at=now() WHERE id=$1`, [vid]);
    await audit(client, req.user, 'ENCOUNTER_SAVE', 'encounters', vid, null, req.ip);
  });
  res.json({ ok: true });
}));

router.post('/consult/:visitId/diagnoses', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  await db.tx(async (client) => {
    const v = await loadVisitForDoctor(client, req, vid);
    const code = (await client.query(`SELECT id FROM "clinical"."diagnosis_codes" WHERE id=$1 AND is_deleted=false`, [req.body.code_id])).rows[0];
    if (!code) throw bad('Select a diagnosis');
    const dup = (await client.query(`SELECT 1 FROM "clinical"."diagnoses" WHERE visit_id=$1 AND code_id=$2 AND is_deleted=false`, [vid, code.id])).rows.length;
    if (dup) throw conflict('Diagnosis already added');
    const hasPrimary = (await client.query(`SELECT 1 FROM "clinical"."diagnoses" WHERE visit_id=$1 AND dx_type='Primary' AND is_deleted=false`, [vid])).rows.length;
    await client.query(
      `INSERT INTO "clinical"."diagnoses"("visit_id","patient_id","code_id","dx_type","notes","created_by","updated_by") VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [vid, v.patient_id, code.id, hasPrimary ? (req.body.dx_type || 'Secondary') : 'Primary', req.body.notes || null, req.user.id]);
  });
  res.status(201).json({ ok: true });
}));

router.delete('/consult/:visitId/diagnoses/:id', consultGuard, wrap(async (req, res) => {
  await db.tx(async (client) => {
    await loadVisitForDoctor(client, req, Number(req.params.visitId));
    await client.query(`UPDATE "clinical"."diagnoses" SET is_deleted=true, updated_at=now() WHERE id=$1 AND visit_id=$2`, [Number(req.params.id), Number(req.params.visitId)]);
  });
  res.json({ ok: true });
}));

router.post('/consult/:visitId/lab-orders', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const out = await db.tx(async (client) => {
    const v = await loadVisitForDoctor(client, req, vid);
    let testIds = (req.body.test_ids || []).map(Number);
    if (req.body.panel_id) {
      const p = await client.query(`SELECT test_id FROM "lab"."lab_panel_tests" WHERE panel_id=$1 AND is_deleted=false`, [Number(req.body.panel_id)]);
      testIds = testIds.concat(p.rows.map((r) => r.test_id));
    }
    testIds = [...new Set(testIds)].filter(Boolean);
    if (!testIds.length) throw bad('Select at least one test');
    const tests = (await client.query(`SELECT * FROM "lab"."lab_tests" WHERE id = ANY($1::bigint[]) AND active AND is_deleted=false`, [testIds])).rows;
    if (tests.length !== testIds.length) throw bad('One of the tests is not available');
    const priority = ['Routine', 'Urgent', 'STAT'].includes(req.body.priority) ? req.body.priority : 'Routine';
    const no = await db.nextCode(client, 'LAB', 6);
    const oid = (await client.query(
      `INSERT INTO "lab"."lab_orders"("order_no","visit_id","patient_id","doctor_id","status","priority","ordered_at","notes","created_by","updated_by")
       VALUES ($1,$2,$3,$4,'Ordered',$5,now(),$6,$7,$7) RETURNING id`, [no, vid, v.patient_id, req.user.role_name === 'Doctor' ? req.user.id : v.doctor_id, priority, req.body.notes || null, req.user.id])).rows[0].id;
    for (const t of tests) {
      const iid = (await client.query(`INSERT INTO "lab"."lab_order_items"("order_id","test_id","status","created_by","updated_by") VALUES ($1,$2,'Pending',$3,$3) RETURNING id`, [oid, t.id, req.user.id])).rows[0].id;
      if (t.service_id) await addCharge(client, { visit: v, service_id: t.service_id, source: 'Lab', source_id: iid, user: req.user });
    }
    await client.query(`UPDATE "scheduling"."visits" SET status='Diagnostics', updated_at=now() WHERE id=$1 AND status IN ('Registered','Triage','With Doctor')`, [vid]);
    await audit(client, req.user, 'LAB_ORDER', 'lab_orders', oid, { tests: tests.map((t) => t.code) }, req.ip);
    return { id: oid, order_no: no };
  });
  res.status(201).json(out);
}));

router.post('/consult/:visitId/imaging-orders', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const out = await db.tx(async (client) => {
    const v = await loadVisitForDoctor(client, req, vid);
    const svc = (await client.query(`SELECT id FROM "billing"."services" WHERE id=$1 AND category='Radiology' AND active AND is_deleted=false`, [req.body.service_id])).rows[0];
    if (!svc) throw bad('Select a radiology study');
    const no = await db.nextCode(client, 'IMG', 6);
    const oid = (await client.query(
      `INSERT INTO "radiology"."imaging_orders"("order_no","visit_id","patient_id","doctor_id","service_id","modality_id","status","priority","clinical_info","ordered_at","created_by","updated_by")
       VALUES ($1,$2,$3,$4,$5,$6,'Ordered',$7,$8,now(),$9,$9) RETURNING id`,
      [no, vid, v.patient_id, v.doctor_id, svc.id, req.body.modality_id || null, req.body.priority || 'Routine', req.body.clinical_info || null, req.user.id])).rows[0].id;
    await addCharge(client, { visit: v, service_id: svc.id, source: 'Radiology', source_id: oid, user: req.user });
    await client.query(`UPDATE "scheduling"."visits" SET status='Diagnostics', updated_at=now() WHERE id=$1 AND status IN ('Registered','Triage','With Doctor')`, [vid]);
    return { id: oid, order_no: no };
  });
  res.status(201).json(out);
}));

router.post('/consult/:visitId/procedures', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const out = await db.tx(async (client) => {
    const v = await loadVisitForDoctor(client, req, vid);
    const svc = (await client.query(`SELECT id FROM "billing"."services" WHERE id=$1 AND category='Procedure' AND active AND is_deleted=false`, [req.body.service_id])).rows[0];
    if (!svc) throw bad('Select a procedure');
    const pid = (await client.query(
      `INSERT INTO "clinical"."procedure_orders"("visit_id","patient_id","service_id","status","notes","created_by","updated_by") VALUES ($1,$2,$3,'Ordered',$4,$5,$5) RETURNING id`,
      [vid, v.patient_id, svc.id, req.body.notes || null, req.user.id])).rows[0].id;
    await addCharge(client, { visit: v, service_id: svc.id, source: 'Procedure', source_id: pid, user: req.user });
    return { id: pid };
  });
  res.status(201).json(out);
}));

/** Cancel an order that has not started. */
router.post('/consult/:visitId/cancel-order', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const { type, id } = req.body;
  await db.tx(async (client) => {
    await loadVisitForDoctor(client, req, vid);
    if (type === 'lab') {
      const o = (await client.query(`SELECT * FROM "lab"."lab_orders" WHERE id=$1 AND visit_id=$2 AND is_deleted=false`, [id, vid])).rows[0];
      if (!o) throw notFound('Order not found');
      if (o.status !== 'Ordered') throw conflict('Sample already collected; ask the lab to cancel');
      const items = (await client.query(`SELECT id FROM "lab"."lab_order_items" WHERE order_id=$1`, [id])).rows;
      for (const i of items) await cancelCharges(client, 'Lab', i.id);
      await client.query(`UPDATE "lab"."lab_orders" SET status='Cancelled', updated_at=now() WHERE id=$1`, [id]);
    } else if (type === 'imaging') {
      const o = (await client.query(`SELECT * FROM "radiology"."imaging_orders" WHERE id=$1 AND visit_id=$2 AND is_deleted=false`, [id, vid])).rows[0];
      if (!o) throw notFound('Order not found');
      if (o.status !== 'Ordered') throw conflict('Study already in progress');
      await cancelCharges(client, 'Radiology', id);
      await client.query(`UPDATE "radiology"."imaging_orders" SET is_deleted=true, updated_at=now() WHERE id=$1`, [id]);
    } else if (type === 'procedure') {
      const o = (await client.query(`SELECT * FROM "clinical"."procedure_orders" WHERE id=$1 AND visit_id=$2 AND is_deleted=false`, [id, vid])).rows[0];
      if (!o) throw notFound('Procedure not found');
      if (o.status !== 'Ordered') throw conflict('Procedure already done');
      await cancelCharges(client, 'Procedure', id);
      await client.query(`UPDATE "clinical"."procedure_orders" SET status='Cancelled', updated_at=now() WHERE id=$1`, [id]);
    } else throw bad('Unknown order type');
    await audit(client, req.user, 'ORDER_CANCEL', type, id, null, req.ip);
  });
  res.json({ ok: true });
}));

/* ---- prescription with safety checks ---- */
async function safetyChecks(client, patientId, drugs, visitId) {
  const warnings = [];
  let blocked = false;
  const allergies = (await client.query(`SELECT allergen, severity, reaction FROM "mpi"."patient_allergies" WHERE patient_id=$1 AND is_deleted=false`, [patientId])).rows;
  for (const d of drugs) {
    for (const a of allergies) {
      if (allergyMatches(a.allergen, d.generic_name, d.brand_name)) {
        warnings.push({ level: a.severity === 'Severe' ? 'critical' : 'warning', text: `${d.generic_name}: patient is allergic to "${a.allergen}"${a.reaction ? ` (${a.reaction})` : ''}` });
      }
    }
  }
  // interactions among new drugs and drugs already prescribed (any open prescription of this patient)
  const existing = (await client.query(
    `SELECT DISTINCT i.drug_id FROM "clinical"."prescription_items" i JOIN "clinical"."prescriptions" r ON r.id=i.prescription_id
      WHERE r.patient_id=$1 AND r.status IN ('Pending','Partially Dispensed') AND r.is_deleted=false AND i.is_deleted=false`, [patientId])).rows.map((r) => r.drug_id);
  const all = [...new Set([...drugs.map((d) => d.id), ...existing])];
  if (all.length > 1) {
    const ix = (await client.query(
      `SELECT di.severity, di.note, a.generic_name AS a_name, b.generic_name AS b_name, di.drug_a_id, di.drug_b_id
         FROM "pharmacy"."drug_interactions" di JOIN "pharmacy"."drugs" a ON a.id=di.drug_a_id JOIN "pharmacy"."drugs" b ON b.id=di.drug_b_id
        WHERE di.is_deleted=false AND di.drug_a_id = ANY($1::bigint[]) AND di.drug_b_id = ANY($1::bigint[])`, [all])).rows;
    const newIds = new Set(drugs.map((d) => d.id));
    for (const i of ix) {
      if (!newIds.has(i.drug_a_id) && !newIds.has(i.drug_b_id)) continue;
      if (i.severity === 'Contraindicated') blocked = true;
      warnings.push({ level: i.severity === 'Contraindicated' ? 'blocked' : i.severity === 'Major' ? 'critical' : 'warning', text: `${i.a_name} + ${i.b_name}: ${i.severity}${i.note ? ' - ' + i.note : ''}` });
    }
  }
  return { warnings, blocked };
}

router.post('/consult/:visitId/prescriptions', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const items = req.body.items || [];
  if (!items.length) throw bad('Add at least one medicine');
  const out = await db.tx(async (client) => {
    const v = await loadVisitForDoctor(client, req, vid);
    const drugIds = [...new Set(items.map((i) => Number(i.drug_id)))];
    const drugs = (await client.query(`SELECT * FROM "pharmacy"."drugs" WHERE id = ANY($1::bigint[]) AND active AND is_deleted=false`, [drugIds])).rows;
    if (drugs.length !== drugIds.length) throw bad('A selected medicine is not available');
    for (const i of items) if (!(Number(i.qty) > 0)) throw bad('Quantity must be greater than zero for every medicine');
    const { warnings, blocked } = await safetyChecks(client, v.patient_id, drugs, vid);
    if (blocked) throw new (require('../lib').HttpError)(409, 'Contraindicated combination - prescription blocked', { warnings });
    if (warnings.length && !req.body.ack_warnings) throw new (require('../lib').HttpError)(409, 'SAFETY_WARNINGS', { warnings, needs_ack: true });
    const no = await db.nextCode(client, 'RX', 6);
    const rid = (await client.query(
      `INSERT INTO "clinical"."prescriptions"("rx_no","visit_id","patient_id","doctor_id","status","notes","created_by","updated_by") VALUES ($1,$2,$3,$4,'Pending',$5,$6,$6) RETURNING id`,
      [no, vid, v.patient_id, v.doctor_id, warnings.length ? `Warnings acknowledged: ${warnings.map((w) => w.text).join(' | ')}`.slice(0, 500) : (req.body.notes || null), req.user.id])).rows[0].id;
    for (const i of items) {
      await client.query(
        `INSERT INTO "clinical"."prescription_items"("prescription_id","drug_id","dose","frequency","route","duration_days","qty","instructions","dispensed_qty","created_by","updated_by")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$9)`,
        [rid, Number(i.drug_id), i.dose || null, i.frequency || null, i.route || 'Oral', i.duration_days || null, Number(i.qty), i.instructions || null, req.user.id]);
    }
    await audit(client, req.user, 'PRESCRIBE', 'prescriptions', rid, { warnings: warnings.length }, req.ip);
    return { id: rid, rx_no: no, warnings };
  });
  res.status(201).json(out);
}));

router.post('/consult/:visitId/complete', consultGuard, wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const out = await db.tx(async (client) => {
    const v = await loadVisitForDoctor(client, req, vid);
    const enc = (await client.query(`SELECT * FROM "clinical"."encounters" WHERE visit_id=$1 AND is_deleted=false`, [vid])).rows[0];
    if (!enc || !(enc.assessment || enc.chief_complaint)) throw bad('Save the consultation notes first');
    const dx = (await client.query(`SELECT count(*)::int n FROM "clinical"."diagnoses" WHERE visit_id=$1 AND is_deleted=false`, [vid])).rows[0].n;
    if (!dx) throw bad('Add at least one diagnosis before completing the consultation');
    await client.query(`UPDATE "clinical"."encounters" SET status='Completed', follow_up_date=COALESCE($2, follow_up_date), updated_at=now() WHERE id=$1`, [enc.id, req.body.follow_up_date || null]);
    const pendLab = (await client.query(`SELECT 1 FROM "lab"."lab_orders" WHERE visit_id=$1 AND status NOT IN ('Validated','Cancelled') AND is_deleted=false LIMIT 1`, [vid])).rows.length;
    const pendImg = (await client.query(`SELECT 1 FROM "radiology"."imaging_orders" WHERE visit_id=$1 AND status <> 'Reported' AND is_deleted=false LIMIT 1`, [vid])).rows.length;
    const pendRx = (await client.query(`SELECT 1 FROM "clinical"."prescriptions" WHERE visit_id=$1 AND status IN ('Pending','Partially Dispensed') AND is_deleted=false LIMIT 1`, [vid])).rows.length;
    const next = pendLab || pendImg ? 'Diagnostics' : pendRx ? 'Pharmacy' : 'Billing';
    await client.query(`UPDATE "scheduling"."visits" SET status=$1, updated_at=now() WHERE id=$2`, [next, vid]);
    if (next === 'Billing') await require('../billingCore').settleVisit(client, vid);
    await audit(client, req.user, 'CONSULT_COMPLETE', 'visits', vid, { next }, req.ip);
    return { next_status: next };
  });
  res.json(out);
}));

module.exports = router;
