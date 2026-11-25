'use strict';
/** Billing rules shared by the cashier workflow and by resource actions. */
const db = require('./db');
const { bad, conflict, forbidden, notFound, round2, getVisit } = require('./lib');

/**
 * Split a bill between patient and payer.
 *  - Cash: patient pays everything.
 *  - Insurance: covered services -> patient pays plan co-pay % (capped), insurer pays the rest;
 *               non-covered services -> patient pays 100%.
 *  - Corporate: company pays everything except non-covered services.
 * A discount % is spread proportionally over all lines.
 */
function computeSplit({ charges, payer_type, plan, discountPct = 0 }) {
  const gross = round2(charges.reduce((s, c) => s + Number(c.amount), 0));
  const discount = round2((gross * discountPct) / 100);
  const net = round2(gross - discount);
  const k = gross > 0 ? net / gross : 1;
  let coveredNet = 0;
  let uncoveredNet = 0;
  for (const c of charges) {
    const n = Number(c.amount) * k;
    if (c.covered) coveredNet += n; else uncoveredNet += n;
  }
  let patient = net;
  if (payer_type === 'Insurance') {
    let copay = (coveredNet * Number(plan ? plan.copay_pct : 20)) / 100;
    if (plan && Number(plan.copay_max) > 0) copay = Math.min(copay, Number(plan.copay_max));
    patient = round2(uncoveredNet + copay);
  } else if (payer_type === 'Corporate') {
    patient = round2(uncoveredNet);
  }
  patient = Math.min(patient, net);
  return { gross, discount, net, patient_share: patient, payer_share: round2(net - patient) };
}

