'use strict';
/** Paediatrics: vaccination record (schedule vs given), due list, WHO growth chart data. */
const express = require('express');
const db = require('../db');
const { wrap, bad, notFound, need, audit } = require('../lib');
const { assertPatientAccess, relationSQL } = require('../crud');
const G = require('../growth');

const router = express.Router();
const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const addMonths = (dob, m) => { const d = new Date(dob); d.setUTCMonth(d.getUTCMonth() + m); return d; };
const ageMonths = (dob, at = new Date()) => (new Date(at) - new Date(dob)) / DAY / 30.4375;
const fmtAge = (m) => (m < 1 ? `${Math.max(0, Math.round(m * 30.4375))} d` : m < 24 ? `${Math.floor(m)} mo` : `${Math.floor(m / 12)} y ${Math.floor(m % 12)} mo`);

async function patientOf(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw bad('Invalid patient');
  const p = (await db.query(`SELECT id, mrn, full_name, gender, dob, phone, nationality_id FROM "mpi"."patients" WHERE id=$1 AND is_deleted=false`, [id])).rows[0];
  if (!p) throw notFound('Patient not found');
  return p;
}
async function centre() {
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  return Object.fromEntries(s.map((r) => [r.key, r.value]));
}

/** Status of every scheduled dose for one child */
function buildRecord(patient, sched, given, today = new Date()) {
  const todayIso = iso(today);
  const byDose = new Map();
  for (const g of given) {
    const k = `${g.vaccine_id}:${g.dose_no}`;
    const cur = byDose.get(k);
    if (!cur || (g.status === 'Given' && cur.status !== 'Given') || (g.status === cur.status && g.id > cur.id)) byDose.set(k, g);
  }
  const used = new Set();
  const rows = sched.map((s) => {
    const k = `${s.vaccine_id}:${s.dose_no}`; used.add(k);
    const g = byDose.get(k);
    const due = addMonths(patient.dob, s.due_age_months);
    const lateFrom = new Date(addMonths(patient.dob, s.due_age_months + (s.window_months ?? 1)));
    let status;
    if (g && g.status === 'Given') status = 'Given';
    else if (g) status = g.status; // Refused / Deferred
    else if (!s.routine) status = 'Optional';
    else if (todayIso > iso(lateFrom)) status = 'Overdue';
    else if (todayIso >= iso(new Date(due - 7 * DAY))) status = 'Due';
    else status = 'Upcoming';
    return {
      vaccine_id: s.vaccine_id, vaccine: s.vaccine, protects_against: s.protects_against, dose_no: s.dose_no, label: s.label, due_age_months: s.due_age_months,
      routine: s.routine, due_date: iso(due), late_after: iso(lateFrom), status, given: g || null,
    };
  });
  const extra = given.filter((g) => !used.has(`${g.vaccine_id}:${g.dose_no}`));
  const count = (st) => rows.filter((r) => r.status === st).length;
  return { rows, extra, summary: { given: count('Given'), due: count('Due'), overdue: count('Overdue'), upcoming: count('Upcoming'), optional: count('Optional'), declined: count('Refused') + count('Deferred') } };
}

async function loadSchedule() {
  return (await db.query(
    `SELECT s.vaccine_id, s.dose_no, s.label, s.due_age_months, s.window_months, s.routine, v.name AS vaccine, v.protects_against
       FROM "clinical"."vaccine_schedule" s JOIN "clinical"."vaccines" v ON v.id = s.vaccine_id AND v.is_deleted = false AND v.active
      WHERE s.is_deleted = false ORDER BY s.due_age_months, v.name, s.dose_no`)).rows;
}
const GIVEN_SQL = `SELECT i.id, i.vaccine_id, v.name AS vaccine, i.dose_no, i.status, i.given_on, i.source, i.batch_no, i.expiry_date, i.site, i.notes, u.full_name AS recorded_by_name
  FROM "clinical"."immunizations" i JOIN "clinical"."vaccines" v ON v.id = i.vaccine_id LEFT JOIN "auth"."users" u ON u.id = i.recorded_by
 WHERE i.is_deleted = false AND i.patient_id`;

