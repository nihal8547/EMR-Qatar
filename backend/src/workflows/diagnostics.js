'use strict';
/** Laboratory + Radiology workflows */
const express = require('express');
const db = require('../db');
const crud = require('../crud');
const { wrap, bad, notFound, conflict, need, can, audit } = require('../lib');

const router = express.Router();

/* ---------------- Lab worklist ---------------- */
router.get('/lab/worklist', need('lab.work'), wrap(async (req, res) => {
  const params = [];
  let where = `o.is_deleted=false AND o.status <> 'Cancelled'`;
  if (req.query.status) { params.push(req.query.status); where += ` AND o.status=$${params.length}`; }
  else where += ` AND o.status <> 'Validated'`;
  if (req.query.q) { params.push(`%${req.query.q}%`); where += ` AND (o.order_no ILIKE $${params.length} OR p.full_name ILIKE $${params.length} OR p.mrn ILIKE $${params.length})`; }
  const { rows } = await db.query(
    `SELECT o.id, o.order_no, o.status, o.priority, o.ordered_at, p.mrn, p.full_name, p.gender, p.dob, d.full_name AS doctor,
            (SELECT COALESCE(json_agg(json_build_object('id',i.id,'test_id',t.id,'test',t.name,'code',t.code,'unit',t.unit,'ref_low',t.ref_low,'ref_high',t.ref_high,
                'result_value',i.result_value,'result_text',i.result_text,'flag',i.flag,'status',i.status) ORDER BY i.id),'[]'::json)
               FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id WHERE i.order_id=o.id AND i.is_deleted=false) AS items,
            (SELECT COALESCE(json_agg(json_build_object('id',s.id,'barcode',s.barcode,'status',s.status,'sample_type',s.sample_type) ORDER BY s.id),'[]'::json)
               FROM "lab"."specimens" s WHERE s.order_id=o.id AND s.is_deleted=false) AS specimens
       FROM "lab"."lab_orders" o JOIN "mpi"."patients" p ON p.id=o.patient_id LEFT JOIN "auth"."users" d ON d.id=o.doctor_id
      WHERE ${where}
      ORDER BY CASE o.priority WHEN 'STAT' THEN 0 WHEN 'Urgent' THEN 1 ELSE 2 END, o.ordered_at LIMIT 100`, params);
  res.json(rows);
}));

router.post('/lab/orders/:id/collect', need('lab.work'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await db.tx(async (client) => {
    const o = (await client.query(`SELECT * FROM "lab"."lab_orders" WHERE id=$1 AND is_deleted=false`, [id])).rows[0];
    if (!o) throw notFound('Order not found');
    if (o.status !== 'Ordered') throw conflict(`Order is already ${o.status}`);
    // one specimen per distinct sample type of the tests
    const types = (await client.query(
      `SELECT DISTINCT COALESCE(t.sample_type,'Blood') AS st FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id WHERE i.order_id=$1 AND i.is_deleted=false`, [id])).rows;
    const barcodes = [];
    for (const t of types) {
      const bc = await db.nextCode(client, 'SPC', 7);
      await client.query(
        `INSERT INTO "lab"."specimens"("order_id","barcode","sample_type","collected_at","collected_by","status","created_by","updated_by") VALUES ($1,$2,$3,now(),$4,'Collected',$4,$4)`,
        [id, bc, t.st, req.user.id]);
      barcodes.push(bc);
    }
    await client.query(`UPDATE "lab"."lab_orders" SET status='Collected', updated_at=now() WHERE id=$1`, [id]);
    await audit(client, req.user, 'LAB_COLLECT', 'lab_orders', id, { barcodes }, req.ip);
    return { barcodes };
  });
  res.json(out);
}));

router.post('/lab/specimens/:id/reject', need('lab.work'), wrap(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 3) throw bad('Enter a rejection reason');
  await db.tx(async (client) => {
    const s = (await client.query(`SELECT * FROM "lab"."specimens" WHERE id=$1 AND is_deleted=false`, [Number(req.params.id)])).rows[0];
    if (!s) throw notFound('Specimen not found');
    await client.query(`UPDATE "lab"."specimens" SET status='Rejected', rejection_reason=$1, updated_at=now() WHERE id=$2`, [reason, s.id]);
    // allow recollection
    const active = (await client.query(`SELECT 1 FROM "lab"."specimens" WHERE order_id=$1 AND status <> 'Rejected' AND is_deleted=false LIMIT 1`, [s.order_id])).rows.length;
    if (!active) await client.query(`UPDATE "lab"."lab_orders" SET status='Ordered', updated_at=now() WHERE id=$1 AND status='Collected'`, [s.order_id]);
    await audit(client, req.user, 'SPECIMEN_REJECT', 'specimens', s.id, { reason }, req.ip);
  });
  res.json({ ok: true });
}));