/** Recompute paid / balance / status of an invoice from its payments. Marks the visit completed when settled. */
async function refreshInvoice(client, invoiceId) {
  const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1`, [invoiceId])).rows[0];
  if (!inv) throw notFound('Invoice not found');
  const p = (await client.query(
    `SELECT COALESCE(SUM(CASE WHEN kind='Payment' THEN amount ELSE -amount END),0) AS paid
       FROM "billing"."payments" WHERE invoice_id=$1 AND is_deleted=false`, [invoiceId])).rows[0];
  const paid = round2(p.paid);
  const balance = round2(Math.max(0, Number(inv.patient_share) - paid));
  let status = inv.status;
  if (status !== 'Cancelled') {
    if (balance <= 0.005) status = 'Paid';
    else if (paid > 0) status = 'Partially Paid';
    else status = 'Issued';
  }
  await client.query(`UPDATE "billing"."invoices" SET paid=$1, balance=$2, status=$3, updated_at=now() WHERE id=$4`, [paid, balance, status, invoiceId]);
  if (status === 'Paid' && inv.visit_id) {
    await client.query(
      `UPDATE "scheduling"."visits" SET status='Completed', closed_at=COALESCE(closed_at, now()), updated_at=now()
        WHERE id=$1 AND status NOT IN ('Cancelled')`, [inv.visit_id]);
  }
  return { paid, balance, status };
}

async function corporateOutstanding(client, corporateId, excludeInvoiceId) {
  const r = (await client.query(
    `SELECT COALESCE(SUM(payer_share - payer_paid),0) AS o FROM "billing"."invoices"
      WHERE corporate_id=$1 AND payer_type='Corporate' AND status <> 'Cancelled' AND is_deleted=false AND id <> COALESCE($2,0)`,
    [corporateId, excludeInvoiceId || null])).rows[0];
  return round2(r.o);
}

/** Create (or refresh) the invoice of a visit from its pending charges. */
async function createOrRefreshInvoice(client, user, visitId, opts = {}) {
  const visit = await getVisit(client, visitId);
  const existing = (await client.query(
    `SELECT * FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [visitId])).rows[0];

  const charges = (await client.query(
    `SELECT c.id, c.amount, s.covered FROM "billing"."charges" c JOIN "billing"."services" s ON s.id=c.service_id
      WHERE c.visit_id=$1 AND c.is_deleted=false AND c.status <> 'Cancelled'
        AND (c.status='Pending' OR ($2::bigint IS NOT NULL AND c.invoice_id=$2))`, [visitId, existing ? existing.id : null])).rows;
  if (!charges.length) throw bad('No charges to invoice for this visit');

  // discount control
  let pct = opts.discount_pct;
  if (pct === undefined || pct === null || pct === '') {
    pct = existing && Number(existing.gross) > 0 ? (Number(existing.discount) / Number(existing.gross)) * 100 : 0;
    if (!existing && visit.discount_status === 'Applied') {          // discount given at check-in
      const g = charges.reduce((s, c) => s + Number(c.amount), 0);
      pct = visit.discount_type === 'amount' ? (g > 0 ? Math.min(100, (Number(visit.discount_value) / g) * 100) : 0) : Number(visit.discount_value);
    }
  } else {
    pct = Number(pct);
    if (!(pct >= 0 && pct <= 100)) throw bad('Discount % must be between 0 and 100');
    const isExistingPct = existing && Math.abs(pct - (Number(existing.discount) / Math.max(Number(existing.gross), 0.01)) * 100) < 0.01;
    if (pct > 0 && !isExistingPct) {
      if (user.perms.has('billing.approve_discount')) { /* any */ }
      else if (user.perms.has('billing.discount') && pct <= user.discount_limit) { /* within own limit */ }
      else throw forbidden(`Discount ${pct}% is above your limit (${user.discount_limit}%). Raise a discount approval request instead.`);
    }
  }

  let plan = null;
  if (visit.payer_type === 'Insurance') {
    if (!visit.policy_id) throw bad('Insurance visit has no policy selected');
    if (visit.policy_plan_id) plan = (await client.query(`SELECT * FROM "insurance"."plans" WHERE id=$1`, [visit.policy_plan_id])).rows[0];
  }
  if (visit.payer_type === 'Corporate' && !visit.corporate_id) throw bad('Corporate visit has no company selected');

  const split = computeSplit({ charges, payer_type: visit.payer_type, plan, discountPct: pct });

  if (visit.payer_type === 'Corporate') {
    const corp = (await client.query(`SELECT * FROM "insurance"."corporate_accounts" WHERE id=$1`, [visit.corporate_id])).rows[0];
    const out = await corporateOutstanding(client, visit.corporate_id, existing ? existing.id : null);
    if (Number(corp.credit_limit) > 0 && out + split.payer_share > Number(corp.credit_limit) + 0.005) {
      if (!(opts.override_credit && user.perms.has('billing.approve_discount'))) {
        throw conflict(`Credit limit exceeded for ${corp.name}: outstanding ${out.toFixed(2)} + this bill ${split.payer_share.toFixed(2)} > limit ${Number(corp.credit_limit).toFixed(2)}. A manager can override.`);
      }
    }
  }

  let invoiceId;
  if (existing) {
    invoiceId = existing.id;
    await client.query(
      `UPDATE "billing"."invoices" SET gross=$1, discount=$2, net=$3, patient_share=$4, payer_share=$5, updated_at=now(), updated_by=$6 WHERE id=$7`,
      [split.gross, split.discount, split.net, split.patient_share, split.payer_share, user.id, invoiceId]);
  } else {
    const no = await db.nextCode(client, 'INV', 6);
    invoiceId = (await client.query(
      `INSERT INTO "billing"."invoices"("invoice_no","visit_id","patient_id","payer_type","payer_id","policy_id","corporate_id","invoice_date",
         "gross","discount","net","patient_share","payer_share","paid","balance","payer_paid","status","notes","created_by","updated_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8,$9,$10,$11,$12,0,$11,0,'Issued',$13,$14,$14) RETURNING id`,
      [no, visit.id, visit.patient_id, visit.payer_type, visit.policy_payer_id || null, visit.policy_id || null, visit.corporate_id || null,
        split.gross, split.discount, split.net, split.patient_share, split.payer_share, opts.notes || null, user.id])).rows[0].id;
  }
  await client.query(
    `UPDATE "billing"."charges" SET status='Invoiced', invoice_id=$1, updated_at=now() WHERE id = ANY($2::bigint[])`, [invoiceId, charges.map((c) => c.id)]);
  await refreshInvoice(client, invoiceId);
  return invoiceId;
}