router.get('/vaccination/:patientId', need('immunizations.view'), wrap(async (req, res) => {
  const pid = Number(req.params.patientId);
  const patient = await patientOf(pid);
  await assertPatientAccess(req, pid);
  const [sched, given, c] = await Promise.all([loadSchedule(), db.query(`${GIVEN_SQL} = $1 ORDER BY i.given_on, i.id`, [pid]), centre()]);
  const rec = buildRecord(patient, sched, given.rows);
  await audit(null, req.user, 'VIEW_VACCINATION', 'immunizations', pid, null, req.ip);
  res.json({ patient: { ...patient, dob: iso(patient.dob), age_months: Math.round(ageMonths(patient.dob) * 10) / 10, age_text: fmtAge(ageMonths(patient.dob)) }, centre: c, ...rec });
}));

/** Children with doses due or overdue (worklist for recall / reminders) */
router.get('/vaccination-due', need('immunizations.view'), wrap(async (req, res) => {
  const maxYears = Math.min(Math.max(Number(req.query.max_age_years) || 19, 1), 19);
  const want = String(req.query.status || 'Overdue,Due').split(',').map((x) => x.trim());
  const qtext = String(req.query.q || '').trim();
  const params = [iso(new Date(Date.now() - maxYears * 366 * DAY))];
  let where = `p.is_deleted = false AND p.dob > $1`;
  if (qtext) { params.push(`%${qtext}%`); where += ` AND (p.full_name ILIKE $${params.length} OR p.mrn ILIKE $${params.length} OR p.phone ILIKE $${params.length})`; }
  if (req.user.restrict) where += ` AND ${relationSQL(req.user, 'p.id', params)}`;
  const patients = (await db.query(`SELECT p.id, p.mrn, p.full_name, p.gender, p.dob, p.phone FROM "mpi"."patients" p WHERE ${where} ORDER BY p.dob DESC LIMIT 3000`, params)).rows;
  if (!patients.length) return res.json({ rows: [], total: 0 });
  const sched = await loadSchedule();
  const gp = new Map();
  const g2 = (await db.query(`SELECT patient_id, id, vaccine_id, dose_no, status, given_on FROM "clinical"."immunizations" WHERE is_deleted=false AND patient_id = ANY($1::bigint[])`, [patients.map((p) => p.id)])).rows;
  for (const g of g2) { if (!gp.has(g.patient_id)) gp.set(g.patient_id, []); gp.get(g.patient_id).push(g); }
  const rows = [];
  for (const p of patients) {
    if (!gp.has(p.id)) { rows.push({ patient_id: p.id, mrn: p.mrn, full_name: p.full_name, gender: p.gender, phone: p.phone, dob: iso(p.dob), age_text: fmtAge(ageMonths(p.dob)), overdue: 0, due: 0, no_record: true, earliest_due: '9999', vaccines: ['No vaccination record entered yet'] }); continue; }
    const rec = buildRecord(p, sched, gp.get(p.id) || []);
    const pend = rec.rows.filter((r) => want.includes(r.status));
    if (!pend.length) continue;
    rows.push({
      patient_id: p.id, mrn: p.mrn, full_name: p.full_name, gender: p.gender, phone: p.phone, dob: iso(p.dob), age_text: fmtAge(ageMonths(p.dob)),
      overdue: rec.summary.overdue, due: rec.summary.due,
      earliest_due: pend.map((r) => r.due_date).sort()[0],
      vaccines: [...new Set(pend.map((r) => `${r.vaccine}${r.dose_no > 1 || r.label ? ' #' + r.dose_no : ''}`))],
    });
  }
  rows.sort((a, b) => a.earliest_due.localeCompare(b.earliest_due));
  const onlyPending = String(req.query.hide_no_record || '') === '1';
  const out = onlyPending ? rows.filter((r) => !r.no_record) : rows;
  res.json({ rows: out.slice(0, 500), total: out.length, no_record: rows.filter((r) => r.no_record).length });
}));

