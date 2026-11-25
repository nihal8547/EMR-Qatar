'use strict';
/** Dental: patient chart (latest state per tooth/surface), plan item completion with billing */
const express = require('express');
const db = require('../db');
const { HttpError, wrap, bad, notFound, conflict, need, audit, getVisit, addCharge } = require('../lib');
const { recalcPlan } = require('../hooks');

const router = express.Router();

async function guardPatient(req, id) {
  const p = (await db.query(`SELECT id, mrn, full_name, gender, dob, phone, blood_group FROM "mpi"."patients" WHERE id=$1 AND is_deleted=false`, [id])).rows[0];
  if (!p) throw notFound('Patient not found');
  if (req.user.restrict) {
    const rel = (await db.query(`SELECT 1 FROM "scheduling"."visits" WHERE patient_id=$1 AND doctor_id=$2 AND is_deleted=false LIMIT 1`, [id, req.user.id])).rows.length;
    const open = (await db.query(`SELECT 1 FROM "scheduling"."visits" WHERE patient_id=$1 AND visit_date=CURRENT_DATE AND status NOT IN ('Completed','Cancelled') AND is_deleted=false LIMIT 1`, [id])).rows.length;
    if (!rel && !(req.user.role_name !== 'Doctor' && open)) {
      const reason = String(req.query.breakglass || '').trim();
      if (reason.length < 8) throw new HttpError(403, 'BREAKGLASS_REQUIRED', { breakglass: true });
      await audit(null, req.user, 'BREAK_GLASS', 'dental', id, { reason }, req.ip);
    }
  }
  return p;
}

router.get('/dental/chart/:patientId', need('dental.chart'), wrap(async (req, res) => {
  const id = Number(req.params.patientId);
  if (!Number.isSafeInteger(id) || id < 1) throw bad('Invalid patient');
  const patient = await guardPatient(req, id);
  await audit(null, req.user, 'VIEW_DENTAL_CHART', 'dental', id, null, req.ip);
  const [state, history, plans, allergies, visits] = await Promise.all([
    db.query(`SELECT DISTINCT ON (dentition, tooth_no, surface) id, dentition, tooth_no, surface, condition, entry_date, notes
                FROM "dental"."dental_chart_entries" WHERE patient_id=$1 AND is_deleted=false ORDER BY dentition, tooth_no, surface, id DESC`, [id]),
    db.query(`SELECT e.id, e.dentition, e.tooth_no, e.surface, e.condition, e.entry_date, e.notes, u.full_name AS recorded_by
                FROM "dental"."dental_chart_entries" e LEFT JOIN "auth"."users" u ON u.id=e.recorded_by
               WHERE e.patient_id=$1 AND e.is_deleted=false ORDER BY e.id DESC LIMIT 100`, [id]),
    db.query(`SELECT pl.id, pl.plan_no, pl.status, pl.plan_date, pl.total, pl.notes, d.full_name AS doctor,
                (SELECT COALESCE(json_agg(json_build_object('id',i.id,'dentition',i.dentition,'tooth_no',i.tooth_no,'surface',i.surface,'service',s.name,'service_id',i.service_id,'fee',i.fee,'status',i.status,'done_on',i.done_on) ORDER BY i.id),'[]')
                   FROM "dental"."dental_plan_items" i JOIN "billing"."services" s ON s.id=i.service_id WHERE i.plan_id=pl.id AND i.is_deleted=false) AS items
                FROM "dental"."dental_treatment_plans" pl LEFT JOIN "auth"."users" d ON d.id=pl.doctor_id WHERE pl.patient_id=$1 AND pl.is_deleted=false ORDER BY pl.id DESC LIMIT 20`, [id]),
    db.query(`SELECT allergen, reaction, severity FROM "mpi"."patient_allergies" WHERE patient_id=$1 AND is_deleted=false`, [id]),
    db.query(`SELECT id, visit_no, visit_date, status FROM "scheduling"."visits" WHERE patient_id=$1 AND is_deleted=false AND status NOT IN ('Completed','Cancelled') ORDER BY id DESC LIMIT 10`, [id]),
  ]);
  res.json({ patient, state: state.rows, history: history.rows, plans: plans.rows, allergies: allergies.rows, open_visits: visits.rows });
}));

