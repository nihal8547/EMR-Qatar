'use strict';
/** Visit management: cancel, change doctor, edit details, change payer, reopen a cancelled visit. */
const express = require('express');
const db = require('../db');
const ops = require('../visitOps');
const vp = require('../visitPricing');
const { wrap, bad, conflict, notFound, need, audit, today, getVisit, priceFor, round2 } = require('../lib');

const router = express.Router();
const guard = need('visits.manage');
const open = (v) => { if (['Completed', 'Cancelled'].includes(v.status)) throw conflict(`This visit is ${v.status}`); };

router.post('/visits/:id/cancel', guard, wrap(async (req, res) => {
  await db.tx(async (client) => { await ops.cancelVisit(client, req.user, await getVisit(client, Number(req.params.id)), req.body?.reason, req.ip); });
  res.json({ ok: true });
}));

router.post('/visits/:id/change-doctor', guard, wrap(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  const out = await db.tx(async (client) => {
    const v = await getVisit(client, Number(req.params.id)); open(v);
    const doc = (await client.query(
      `SELECT u.id, u.full_name, u.department_id FROM "auth"."users" u JOIN "auth"."roles" r ON r.id=u.role_id WHERE u.id=$1 AND r.name='Doctor' AND u.active AND NOT u.is_deleted`, [req.body?.doctor_id])).rows[0];
    if (!doc) throw bad('Select a doctor');
    if (Number(doc.id) === Number(v.doctor_id)) throw bad('This visit is already with that doctor');
    const tok = (await client.query(`SELECT COALESCE(MAX(token_no),0)+1 AS t FROM "scheduling"."visits" WHERE doctor_id=$1 AND visit_date=$2 AND is_deleted=false`, [doc.id, v.visit_date])).rows[0].t;
    const dept = req.body?.keep_department ? v.department_id : (doc.department_id || v.department_id);
    await client.query(`UPDATE "scheduling"."visits" SET doctor_id=$2, department_id=$3, token_no=$4, updated_at=now(), updated_by=$5 WHERE id=$1`, [v.id, doc.id, dept, tok, req.user.id]);
    await client.query(`UPDATE "clinical"."encounters" SET doctor_id=$2, updated_at=now() WHERE visit_id=$1 AND status='Open' AND is_deleted=false`, [v.id, doc.id]);
    const warning = await ops.syncConsultCharge(client, req.user, v.id);
    await audit(client, req.user, 'VISIT_DOCTOR_CHANGE', 'visits', v.id, { from_doctor: v.doctor_id, to_doctor: doc.id, reason }, req.ip);
    return { token_no: tok, doctor: doc.full_name, warnings: warning ? [warning] : [] };
  });
  res.json(out);
}));

router.post('/visits/:id/update', guard, wrap(async (req, res) => {
  const b = req.body || {};
  const out = await db.tx(async (client) => {
    const v = await getVisit(client, Number(req.params.id)); open(v);
    const type = b.visit_type || v.visit_type;
    if (!['OPD', 'Emergency', 'Follow-up', 'Tele', 'Walk-in'].includes(type)) throw bad('Invalid visit type');
    if ((type === 'Walk-in') !== (v.visit_type === 'Walk-in')) throw bad('A walk-in visit cannot be changed to a consultation visit (or the other way). Start a new visit instead.');
    const dept = b.department_id !== undefined ? (b.department_id || null) : v.department_id;
    await client.query(`UPDATE "scheduling"."visits" SET complaint=$2, visit_type=$3, department_id=$4, referred_by=$5, updated_at=now(), updated_by=$6 WHERE id=$1`,
      [v.id, b.complaint !== undefined ? (b.complaint || null) : v.complaint, type, dept, b.referred_by !== undefined ? (b.referred_by || null) : v.referred_by, req.user.id]);
    let warning = null;
    if (type !== 'Walk-in' && (type !== v.visit_type || String(dept) !== String(v.department_id))) warning = await ops.syncConsultCharge(client, req.user, v.id);
    await audit(client, req.user, 'VISIT_EDIT', 'visits', v.id, { visit_type: [v.visit_type, type], department: [v.department_id, dept] }, req.ip);
    return { warnings: warning ? [warning] : [] };
  });
  res.json(out);
}));

