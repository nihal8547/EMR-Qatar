'use strict';
/** Patient portal: a patient sees only their own records. */
const express = require('express');
const db = require('../db');
const { wrap, bad, notFound, conflict, forbidden, need, audit, today } = require('../lib');

const router = express.Router();

// every portal route needs a patient login linked to a patient record
router.use('/portal', need('portal.use'), (req, res, next) => {
  if (!req.user.patient_id) return next(forbidden('This login is not linked to a patient record'));
  next();
});

router.get('/portal/summary', wrap(async (req, res) => {
  const pid = req.user.patient_id;
  const patient = (await db.query(`SELECT id, mrn, full_name, dob, gender, phone, email, blood_group FROM "mpi"."patients" WHERE id=$1 AND is_deleted=false`, [pid])).rows[0];
  if (!patient) throw notFound('Patient record not found');
  const appts = (await db.query(
    `SELECT a.id, a.appt_no, a.appt_date, a.appt_time, a.type, a.status, u.full_name AS doctor, d.name AS department
       FROM "scheduling"."appointments" a LEFT JOIN "auth"."users" u ON u.id=a.doctor_id LEFT JOIN "admin"."departments" d ON d.id=a.department_id
      WHERE a.patient_id=$1 AND a.is_deleted=false ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT 20`, [pid])).rows;
  const invoices = (await db.query(
    `SELECT id, invoice_no, invoice_date, net, patient_share, paid, balance, status FROM "billing"."invoices" WHERE patient_id=$1 AND status <> 'Cancelled' AND is_deleted=false ORDER BY id DESC LIMIT 20`, [pid])).rows;
  const labs = (await db.query(
    `SELECT o.order_no, o.ordered_at, t.name AS test, i.result_value, i.result_text, t.unit, i.flag, t.ref_low, t.ref_high
       FROM "lab"."lab_order_items" i JOIN "lab"."lab_orders" o ON o.id=i.order_id JOIN "lab"."lab_tests" t ON t.id=i.test_id
      WHERE o.patient_id=$1 AND i.status='Validated' AND i.is_deleted=false ORDER BY i.validated_at DESC LIMIT 40`, [pid])).rows;
  const rx = (await db.query(
    `SELECT p.rx_no, p.created_at::date AS date, p.status, COALESCE(json_agg(json_build_object('drug', COALESCE(d.brand_name,d.generic_name), 'dose', i.dose, 'frequency', i.frequency, 'days', i.duration_days)) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM "clinical"."prescriptions" p LEFT JOIN "clinical"."prescription_items" i ON i.prescription_id=p.id AND i.is_deleted=false LEFT JOIN "pharmacy"."drugs" d ON d.id=i.drug_id
      WHERE p.patient_id=$1 AND p.is_deleted=false GROUP BY p.id ORDER BY p.id DESC LIMIT 15`, [pid])).rows;
  res.json({ patient, appointments: appts, invoices, labs, prescriptions: rx });
}));

router.get('/portal/doctors', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT DISTINCT u.id, u.full_name, d.name AS department FROM "auth"."users" u JOIN "auth"."roles" r ON r.id=u.role_id AND r.name='Doctor'
       LEFT JOIN "admin"."departments" d ON d.id=u.department_id
      WHERE u.active AND u.is_deleted=false AND EXISTS (SELECT 1 FROM "scheduling"."doctor_schedules" s WHERE s.doctor_id=u.id AND s.active AND s.is_deleted=false)
      ORDER BY u.full_name`);
  res.json(rows);
}));

/** Free slots for a doctor on a date, from the weekly schedule minus booked appointments. */
router.get('/portal/slots', wrap(async (req, res) => {
  const doctor = Number(req.query.doctor_id);
  const date = String(req.query.date || '');
  if (!doctor || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('doctor_id and date are required');
  if (date < today()) throw bad('Choose today or a future date');
  const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
  const sched = (await db.query(
    `SELECT start_time, end_time, slot_minutes FROM "scheduling"."doctor_schedules" WHERE doctor_id=$1 AND weekday=$2 AND active AND is_deleted=false`, [doctor, wd])).rows;
  const taken = new Set((await db.query(
    `SELECT to_char(appt_time,'HH24:MI') t FROM "scheduling"."appointments" WHERE doctor_id=$1 AND appt_date=$2 AND status NOT IN ('Cancelled','No-show') AND is_deleted=false`, [doctor, date])).rows.map((r) => r.t));
  const slots = [];
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  for (const s of sched) {
    const step = Number(s.slot_minutes) || 15;
    for (let m = toMin(String(s.start_time)); m + step <= toMin(String(s.end_time)); m += step) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      if (!taken.has(`${hh}:${mm}`)) slots.push(`${hh}:${mm}`);
    }
  }
  res.json({ weekday: wd, slots });
}));

router.post('/portal/appointments', wrap(async (req, res) => {
  const { doctor_id, appt_date, appt_time, reason } = req.body;
  if (!doctor_id || !appt_date || !appt_time) throw bad('Doctor, date and time are required');
  if (appt_date < today()) throw bad('Appointment date cannot be in the past');
  const out = await db.tx(async (client) => {
    const doc = (await client.query(`SELECT id, department_id FROM "auth"."users" WHERE id=$1 AND active AND is_deleted=false`, [Number(doctor_id)])).rows[0];
    if (!doc) throw notFound('Doctor not found');
    const clash = (await client.query(
      `SELECT 1 FROM "scheduling"."appointments" WHERE doctor_id=$1 AND appt_date=$2 AND appt_time=$3 AND status NOT IN ('Cancelled','No-show') AND is_deleted=false`,
      [doc.id, appt_date, appt_time])).rows.length;
    if (clash) throw conflict('That slot has just been taken. Please choose another.');
    const no = await db.nextCode(client, 'APT', 6);
    const id = (await client.query(
      `INSERT INTO "scheduling"."appointments"("appt_no","patient_id","doctor_id","department_id","appt_date","appt_time","type","status","channel","reason","created_by","updated_by")
       VALUES ($1,$2,$3,$4,$5,$6,'In-person','Booked','Online',$7,$8,$8) RETURNING id`,
      [no, req.user.patient_id, doc.id, doc.department_id, appt_date, appt_time, reason || null, req.user.id])).rows[0].id;
    await audit(client, req.user, 'PORTAL_BOOK', 'appointments', id, { appt_date, appt_time }, req.ip);
    return { id, appt_no: no };
  });
  res.status(201).json(out);
}));

router.post('/portal/appointments/:id/cancel', wrap(async (req, res) => {
  const { rowCount } = await db.query(
    `UPDATE "scheduling"."appointments" SET status='Cancelled', updated_at=now()
      WHERE id=$1 AND patient_id=$2 AND status IN ('Booked','Confirmed') AND appt_date >= CURRENT_DATE AND is_deleted=false`,
    [Number(req.params.id), req.user.patient_id]);
  if (!rowCount) throw conflict('This appointment cannot be cancelled');
  await audit(null, req.user, 'PORTAL_CANCEL', 'appointments', req.params.id, null, req.ip);
  res.json({ ok: true });
}));

module.exports = router;
