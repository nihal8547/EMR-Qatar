'use strict';
/** Visit management helpers: cancel, swap the consultation fee when the doctor / type changes. */
const db = require('./db');
const billing = require('./billingCore');
const vp = require('./visitPricing');
const { bad, conflict, audit, getVisit, addCharge, round2 } = require('./lib');

async function paidAmount(client, visitId) {
  return Number((await client.query(
    `SELECT COALESCE(SUM(CASE WHEN p.kind='Payment' THEN p.amount ELSE -p.amount END),0) AS n FROM "billing"."payments" p JOIN "billing"."invoices" i ON i.id=p.invoice_id
      WHERE i.visit_id=$1 AND p.is_deleted=false AND i.status <> 'Cancelled'`, [visitId])).rows[0].n);
}

/** Cancel a visit and everything that has not started. Refuses when money was taken or work has begun. */
async function cancelVisit(client, user, v, reason, ip) {
  reason = String(reason || '').trim();
  if (reason.length < 3) throw bad('A reason is required to cancel a visit');
  if (v.status === 'Cancelled') throw conflict('Visit is already cancelled');
  if (v.status === 'Completed') throw conflict('Completed visits cannot be cancelled');
  if (await paidAmount(client, v.id) > 0.005) throw conflict('A payment was received for this visit. Refund it first: Front Office → Bill Cancel Requests (the cashier / manager approves), then cancel the visit.');
  const started = (await client.query(
    `SELECT (SELECT COUNT(*) FROM "lab"."lab_orders" WHERE visit_id=$1 AND is_deleted=false AND status NOT IN ('Ordered','Cancelled'))::int AS lab,
            (SELECT COUNT(*) FROM "radiology"."imaging_orders" WHERE visit_id=$1 AND is_deleted=false AND status <> 'Ordered')::int AS img,
            (SELECT COUNT(*) FROM "clinical"."prescriptions" WHERE visit_id=$1 AND is_deleted=false AND status NOT IN ('Pending','Cancelled'))::int AS rx,
            (SELECT COUNT(*) FROM "clinical"."procedure_orders" WHERE visit_id=$1 AND is_deleted=false AND status='Done')::int AS proc`, [v.id])).rows[0];
  if (started.lab) throw conflict('A lab sample was already collected for this visit. Ask the lab to cancel / reject it first.');
  if (started.img) throw conflict('An X-ray / imaging study has already started for this visit.');
  if (started.rx) throw conflict('Medicines were already dispensed for this visit.');
  if (started.proc) throw conflict('A procedure was already performed for this visit.');
  await client.query(`UPDATE "lab"."lab_orders" SET status='Cancelled', updated_at=now() WHERE visit_id=$1 AND status='Ordered' AND is_deleted=false`, [v.id]);
  await client.query(`UPDATE "radiology"."imaging_orders" SET is_deleted=true, updated_at=now() WHERE visit_id=$1 AND status='Ordered' AND is_deleted=false`, [v.id]);
  await client.query(`UPDATE "clinical"."procedure_orders" SET status='Cancelled', updated_at=now() WHERE visit_id=$1 AND status='Ordered' AND is_deleted=false`, [v.id]);
  await client.query(`UPDATE "clinical"."prescriptions" SET status='Cancelled', updated_at=now() WHERE visit_id=$1 AND status='Pending' AND is_deleted=false`, [v.id]);
  await client.query(`UPDATE "billing"."charges" SET status='Cancelled', updated_at=now() WHERE visit_id=$1 AND status IN ('Pending','Invoiced')`, [v.id]);
  await client.query(`UPDATE "billing"."invoices" SET status='Cancelled', paid=0, balance=0, notes=COALESCE(notes||' · ','')||$2, updated_at=now() WHERE visit_id=$1 AND status <> 'Cancelled'`, [v.id, `Visit cancelled: ${reason}`]);
  await client.query(
    `UPDATE "scheduling"."visits" SET status='Cancelled', closed_at=now(), cancel_reason=$2, cancelled_by=$3, updated_at=now(), updated_by=$3 WHERE id=$1`, [v.id, reason, user.id]);
  if (v.appointment_id) await client.query(`UPDATE "scheduling"."appointments" SET status='Cancelled', updated_at=now() WHERE id=$1 AND status='Arrived'`, [v.appointment_id]);
  await audit(client, user, 'VISIT_CANCEL', 'visits', v.id, { from: v.status, reason }, ip);
}

/**
 * After the doctor / visit type / department changed: make the consultation charge match.
 * Returns a warning string when the old fee could not be replaced (already paid).
 */
async function syncConsultCharge(client, user, visitId) {
  const v = await getVisit(client, visitId);
  const svc = await vp.pickConsultService(client, v.visit_type, v.department_id);
  const cur = (await client.query(
    `SELECT c.* FROM "billing"."charges" c WHERE c.visit_id=$1 AND c.source='Consultation' AND c.is_deleted=false AND c.status <> 'Cancelled' ORDER BY c.id DESC LIMIT 1`, [visitId])).rows[0];
  if (!svc || (cur && Number(cur.service_id) === Number(svc.id))) return null;
  if (cur && cur.status === 'Invoiced') {
    const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1`, [cur.invoice_id])).rows[0];
    if (inv && Number(inv.paid) > 0.005) return 'The consultation fee was already paid, so the fee was not changed. Use a bill cancel request if it must be corrected.';
  }
  if (cur) await client.query(`UPDATE "billing"."charges" SET status='Cancelled', updated_at=now() WHERE id=$1`, [cur.id]);
  await addCharge(client, { visit: v, service_id: svc.id, source: 'Consultation', source_id: visitId, user });
  if (cur && cur.status === 'Invoiced') await billing.createOrRefreshInvoice(client, user, visitId, {});
  return null;
}

module.exports = { cancelVisit, syncConsultCharge, paidAmount };