router.post('/visits/:id/change-payer', guard, wrap(async (req, res) => {
  const b = req.body || {};
  const out = await db.tx(async (client) => {
    const v = await getVisit(client, Number(req.params.id)); open(v);
    if ((await client.query(`SELECT 1 FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false LIMIT 1`, [v.id])).rows.length) {
      throw conflict('An invoice already exists for this visit. Cancel the invoice (Patient Payments) before changing the payer.');
    }
    const payer = b.payer_type;
    if (!['Cash', 'Insurance', 'Corporate'].includes(payer)) throw bad('Invalid payer type');
    let policyId = null; let corpId = null; let elig = 'Not checked'; let eligMsg = null;
    if (payer === 'Insurance') {
      const pol = (await client.query(`SELECT * FROM "insurance"."policy_members" WHERE id=$1 AND patient_id=$2 AND is_deleted=false`, [b.policy_id, v.patient_id])).rows[0];
      if (!pol) throw bad("Select one of the patient's insurance policies");
      const t = today();
      if (pol.status !== 'Active') eligMsg = `Policy status is ${pol.status}`;
      else if (pol.valid_from && pol.valid_from > t) eligMsg = `Policy starts on ${pol.valid_from}`;
      else if (pol.valid_to < t) eligMsg = `Policy expired on ${pol.valid_to}`;
      elig = eligMsg ? 'Not eligible' : 'Eligible';
      if (elig === 'Not eligible' && v.visit_type !== 'Emergency') throw conflict(`Not eligible: ${eligMsg}. Keep the visit as Cash, or choose another policy.`);
      policyId = pol.id;
      await client.query(`INSERT INTO "insurance"."eligibility_checks"("visit_id","policy_id","status","response","checked_by","checked_at","created_by","updated_by") VALUES ($1,$2,$3,$4,$5,now(),$5,$5)`,
        [v.id, pol.id, elig, eligMsg || 'Policy active and within validity dates (simulated check)', req.user.id]);
    } else if (payer === 'Corporate') {
      const c = (await client.query(`SELECT id FROM "insurance"."corporate_accounts" WHERE id=$1 AND is_deleted=false AND active`, [b.corporate_id])).rows[0];
      if (!c) throw bad('Select an active corporate account');
      corpId = c.id;
    }
    await client.query(`UPDATE "scheduling"."visits" SET payer_type=$2, policy_id=$3, corporate_id=$4, eligibility_status=$5, updated_at=now(), updated_by=$6 WHERE id=$1`, [v.id, payer, policyId, corpId, elig, req.user.id]);
    const nv = await getVisit(client, v.id);
    const pend = (await client.query(`SELECT id, service_id, qty FROM "billing"."charges" WHERE visit_id=$1 AND status='Pending' AND is_deleted=false`, [v.id])).rows;
    for (const c of pend) {
      const { price } = await priceFor(client, c.service_id, nv);
      await client.query(`UPDATE "billing"."charges" SET unit_price=$2, amount=$3, updated_at=now() WHERE id=$1`, [c.id, price, round2(price * Number(c.qty))]);
    }
    await audit(client, req.user, 'VISIT_PAYER_CHANGE', 'visits', v.id, { from: v.payer_type, to: payer, repriced: pend.length }, req.ip);
    return { eligibility: elig, repriced: pend.length };
  });
  res.json(out);
}));

router.post('/visits/:id/reopen', guard, wrap(async (req, res) => {
  await db.tx(async (client) => {
    const v = await getVisit(client, Number(req.params.id));
    if (v.status !== 'Cancelled') throw conflict('Only a cancelled visit can be reopened');
    if (String(v.visit_date).slice(0, 10) !== today()) throw conflict('Only visits of today can be reopened. Start a new visit instead.');
    await client.query(`UPDATE "scheduling"."visits" SET status='Registered', closed_at=NULL, cancel_reason=NULL, cancelled_by=NULL, updated_at=now(), updated_by=$2 WHERE id=$1`, [v.id, req.user.id]);
    if (v.visit_type !== 'Walk-in') await ops.syncConsultCharge(client, req.user, v.id);
    await audit(client, req.user, 'VISIT_REOPEN', 'visits', v.id, null, req.ip);
  });
  res.json({ ok: true });
}));

/** Visit list for the management screen (search by visit no / MRN / name / phone, date, status). */
router.get('/visits/manage/list', guard, wrap(async (req, res) => {
  const params = []; let where = `v.is_deleted=false`;
  const q = String(req.query.q || '').trim();
  if (q) { params.push(`%${q}%`); where += ` AND (v.visit_no ILIKE $${params.length} OR p.mrn ILIKE $${params.length} OR p.full_name ILIKE $${params.length} OR p.phone ILIKE $${params.length} OR p.qid ILIKE $${params.length})`; }
  else { params.push(req.query.date || today()); where += ` AND v.visit_date=$${params.length}`; }
  if (req.query.status) { params.push(req.query.status); where += ` AND v.status=$${params.length}`; }
  const { rows } = await db.query(
    `SELECT v.id, v.visit_no, v.visit_date, v.status, v.visit_type, v.payer_type, v.token_no, v.complaint, p.mrn, p.full_name, d.full_name AS doctor_name, dep.name AS department
       FROM "scheduling"."visits" v JOIN "mpi"."patients" p ON p.id=v.patient_id LEFT JOIN "auth"."users" d ON d.id=v.doctor_id LEFT JOIN "admin"."departments" dep ON dep.id=v.department_id
      WHERE ${where} ORDER BY v.id DESC LIMIT 60`, params);
  res.json(rows);
}));

router.get('/visits/:id/manage', guard, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const v = (await db.query(
    `SELECT v.*, p.mrn, p.full_name, d.full_name AS doctor_name, dep.name AS department, cb.full_name AS cancelled_by_name
       FROM "scheduling"."visits" v JOIN "mpi"."patients" p ON p.id=v.patient_id LEFT JOIN "auth"."users" d ON d.id=v.doctor_id LEFT JOIN "admin"."departments" dep ON dep.id=v.department_id LEFT JOIN "auth"."users" cb ON cb.id=v.cancelled_by
      WHERE v.id=$1 AND v.is_deleted=false`, [id])).rows[0];
  if (!v) throw notFound('Visit not found');
  const [paid, inv, pols, depts] = await Promise.all([
    ops.paidAmount(db, id),
    db.query(`SELECT 1 FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false LIMIT 1`, [id]),
    db.query(`SELECT pm.id, py.name AS payer, pm.policy_no, pm.status, pm.valid_to FROM "insurance"."policy_members" pm JOIN "insurance"."payers" py ON py.id=pm.payer_id WHERE pm.patient_id=$1 AND pm.is_deleted=false`, [v.patient_id]),
    db.query(`SELECT id, name FROM "admin"."departments" WHERE is_deleted=false ORDER BY name`),
  ]);
  res.json({ visit: v, paid, has_invoice: inv.rows.length > 0, policies: pols.rows, departments: depts.rows });
}));

module.exports = router;