function flagFor(t, v) {
  if (v === null || v === undefined) return null;
  if (t.critical_low !== null && v < Number(t.critical_low)) return 'Critical Low';
  if (t.critical_high !== null && v > Number(t.critical_high)) return 'Critical High';
  if (t.ref_low !== null && v < Number(t.ref_low)) return 'Low';
  if (t.ref_high !== null && v > Number(t.ref_high)) return 'High';
  return 'Normal';
}

async function refreshOrderStatus(client, orderId) {
  const r = (await client.query(
    `SELECT count(*)::int total, count(*) FILTER (WHERE status='Pending')::int pending, count(*) FILTER (WHERE status='Validated')::int validated
       FROM "lab"."lab_order_items" WHERE order_id=$1 AND is_deleted=false`, [orderId])).rows[0];
  const st = r.validated === r.total ? 'Validated' : r.pending === 0 ? 'Resulted' : 'In Progress';
  const was = (await client.query(`SELECT status FROM "lab"."lab_orders" WHERE id=$1`, [orderId])).rows[0];
  await client.query(`UPDATE "lab"."lab_orders" SET status=$1, updated_at=now() WHERE id=$2 AND status NOT IN ('Cancelled','Ordered')`, [st, orderId]);
  if (st === 'Validated' && was && was.status !== 'Validated') require('../notify').auto('result.ready', { lab_order_id: orderId });
  const o = (await client.query(`SELECT visit_id FROM "lab"."lab_orders" WHERE id=$1`, [orderId])).rows[0];
  if (o && o.visit_id) await require('../billingCore').settleVisit(client, o.visit_id);   // walk-in visits close when results are out and the bill is settled
}

router.post('/lab/items/:id/result', need('lab.work'), wrap(async (req, res) => {
  const out = await db.tx(async (client) => {
    const it = (await client.query(
      `SELECT i.*, o.status AS order_status FROM "lab"."lab_order_items" i JOIN "lab"."lab_orders" o ON o.id=i.order_id WHERE i.id=$1 AND i.is_deleted=false`, [Number(req.params.id)])).rows[0];
    if (!it) throw notFound('Test not found');
    if (['Ordered', 'Cancelled'].includes(it.order_status)) throw conflict('Collect the sample before entering results');
    if (it.status === 'Validated') throw conflict('Validated results are locked');
    const t = (await client.query(`SELECT * FROM "lab"."lab_tests" WHERE id=$1`, [it.test_id])).rows[0];
    const rawVal = req.body.result_value;
    const hasNum = rawVal !== undefined && rawVal !== null && rawVal !== '';
    const num = hasNum ? Number(rawVal) : null;
    if (hasNum && !Number.isFinite(num)) throw bad('Result must be a number (use the text result for non-numeric)');
    const text = req.body.result_text ? String(req.body.result_text).trim() : null;
    if (!hasNum && !text) throw bad('Enter a result');
    const flag = hasNum ? flagFor(t, num) : (req.body.flag || null);
    await client.query(
      `UPDATE "lab"."lab_order_items" SET result_value=$1, result_text=$2, flag=$3, status='Resulted', resulted_by=$4, resulted_at=now(), validated_by=NULL, validated_at=NULL, updated_at=now() WHERE id=$5`,
      [num, text, flag, req.user.id, it.id]);
    await refreshOrderStatus(client, it.order_id);
    await audit(client, req.user, 'LAB_RESULT', 'lab_order_items', it.id, { flag }, req.ip);
    return { flag, critical: flag && flag.startsWith('Critical') };
  });
  res.json(out);
}));

router.post('/lab/items/:id/validate', need('lab.validate'), wrap(async (req, res) => {
  await db.tx(async (client) => {
    const it = (await client.query(`SELECT * FROM "lab"."lab_order_items" WHERE id=$1 AND is_deleted=false`, [Number(req.params.id)])).rows[0];
    if (!it) throw notFound('Test not found');
    if (it.status !== 'Resulted') throw conflict('Only resulted tests can be validated');
    await client.query(`UPDATE "lab"."lab_order_items" SET status='Validated', validated_by=$1, validated_at=now(), updated_at=now() WHERE id=$2`, [req.user.id, it.id]);
    await refreshOrderStatus(client, it.order_id);
    await audit(client, req.user, 'LAB_VALIDATE', 'lab_order_items', it.id, null, req.ip);
  });
  res.json({ ok: true });
}));