/** Mark a planned procedure done: posts a charge to the visit and (optionally) records the resulting condition on the chart. */
router.post('/dental/plan-items/:id/complete', need('dental.complete'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw bad('Invalid item');
  const out = await db.tx(async (client) => {
    const it = (await client.query(
      `SELECT i.*, pl.patient_id, pl.status AS plan_status FROM "dental"."dental_plan_items" i JOIN "dental"."dental_treatment_plans" pl ON pl.id=i.plan_id
        WHERE i.id=$1 AND i.is_deleted=false FOR UPDATE OF i`, [id])).rows[0];
    if (!it) throw notFound('Plan item not found');
    if (it.status !== 'Planned') throw conflict(`Item is already ${it.status}`);
    if (it.plan_status === 'Cancelled' || it.plan_status === 'Completed') throw conflict(`Plan is ${it.plan_status}`);
    if (!req.body.visit_id) throw bad('Select the visit to bill this procedure to');
    const visit = await getVisit(client, Number(req.body.visit_id));
    if (visit.patient_id !== it.patient_id) throw bad('That visit belongs to a different patient');
    if (['Completed', 'Cancelled'].includes(visit.status)) throw conflict(`Visit is ${visit.status}`);
    const tooth = it.tooth_no ? ` (tooth ${it.tooth_no}${it.surface && it.surface !== 'Whole tooth' ? ' ' + it.surface : ''})` : '';
    const svc = (await client.query(`SELECT name FROM "billing"."services" WHERE id=$1`, [it.service_id])).rows[0];
    const charge = await addCharge(client, { visit, service_id: it.service_id, source: 'Dental', source_id: id, description: `${svc.name}${tooth}`, unit_price: it.fee, user: req.user });
    await client.query(`UPDATE "dental"."dental_plan_items" SET status='Completed', done_on=CURRENT_DATE, done_visit_id=$2, updated_at=now(), updated_by=$3 WHERE id=$1`, [id, visit.id, req.user.id]);
    const cond = req.body.condition;
    if (cond && it.tooth_no) {
      await client.query(
        `INSERT INTO "dental"."dental_chart_entries"(patient_id, visit_id, dentition, tooth_no, surface, condition, entry_date, recorded_by, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,$8,$7,$7)`,
        [it.patient_id, visit.id, it.dentition || 'Permanent', it.tooth_no, it.surface || 'Whole tooth', cond, req.user.id, `Completed: ${svc.name}`]);
    }
    const left = (await client.query(`SELECT count(*)::int n FROM "dental"."dental_plan_items" WHERE plan_id=$1 AND is_deleted=false AND status='Planned'`, [it.plan_id])).rows[0].n;
    await client.query(`UPDATE "dental"."dental_treatment_plans" SET status=$2, updated_at=now() WHERE id=$1`, [it.plan_id, left === 0 ? 'Completed' : 'In Progress']);
    await recalcPlan(client, it.plan_id);
    await audit(client, req.user, 'DENTAL_COMPLETE', 'dental_plan_items', id, { visit_id: visit.id, charge_id: charge.id }, req.ip);
    return { charge_id: charge.id, plan_complete: left === 0 };
  });
  res.json(out);
}));

router.post('/dental/plan-items/:id/cancel', need('dental.complete'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw bad('Invalid item');
  await db.tx(async (client) => {
    const it = (await client.query(`SELECT * FROM "dental"."dental_plan_items" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [id])).rows[0];
    if (!it) throw notFound('Plan item not found');
    if (it.status !== 'Planned') throw conflict(`Item is already ${it.status}`);
    await client.query(`UPDATE "dental"."dental_plan_items" SET status='Cancelled', updated_at=now(), updated_by=$2 WHERE id=$1`, [id, req.user.id]);
    await recalcPlan(client, it.plan_id);
    await audit(client, req.user, 'DENTAL_CANCEL_ITEM', 'dental_plan_items', id, null, req.ip);
  });
  res.json({ ok: true });
}));

module.exports = router;
