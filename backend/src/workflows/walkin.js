'use strict';
/** Walk-in / outside patients: only lab tests and / or X-rays (no doctor consultation). Register, order, bill and collect in one go. */
const express = require('express');
const db = require('../db');
const billing = require('../billingCore');
const { wrap, bad, forbidden, need, can, audit, addCharge, getVisit } = require('../lib');

const router = express.Router();

/** Small lists only (panels, modalities, sample types). Tests and studies are searched on the server. */
router.get('/walkin/catalog', need('walkin.create'), wrap(async (req, res) => {
  const [groups, panels, mods] = await Promise.all([
    db.query(`SELECT DISTINCT sample_type FROM "lab"."lab_tests" WHERE active AND is_deleted=false AND sample_type IS NOT NULL ORDER BY 1`),
    db.query(`SELECT p.id, p.name, COALESCE(array_agg(pt.test_id) FILTER (WHERE pt.test_id IS NOT NULL), '{}') AS test_ids FROM "lab"."lab_panels" p LEFT JOIN "lab"."lab_panel_tests" pt ON pt.panel_id=p.id AND pt.is_deleted=false WHERE p.is_deleted=false GROUP BY p.id ORDER BY p.name`),
    db.query(`SELECT id, name FROM "radiology"."imaging_modalities" WHERE is_deleted=false ORDER BY name`),
  ]);
  res.json({ groups: groups.rows.map((r) => r.sample_type), panels: panels.rows, modalities: mods.rows });
}));