/** WHO growth chart data (0-5 years) from measurements + triage vitals */
router.get('/growth/:patientId', need('growth_measurements.view'), wrap(async (req, res) => {
  const pid = Number(req.params.patientId);
  const patient = await patientOf(pid);
  await assertPatientAccess(req, pid);
  const sex = G.sexKey(patient.gender);
  const [gm, vt] = await Promise.all([
    db.query(`SELECT id, measured_on AS d, weight_kg, height_cm, head_circ_cm, source, notes FROM "clinical"."growth_measurements" WHERE patient_id=$1 AND is_deleted=false`, [pid]),
    db.query(`SELECT id, recorded_at AS d, weight_kg, height_cm, head_circ_cm FROM "clinical"."vitals" WHERE patient_id=$1 AND is_deleted=false AND (weight_kg IS NOT NULL OR height_cm IS NOT NULL OR head_circ_cm IS NOT NULL)`, [pid]),
  ]);
  const raw = [
    ...gm.rows.map((r) => ({ ...r, origin: 'growth', src: r.source })),
    ...vt.rows.map((r) => ({ ...r, origin: 'vitals', src: 'Triage vitals' })),
  ].map((r) => ({ ...r, d: iso(r.d), weight_kg: r.weight_kg === null ? null : Number(r.weight_kg), height_cm: r.height_cm === null ? null : Number(r.height_cm), head_circ_cm: r.head_circ_cm === null ? null : Number(r.head_circ_cm) }))
    .sort((a, b) => a.d.localeCompare(b.d));
  const warnings = [];
  const points = [];
  for (const r of raw) {
    const age = ageMonths(patient.dob, r.d);
    if (age < 0) { warnings.push(`A measurement on ${r.d} is before the date of birth and was ignored`); continue; }
    const bmi = r.weight_kg && r.height_cm ? r.weight_kg / ((r.height_cm / 100) ** 2) : null;
    const vals = { wfa: r.weight_kg, lhfa: r.height_cm, hcfa: r.head_circ_cm, bmifa: bmi };
    const z = {}, pct = {}, flags = [];
    for (const k of Object.keys(vals)) {
      const zz = vals[k] ? G.zscore(k, sex, age, vals[k]) : null;
      z[k] = zz === null ? null : Number(zz.toFixed(2)); pct[k] = zz === null ? null : G.r1(G.percentile(zz));
      const f = G.flag(k, zz); if (f) flags.push({ indicator: G.IND[k].label, ...f });
    }
    points.push({ id: r.id, origin: r.origin, date: r.d, age_months: Math.round(age * 100) / 100, age_text: fmtAge(age), weight_kg: r.weight_kg, height_cm: r.height_cm, head_circ_cm: r.head_circ_cm, bmi: bmi === null ? null : G.r1(bmi), source: r.src, z, pct, flags, out_of_range: age > 60 });
  }
  const age = ageMonths(patient.dob);
  if (age > 60) warnings.push('WHO growth standards cover 0 to 5 years. Measurements after 5 years are listed but not plotted; use the CDC / IAP chart for older children.');
  await audit(null, req.user, 'VIEW_GROWTH', 'growth', pid, null, req.ip);
  res.json({
    patient: { id: patient.id, mrn: patient.mrn, full_name: patient.full_name, gender: patient.gender, dob: iso(patient.dob), age_months: Math.round(age * 10) / 10, age_text: fmtAge(age) },
    sex, standard: 'WHO Child Growth Standards 2006 (0-5 years)', points, warnings,
    indicators: Object.fromEntries(Object.entries(G.IND).map(([k, v]) => [k, { label: v.label, unit: v.unit, curves: G.curves(k, sex) }])),
  });
}));

module.exports = router;