router.post('/lab/orders/:id/validate-all', need('lab.validate'), wrap(async (req, res) => {
  const out = await db.tx(async (client) => {
    const r = await client.query(
      `UPDATE "lab"."lab_order_items" SET status='Validated', validated_by=$1, validated_at=now(), updated_at=now() WHERE order_id=$2 AND status='Resulted' AND is_deleted=false RETURNING id`,
      [req.user.id, Number(req.params.id)]);
    await refreshOrderStatus(client, Number(req.params.id));
    await audit(client, req.user, 'LAB_VALIDATE_ALL', 'lab_orders', Number(req.params.id), { n: r.rowCount }, req.ip);
    return { validated: r.rowCount };
  });
  res.json(out);
}));

router.get('/lab/critical', need('lab.work'), wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT i.id, o.order_no, p.mrn, p.full_name, p.phone, t.name AS test, i.result_value, t.unit, i.flag, i.resulted_at, d.full_name AS doctor
       FROM "lab"."lab_order_items" i JOIN "lab"."lab_orders" o ON o.id=i.order_id JOIN "mpi"."patients" p ON p.id=o.patient_id
       JOIN "lab"."lab_tests" t ON t.id=i.test_id LEFT JOIN "auth"."users" d ON d.id=o.doctor_id
      WHERE i.flag LIKE 'Critical%' AND i.is_deleted=false AND i.resulted_at > now() - interval '48 hours' ORDER BY i.resulted_at DESC`);
  res.json(rows);
}));

/** Sample collection slip: patient, order, tests grouped by sample/tube, specimen barcodes. */
router.get('/lab/orders/:id/slip', need('lab_orders.view'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw notFound('Order not found');
  const o = (await db.query(
    `SELECT o.id, o.order_no, o.status, o.priority, o.ordered_at, o.notes, p.mrn, p.full_name, p.dob, p.gender, p.phone, d.full_name AS doctor, v.visit_no
       FROM "lab"."lab_orders" o JOIN "mpi"."patients" p ON p.id=o.patient_id LEFT JOIN "auth"."users" d ON d.id=o.doctor_id LEFT JOIN "scheduling"."visits" v ON v.id=o.visit_id
      WHERE o.id=$1 AND o.is_deleted=false`, [id])).rows[0];
  if (!o) throw notFound('Order not found');
  const tests = (await db.query(
    `SELECT t.code, t.name, t.sample_type, t.tat_hours FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id
      WHERE i.order_id=$1 AND i.is_deleted=false ORDER BY t.sample_type, t.name`, [id])).rows;
  const specimens = (await db.query(
    `SELECT s.barcode, s.sample_type, s.collected_at, s.status, u.full_name AS collected_by FROM "lab"."specimens" s LEFT JOIN "auth"."users" u ON u.id=s.collected_by
      WHERE s.order_id=$1 AND s.is_deleted=false ORDER BY s.id`, [id])).rows;
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  await audit(null, req.user, 'LAB_SLIP_PRINT', 'lab_orders', id, null, req.ip);
  res.json({ order: o, tests, specimens, centre: Object.fromEntries(s.map((r) => [r.key, r.value])) });
}));

/** Printable report payload (only validated results). */
router.get('/lab/orders/:id/report', need('lab_orders.view'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const o = (await db.query(
    `SELECT o.*, p.mrn, p.full_name, p.dob, p.gender, p.qid, d.full_name AS doctor, d.licence_no AS doctor_licence
       FROM "lab"."lab_orders" o JOIN "mpi"."patients" p ON p.id=o.patient_id LEFT JOIN "auth"."users" d ON d.id=o.doctor_id WHERE o.id=$1 AND o.is_deleted=false`, [id])).rows[0];
  if (!o) throw notFound('Order not found');
  await crud.assertPatientAccess(req, o.patient_id);
  const items = (await db.query(
    `SELECT t.name AS test, t.unit, t.ref_low, t.ref_high, i.result_value, i.result_text, i.flag, i.validated_at, u.full_name AS validated_by
       FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id LEFT JOIN "auth"."users" u ON u.id=i.validated_by
      WHERE i.order_id=$1 AND i.status='Validated' AND i.is_deleted=false ORDER BY i.id`, [id])).rows;
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  await audit(null, req.user, 'LAB_REPORT_VIEW', 'lab_orders', id, null, req.ip);
  res.json({ order: o, items, centre: Object.fromEntries(s.map((r) => [r.key, r.value])) });
}));

/** Printable imaging report (the reported study with findings and impression). */
router.get('/imaging/orders/:id/report', need('imaging_orders.view'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const o = (await db.query(
    `SELECT o.id, o.order_no, o.status, o.priority, o.clinical_info, o.ordered_at, o.visit_id, o.patient_id, s.name AS study, m.name AS modality,
            p.mrn, p.full_name, p.dob, p.gender, p.qid, d.full_name AS doctor
       FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id LEFT JOIN "radiology"."imaging_modalities" m ON m.id=o.modality_id
       JOIN "mpi"."patients" p ON p.id=o.patient_id LEFT JOIN "auth"."users" d ON d.id=o.doctor_id WHERE o.id=$1 AND o.is_deleted=false`, [id])).rows[0];
  if (!o) throw notFound('Order not found');
  await crud.assertPatientAccess(req, o.patient_id);
  const reports = (await db.query(
    `SELECT r.findings, r.impression, r.status, r.reported_at, u.full_name AS reported_by FROM "radiology"."imaging_reports" r LEFT JOIN "auth"."users" u ON u.id=r.reported_by
      WHERE r.order_id=$1 AND r.is_deleted=false ORDER BY r.id DESC`, [id])).rows;
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  await audit(null, req.user, 'IMAGING_REPORT_VIEW', 'imaging_orders', id, null, req.ip);
  res.json({ order: o, report: reports.find((r) => r.status === 'Final') || reports[0] || null, centre: Object.fromEntries(s.map((r) => [r.key, r.value])) });
}));

/** Every validated lab result and final imaging report of one visit, for a single combined printout. */
router.get('/visits/:id/results', need('lab_orders.view'), wrap(async (req, res) => {
  const vid = Number(req.params.id);
  const v = (await db.query(
    `SELECT v.id, v.patient_id, v.visit_no, v.visit_date, v.visit_type, p.mrn, p.full_name, p.dob, p.gender, p.qid, d.full_name AS doctor
       FROM "scheduling"."visits" v JOIN "mpi"."patients" p ON p.id=v.patient_id LEFT JOIN "auth"."users" d ON d.id=v.doctor_id WHERE v.id=$1 AND v.is_deleted=false`, [vid])).rows[0];
  if (!v) throw notFound('Visit not found');
  await crud.assertPatientAccess(req, v.patient_id);
  const lab = (await db.query(
    `SELECT o.order_no, t.name AS test, t.unit, t.ref_low, t.ref_high, i.result_value, i.result_text, i.flag, i.validated_at
       FROM "lab"."lab_orders" o JOIN "lab"."lab_order_items" i ON i.order_id=o.id AND i.status='Validated' AND i.is_deleted=false JOIN "lab"."lab_tests" t ON t.id=i.test_id
      WHERE o.visit_id=$1 AND o.is_deleted=false ORDER BY o.id, i.id`, [vid])).rows;
  const imaging = can(req, 'imaging_orders.view') ? (await db.query(
    `SELECT o.order_no, s.name AS study, r.findings, r.impression, r.reported_at, u.full_name AS reported_by
       FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id JOIN "radiology"."imaging_reports" r ON r.order_id=o.id AND r.status='Final' AND r.is_deleted=false LEFT JOIN "auth"."users" u ON u.id=r.reported_by
      WHERE o.visit_id=$1 AND o.is_deleted=false ORDER BY o.id`, [vid])).rows : [];
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  await audit(null, req.user, 'RESULTS_PRINT', 'visits', vid, null, req.ip);
  res.json({ visit: v, lab, imaging, centre: Object.fromEntries(s.map((r) => [r.key, r.value])) });
}));

/* ---------------- Radiology ---------------- */
router.get('/radiology/worklist', need('imaging_orders.view'), wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT o.id, o.order_no, o.status, o.priority, o.clinical_info, o.ordered_at, s.name AS study, m.name AS modality, p.mrn, p.full_name, p.gender, p.dob, d.full_name AS doctor
       FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id JOIN "mpi"."patients" p ON p.id=o.patient_id
       LEFT JOIN "radiology"."imaging_modalities" m ON m.id=o.modality_id LEFT JOIN "auth"."users" d ON d.id=o.doctor_id
      WHERE o.is_deleted=false AND o.status <> 'Reported' ORDER BY CASE o.priority WHEN 'STAT' THEN 0 WHEN 'Urgent' THEN 1 ELSE 2 END, o.ordered_at LIMIT 100`);
  res.json(rows);
}));

router.post('/radiology/orders/:id/status', need('imaging_orders.edit'), wrap(async (req, res) => {
  const allowed = ['Scheduled', 'In Progress', 'Scanned'];
  if (!allowed.includes(req.body.status)) throw bad('Invalid status');
  const r = await db.query(`UPDATE "radiology"."imaging_orders" SET status=$1, updated_at=now() WHERE id=$2 AND is_deleted=false AND status <> 'Reported'`, [req.body.status, Number(req.params.id)]);
  if (!r.rowCount) throw conflict('Order not found or already reported');
  await audit(null, req.user, 'IMAGING_STATUS', 'imaging_orders', Number(req.params.id), { status: req.body.status }, req.ip);
  res.json({ ok: true });
}));

module.exports = router;