/** Re-split an existing invoice after a discount / credit note change. */
async function reprice(client, invoiceId, { discountPct }) {
  const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1`, [invoiceId])).rows[0];
  const visit = await getVisit(client, inv.visit_id);
  const charges = (await client.query(
    `SELECT c.amount, s.covered FROM "billing"."charges" c JOIN "billing"."services" s ON s.id=c.service_id
      WHERE c.invoice_id=$1 AND c.is_deleted=false AND c.status <> 'Cancelled'`, [invoiceId])).rows;
  let plan = null;
  if (inv.payer_type === 'Insurance' && visit.policy_plan_id) plan = (await client.query(`SELECT * FROM "insurance"."plans" WHERE id=$1`, [visit.policy_plan_id])).rows[0];
  const split = computeSplit({ charges, payer_type: inv.payer_type, plan, discountPct });
  await client.query(
    `UPDATE "billing"."invoices" SET gross=$1, discount=$2, net=$3, patient_share=$4, payer_share=$5, updated_at=now() WHERE id=$6`,
    [split.gross, split.discount, split.net, split.patient_share, split.payer_share, invoiceId]);
  await refreshInvoice(client, invoiceId);
  return split;
}

/** Take a payment against the patient share of an invoice. */
async function payInvoice(client, user, invoiceId, { amount, method, reference }) {
  amount = round2(amount);
  if (!(amount > 0)) throw bad('Enter an amount greater than zero');
  if (!['Cash', 'Card', 'Bank transfer', 'Deposit', 'Online'].includes(method)) throw bad('Choose a payment method');
  const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [invoiceId])).rows[0];
  if (!inv) throw notFound('Invoice not found');
  if (inv.status === 'Cancelled') throw conflict('Invoice is cancelled');
  if (amount > Number(inv.balance) + 0.005) throw bad(`Amount exceeds the patient balance (${Number(inv.balance).toFixed(2)})`);
  const session = (await client.query(`SELECT id FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [user.id])).rows[0];
  if (method === 'Cash' && !session) throw conflict('Open your cashier session before taking cash');
  if (method === 'Deposit') {
    let need = amount;
    const deps = (await client.query(
      `SELECT id, amount, used FROM "billing"."deposits" WHERE patient_id=$1 AND status='Open' AND is_deleted=false ORDER BY id FOR UPDATE`, [inv.patient_id])).rows;
    const avail = round2(deps.reduce((s, d) => s + Number(d.amount) - Number(d.used), 0));
    if (avail + 0.005 < amount) throw bad(`Deposit balance is only ${avail.toFixed(2)}`);
    for (const d of deps) {
      if (need <= 0.0001) break;
      const take = Math.min(need, Number(d.amount) - Number(d.used));
      need = round2(need - take);
      const used = round2(Number(d.used) + take);
      await client.query(`UPDATE "billing"."deposits" SET used=$1, status=$2, updated_at=now() WHERE id=$3`, [used, used >= Number(d.amount) - 0.005 ? 'Used' : 'Open', d.id]);
    }
  }
  const receipt = await db.nextCode(client, 'RCP', 6);
  const pid = (await client.query(
    `INSERT INTO "billing"."payments"("receipt_no","invoice_id","patient_id","kind","amount","method","reference","cashier_id","session_id","paid_at","created_by","updated_by")
     VALUES ($1,$2,$3,'Payment',$4,$5,$6,$7,$8,now(),$7,$7) RETURNING id`,
    [receipt, invoiceId, inv.patient_id, amount, method, reference || null, user.id, session ? session.id : null])).rows[0].id;
  const state = await refreshInvoice(client, invoiceId);
  return { payment_id: pid, receipt_no: receipt, ...state };
}

module.exports = { computeSplit, refreshInvoice, createOrRefreshInvoice, reprice, payInvoice, corporateOutstanding };