/** Server-side search: kind=test|study, q (all words must match name or code), group (sample type), ids (fetch given ids). */
router.get('/walkin/search', need('walkin.create'), wrap(async (req, res) => {
  const kind = req.query.kind === 'study' ? 'study' : 'test';
  const params = []; const where = [];
  const words = String(req.query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const col = kind === 'study' ? ['s.name', 's.code'] : ['t.name', 't.code'];
  for (const w of words) { params.push(`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); where.push(`(${col[0]} ILIKE $${params.length} OR ${col[1]} ILIKE $${params.length})`); }
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 200);
  if (ids.length) { params.push(ids); where.push(`${kind === 'study' ? 's' : 't'}.id = ANY($${params.length}::bigint[])`); }
  let sql;
  if (kind === 'study') {
    sql = `SELECT s.id, s.code, s.name, s.price FROM "billing"."services" s WHERE s.category='Radiology' AND s.active AND s.is_deleted=false${where.length ? ' AND ' + where.join(' AND ') : ''} ORDER BY s.name LIMIT 60`;
  } else {
    if (req.query.group) { params.push(String(req.query.group)); where.push(`t.sample_type = $${params.length}`); }
    sql = `SELECT t.id, t.code, t.name, t.sample_type, s.price FROM "lab"."lab_tests" t LEFT JOIN "billing"."services" s ON s.id=t.service_id WHERE t.active AND t.is_deleted=false${where.length ? ' AND ' + where.join(' AND ') : ''} ORDER BY t.name LIMIT 60`;
  }
  res.json((await db.query(sql, params)).rows);
}));

router.post('/walkin', need('walkin.create'), wrap(async (req, res) => {
  const b = req.body || {};
  const testIds = [...new Set((b.test_ids || []).map(Number))].filter(Boolean);
  const studyIds = [...new Set((b.study_ids || []).map(Number))].filter(Boolean);
  if (!testIds.length && !studyIds.length) throw bad('Select at least one lab test or X-ray / imaging study');
  if (b.pay && !can(req, 'billing.cashier')) throw forbidden('You cannot collect payments');
  const priority = ['Routine', 'Urgent', 'STAT'].includes(b.priority) ? b.priority : 'Routine';
  const out = await db.tx(async (client) => {
    const patient = (await client.query(`SELECT id FROM "mpi"."patients" WHERE id=$1 AND is_deleted=false AND active`, [b.patient_id])).rows[0];
    if (!patient) throw bad('Select or register a patient');
    const tests = testIds.length ? (await client.query(`SELECT * FROM "lab"."lab_tests" WHERE id = ANY($1::bigint[]) AND active AND is_deleted=false`, [testIds])).rows : [];
    if (tests.length !== testIds.length) throw bad('One of the tests is not available');
    const studies = studyIds.length ? (await client.query(`SELECT id FROM "billing"."services" WHERE id = ANY($1::bigint[]) AND category='Radiology' AND active AND is_deleted=false`, [studyIds])).rows : [];
    if (studies.length !== studyIds.length) throw bad('One of the studies is not available');
    const tok = (await client.query(`SELECT COALESCE(MAX(token_no),0)+1 AS t FROM "scheduling"."visits" WHERE visit_type='Walk-in' AND visit_date=CURRENT_DATE AND is_deleted=false`)).rows[0].t;
    const visit_no = await db.nextCode(client, 'VIS', 6);
    const vid = (await client.query(
      `INSERT INTO "scheduling"."visits"("visit_no","patient_id","doctor_id","visit_date","visit_type","status","payer_type","eligibility_status","token_no","complaint","referred_by","created_by","updated_by")
       VALUES ($1,$2,NULL,CURRENT_DATE,'Walk-in','Diagnostics','Cash','Not checked',$3,$4,$5,$6,$6) RETURNING id`,
      [visit_no, patient.id, tok, b.complaint || 'Walk-in: lab / X-ray only', b.referred_by || null, req.user.id])).rows[0].id;
    const v = await getVisit(client, vid);
    let labOrder = null; const imgOrders = [];
    if (tests.length) {
      const no = await db.nextCode(client, 'LAB', 6);
      const oid = (await client.query(
        `INSERT INTO "lab"."lab_orders"("order_no","visit_id","patient_id","doctor_id","status","priority","ordered_at","notes","created_by","updated_by")
         VALUES ($1,$2,$3,NULL,'Ordered',$4,now(),$5,$6,$6) RETURNING id`, [no, vid, patient.id, priority, b.referred_by ? `Referred by ${b.referred_by}` : 'Walk-in', req.user.id])).rows[0].id;
      for (const t of tests) {
        const iid = (await client.query(`INSERT INTO "lab"."lab_order_items"("order_id","test_id","status","created_by","updated_by") VALUES ($1,$2,'Pending',$3,$3) RETURNING id`, [oid, t.id, req.user.id])).rows[0].id;
        if (t.service_id) await addCharge(client, { visit: v, service_id: t.service_id, source: 'Lab', source_id: iid, user: req.user });
      }
      labOrder = { id: oid, order_no: no };
    }
    for (const sid of studyIds) {
      const no = await db.nextCode(client, 'IMG', 6);
      const oid = (await client.query(
        `INSERT INTO "radiology"."imaging_orders"("order_no","visit_id","patient_id","doctor_id","service_id","modality_id","status","priority","clinical_info","ordered_at","created_by","updated_by")
         VALUES ($1,$2,$3,NULL,$4,$5,'Ordered',$6,$7,now(),$8,$8) RETURNING id`,
        [no, vid, patient.id, sid, b.modality_id || null, priority, b.referred_by ? `Referred by ${b.referred_by}` : (b.notes || null), req.user.id])).rows[0].id;
      await addCharge(client, { visit: v, service_id: sid, source: 'Radiology', source_id: oid, user: req.user });
      imgOrders.push({ id: oid, order_no: no });
    }
    await audit(client, req.user, 'WALKIN', 'visits', vid, { visit_no, tests: tests.map((t) => t.code), studies: studyIds.length, referred_by: b.referred_by || null }, req.ip);
    let invoice = null; let payment = null;
    if (b.pay || b.invoice) {
      const invId = await billing.createOrRefreshInvoice(client, req.user, vid, b.discount_pct !== undefined && b.discount_pct !== '' ? { discount_pct: b.discount_pct } : {});
      invoice = (await client.query(`SELECT id, invoice_no, gross, discount, net, patient_share, balance FROM "billing"."invoices" WHERE id=$1`, [invId])).rows[0];
      if (b.pay && Number(invoice.balance) > 0.005) {
        const method = ['Cash', 'Card', 'Bank transfer', 'Online'].includes(b.pay.method) ? b.pay.method : 'Cash';
        payment = await billing.payInvoice(client, req.user, invId, { amount: Number(invoice.balance), method, reference: b.pay.reference });
      }
    }
    return { visit_id: vid, visit_no, token_no: tok, lab_order: labOrder, imaging_orders: imgOrders, invoice, payment };
  });
  res.status(201).json(out);
}));

module.exports = router;
