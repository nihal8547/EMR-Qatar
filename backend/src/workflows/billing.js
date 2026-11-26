'use strict';
/** Cashier desk, invoices, payments, sessions + Claims workbench */
const express = require('express');
const db = require('../db');
const billing = require('../billingCore');
const { wrap, bad, notFound, conflict, forbidden, need, can, audit, round2, getVisit, today } = require('../lib');

const router = express.Router();

/* ================================================================ Cashier */
router.get('/billing/worklist', need('billing.cashier'), wrap(async (req, res) => {
  const params = [];
  let where = `v.is_deleted=false AND v.status <> 'Cancelled'`;
  const words = String(req.query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  for (const w of words) {
    params.push(`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where += ` AND (p.full_name ILIKE $${params.length} OR p.mrn ILIKE $${params.length} OR v.visit_no ILIKE $${params.length} OR p.phone ILIKE $${params.length} OR p.qid ILIKE $${params.length})`;
  }
  if (!words.length && req.query.all !== '1') where += ` AND (v.visit_date = CURRENT_DATE OR v.status <> 'Completed')`;
  const pend = `SELECT c.visit_id, SUM(c.amount) AS amt, string_agg(DISTINCT c.source, ',') AS sources FROM "billing"."charges" c WHERE c.status='Pending' AND c.is_deleted=false GROUP BY c.visit_id`;
  const inv = `SELECT DISTINCT ON (i.visit_id) i.visit_id, i.invoice_no, i.balance FROM "billing"."invoices" i WHERE i.status <> 'Cancelled' AND i.is_deleted=false ORDER BY i.visit_id, i.id DESC`;
  const chip = String(req.query.chip || 'all');
  if (chip === 'due') where += ` AND (COALESCE(pc.amt,0) > 0 OR COALESCE(iv.balance,0) > 0)`;
  else if (chip !== 'all') { params.push(chip); where += ` AND $${params.length} = ANY(string_to_array(COALESCE(pc.sources,''), ','))`; }
  const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10) || 30, 1), 100);
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const from = `FROM "scheduling"."visits" v JOIN "mpi"."patients" p ON p.id=v.patient_id LEFT JOIN (${pend}) pc ON pc.visit_id=v.id LEFT JOIN (${inv}) iv ON iv.visit_id=v.id WHERE ${where}`;
  const total = (await db.query(`SELECT count(*)::int n ${from}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT v.id, v.visit_no, v.visit_date, v.status, v.payer_type, p.mrn, p.full_name,
            COALESCE(pc.amt,0) AS pending_amount, COALESCE(pc.sources,'') AS sources, iv.invoice_no, iv.balance
       ${from} ORDER BY v.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
  res.json({ rows, total, page, limit });
}));

async function invoiceBundle(id) {
  const inv = (await db.query(
    `SELECT i.*, p.mrn, p.full_name, p.phone, v.visit_no, py.name AS payer_name, ca.name AS corporate_name, pm.policy_no, pm.member_id
       FROM "billing"."invoices" i JOIN "mpi"."patients" p ON p.id=i.patient_id LEFT JOIN "scheduling"."visits" v ON v.id=i.visit_id
       LEFT JOIN "insurance"."payers" py ON py.id=i.payer_id LEFT JOIN "insurance"."corporate_accounts" ca ON ca.id=i.corporate_id
       LEFT JOIN "insurance"."policy_members" pm ON pm.id=i.policy_id
      WHERE i.id=$1 AND i.is_deleted=false`, [id])).rows[0];
  if (!inv) throw notFound('Invoice not found');
  const lines = (await db.query(
    `SELECT c.id, c.description, c.qty, c.unit_price, c.amount, c.source, s.code, s.covered
       FROM "billing"."charges" c JOIN "billing"."services" s ON s.id=c.service_id WHERE c.invoice_id=$1 AND c.is_deleted=false AND c.status <> 'Cancelled' ORDER BY c.id`, [id])).rows;
  const payments = (await db.query(
    `SELECT p.id, p.receipt_no, p.kind, p.amount, p.method, p.reference, p.paid_at, u.full_name AS cashier,
            EXISTS(SELECT 1 FROM "billing"."payments" r WHERE r.invoice_id=p.invoice_id AND r.kind='Refund' AND r.reference='VOID ' || p.receipt_no AND r.is_deleted=false) AS voided FROM "billing"."payments" p LEFT JOIN "auth"."users" u ON u.id=p.cashier_id WHERE p.invoice_id=$1 AND p.is_deleted=false ORDER BY p.id`, [id])).rows;
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone','tax_note') AND is_deleted=false`)).rows;
  const cancel_request = (await db.query(
    `SELECT r.id, r.request_no, r.reason, r.void_charges, r.requested_at, u.full_name AS requested_by FROM "billing"."bill_cancel_requests" r LEFT JOIN "auth"."users" u ON u.id=r.requested_by
      WHERE r.invoice_id=$1 AND r.status='Requested' AND r.is_deleted=false ORDER BY r.id DESC LIMIT 1`, [id])).rows[0] || null;
  return { invoice: inv, lines, payments, cancel_request, centre: Object.fromEntries(s.map((r) => [r.key, r.value])) };
}

router.get('/billing/visit/:visitId', need('billing.cashier'), wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const visit = await getVisit(db, vid);
  const patient = (await db.query(`SELECT id, mrn, full_name, phone FROM "mpi"."patients" WHERE id=$1`, [visit.patient_id])).rows[0];
  const pending = (await db.query(
    `SELECT c.id, c.description, c.qty, c.unit_price, c.amount, c.source, s.covered, s.needs_preauth FROM "billing"."charges" c JOIN "billing"."services" s ON s.id=c.service_id
      WHERE c.visit_id=$1 AND c.status='Pending' AND c.is_deleted=false ORDER BY c.id`, [vid])).rows;
  const inv = (await db.query(`SELECT id FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [vid])).rows[0];
  const dep = (await db.query(`SELECT COALESCE(SUM(amount-used),0) AS bal FROM "billing"."deposits" WHERE patient_id=$1 AND status='Open' AND is_deleted=false`, [visit.patient_id])).rows[0];
  const pre = (await db.query(
    `SELECT pa.auth_no, pa.status, s.name FROM "insurance"."pre_auths" pa JOIN "billing"."services" s ON s.id=pa.service_id WHERE pa.visit_id=$1 AND pa.is_deleted=false`, [vid])).rows;
  const session = (await db.query(`SELECT * FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false LIMIT 1`, [req.user.id])).rows[0];
  let checkin = null;
  if (visit.discount_status) {
    const g = pending.reduce((a, c) => a + Number(c.amount), 0);
    checkin = { type: visit.discount_type, value: Number(visit.discount_value), reason: visit.discount_reason, status: visit.discount_status,
      pct_now: visit.discount_type === 'amount' ? (g > 0 ? round2(Math.min(100, (Number(visit.discount_value) / g) * 100)) : 0) : Number(visit.discount_value) };
  }
  res.json({
    checkin_discount: checkin,
    visit: { id: visit.id, visit_no: visit.visit_no, status: visit.status, payer_type: visit.payer_type, eligibility_status: visit.eligibility_status },
    patient, pending, invoice: inv ? await invoiceBundle(inv.id) : null, deposit_balance: round2(dep.bal), preauths: pre, session: session || null,
  });
}));

router.post('/billing/visit/:visitId/invoice', need('billing.cashier'), wrap(async (req, res) => {
  const id = await db.tx(async (client) => {
    const invId = await billing.createOrRefreshInvoice(client, req.user, Number(req.params.visitId), req.body || {});
    await audit(client, req.user, 'INVOICE_SAVE', 'invoices', invId, { discount_pct: req.body.discount_pct }, req.ip);
    return invId;
  });
  res.json(await invoiceBundle(id));
}));

router.get('/billing/invoices/:id', need('invoices.view'), wrap(async (req, res) => {
  res.json(await invoiceBundle(Number(req.params.id)));
}));

/** Remove one test / study / procedure / manual charge (and cancel its order if not started). */
async function removeChargeTx(client, req, id, reason) {
    const c = (await client.query(`SELECT * FROM "billing"."charges" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [id])).rows[0];
    if (!c) throw notFound('Charge not found');
    if (c.status === 'Cancelled') throw conflict('Already removed');
    let inv = null;
    if (c.status === 'Invoiced') {
      inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1`, [c.invoice_id])).rows[0];
      if (!inv || inv.status === 'Cancelled') throw conflict('The invoice is cancelled');
      if (Number(inv.paid) > 0.005 && !req.user.perms.has('bill_cancel_requests.approve')) throw conflict('This bill already has a payment. Only a cashier manager can remove a single item from a paid bill (the difference is refunded); otherwise use "Request bill cancel".');
      if (Number(inv.paid) > 0.005) await billing.assertDayOpen(client);
      if (inv.payer_type !== 'Cash' && (await client.query(`SELECT 1 FROM "insurance"."claims" WHERE invoice_id=$1 AND is_deleted=false LIMIT 1`, [inv.id])).rows.length) throw conflict('A claim exists for this invoice');
    }
    if (c.source === 'Lab') {
      const it = (await client.query(`SELECT i.id, i.order_id, i.status, o.status AS ostatus FROM "lab"."lab_order_items" i JOIN "lab"."lab_orders" o ON o.id=i.order_id WHERE i.id=$1`, [c.source_id])).rows[0];
      if (it) {
        if (it.ostatus !== 'Ordered' || it.status !== 'Pending') throw conflict('The sample is already collected / tested, so this test cannot be removed here');
        await client.query(`UPDATE "lab"."lab_order_items" SET is_deleted=true, updated_at=now() WHERE id=$1`, [it.id]);
        const left = (await client.query(`SELECT COUNT(*)::int n FROM "lab"."lab_order_items" WHERE order_id=$1 AND is_deleted=false`, [it.order_id])).rows[0].n;
        if (!left) await client.query(`UPDATE "lab"."lab_orders" SET status='Cancelled', updated_at=now() WHERE id=$1`, [it.order_id]);
      }
    } else if (c.source === 'Radiology') {
      const o = (await client.query(`SELECT status FROM "radiology"."imaging_orders" WHERE id=$1`, [c.source_id])).rows[0];
      if (o) {
        if (o.status !== 'Ordered') throw conflict('The study has already started, so it cannot be removed here');
        await client.query(`UPDATE "radiology"."imaging_orders" SET is_deleted=true, updated_at=now() WHERE id=$1`, [c.source_id]);
      }
    } else if (c.source === 'Procedure') {
      const o = (await client.query(`SELECT status FROM "clinical"."procedure_orders" WHERE id=$1`, [c.source_id])).rows[0];
      if (o) {
        if (o.status !== 'Ordered') throw conflict('The procedure is already done');
        await client.query(`UPDATE "clinical"."procedure_orders" SET status='Cancelled', updated_at=now() WHERE id=$1`, [c.source_id]);
      }
    } else if (c.source === 'Consultation') {
      /* consultation fee: only the charge is cancelled, the visit itself stays */
    } else if (c.source === 'Pharmacy') throw conflict('Medicines are already dispensed: return them through Pharmacy (dispense return) instead');
    else if (c.source === 'Dental') throw conflict('This dental treatment is already completed on the chart, so its charge cannot be removed here');
    else if (c.source !== 'Manual') throw conflict(`${c.source} items cannot be removed here`);
    await client.query(`UPDATE "billing"."charges" SET status='Cancelled', updated_at=now() WHERE id=$1`, [id]);
    await audit(client, req.user, 'CHARGE_REMOVE', 'charges', id, { reason, source: c.source, description: c.description, amount: c.amount, invoice_id: c.invoice_id }, req.ip);
    let refunded = 0;
    if (inv) {
      const left = (await client.query(`SELECT COUNT(*)::int n FROM "billing"."charges" WHERE invoice_id=$1 AND is_deleted=false AND status <> 'Cancelled'`, [inv.id])).rows[0].n;
      if (!left) await client.query(`UPDATE "billing"."invoices" SET status='Cancelled', notes=COALESCE(notes||' · ','')||$2, updated_at=now() WHERE id=$1`, [inv.id, `All items removed: ${reason}`]);
      else await billing.createOrRefreshInvoice(client, req.user, c.visit_id, {});
      if (Number(inv.paid) > 0.005) refunded = await refundExcess(client, req, inv.id, reason);
    }
    await billing.settleVisit(client, c.visit_id);
    return { visit_id: c.visit_id, refunded };
}

/** After an item is removed from a paid bill: give back whatever the patient paid above the new total, newest payment first. */
async function refundExcess(client, req, invoiceId, reason) {
  const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1`, [invoiceId])).rows[0];
  const target = inv.status === 'Cancelled' ? 0 : Number(inv.patient_share);
  const st = await billing.refreshInvoice(client, invoiceId);
  let excess = round2(st.paid - target);
  if (excess <= 0.005) return 0;
  const session = (await client.query(`SELECT id FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [req.user.id])).rows[0];
  const pays = (await client.query(`SELECT * FROM "billing"."payments" WHERE invoice_id=$1 AND kind='Payment' AND is_deleted=false ORDER BY id DESC`, [invoiceId])).rows;
  let done = 0;
  for (const p of pays) {
    if (excess <= 0.005) break;
    if (p.method === 'Deposit') throw conflict('Part of this bill was paid from a deposit: ask for a full bill cancel request instead');
    if (p.method === 'Cash' && !session) throw conflict('Open your cashier session first: the cash goes back to the patient from your drawer');
    const take = round2(Math.min(excess, Number(p.amount)));
    const code = await db.nextCode(client, 'RCP', 6);
    await client.query(
      `INSERT INTO "billing"."payments"("receipt_no","invoice_id","patient_id","kind","amount","method","reference","cashier_id","session_id","paid_at","created_by","updated_by")
       VALUES ($1,$2,$3,'Refund',$4,$5,$6,$7,$8,now(),$7,$7)`, [code, invoiceId, p.patient_id, take, p.method, `ITEM REMOVED: ${reason}`.slice(0, 120), req.user.id, session ? session.id : null]);
    excess = round2(excess - take); done = round2(done + take);
  }
  await billing.refreshInvoice(client, invoiceId);
  return done;
}

/** Remove a test / study / procedure the patient does not want. Cancels the order too, if it has not started. */
router.post('/billing/charges/:id/remove', need('billing.cashier'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) throw bad('A reason is required');
  const out = await db.tx((client) => removeChargeTx(client, req, id, reason));
  res.json({ ok: true, ...out });
}));

/** Cancel every unbilled test / study / procedure of a visit in one go (e.g. the patient leaves without paying). */
router.post('/billing/visit/:visitId/cancel-unbilled', need('billing.cashier'), wrap(async (req, res) => {
  const vid = Number(req.params.visitId);
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) throw bad('A reason is required');
  const out = await db.tx(async (client) => {
    const pend = (await client.query(`SELECT id, description, source FROM "billing"."charges" WHERE visit_id=$1 AND status='Pending' AND is_deleted=false ORDER BY id`, [vid])).rows;
    const removed = []; const kept = [];
    for (const c of pend) {
      await client.query('SAVEPOINT rc');
      try { await removeChargeTx(client, req, c.id, reason); removed.push(c.description); await client.query('RELEASE SAVEPOINT rc'); }
      catch (e) { await client.query('ROLLBACK TO SAVEPOINT rc'); kept.push({ description: c.description, why: e.message }); }
    }
    return { removed, kept };
  });
  res.json({ ok: true, ...out });
}));

/** Cancel (void) a receipt taken by mistake: posts a matching refund entry. Cashier / manager only. */
router.post('/billing/payments/:id/void', need('bill_cancel_requests.approve'), wrap(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) throw bad('Enter a reason for cancelling this receipt');
  const out = await db.tx(async (client) => {
    await billing.assertDayOpen(client);
    const p = (await client.query(`SELECT * FROM "billing"."payments" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [Number(req.params.id)])).rows[0];
    if (!p) throw notFound('Receipt not found');
    if (p.kind !== 'Payment') throw conflict('Only a payment receipt can be cancelled');
    if (p.method === 'Deposit') throw conflict('A receipt paid from a deposit cannot be cancelled here');
    const dup = (await client.query(`SELECT 1 FROM "billing"."payments" WHERE invoice_id=$1 AND kind='Refund' AND reference=$2 AND is_deleted=false`, [p.invoice_id, `VOID ${p.receipt_no}`])).rows.length;
    if (dup) throw conflict('This receipt is already cancelled');
    const session = (await client.query(`SELECT id FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [req.user.id])).rows[0];
    if (p.method === 'Cash' && !session) throw conflict('Open your cashier session first: the cash goes back to the patient from your drawer');
    const code = await db.nextCode(client, 'RCP', 6);
    await client.query(
      `INSERT INTO "billing"."payments"("receipt_no","invoice_id","patient_id","kind","amount","method","reference","cashier_id","session_id","paid_at","created_by","updated_by")
       VALUES ($1,$2,$3,'Refund',$4,$5,$6,$7,$8,now(),$7,$7)`, [code, p.invoice_id, p.patient_id, p.amount, p.method, `VOID ${p.receipt_no}`, req.user.id, session ? session.id : null]);
    const st = await billing.refreshInvoice(client, p.invoice_id);
    const inv = (await client.query(`SELECT visit_id FROM "billing"."invoices" WHERE id=$1`, [p.invoice_id])).rows[0];
    if (inv && inv.visit_id) await client.query(`UPDATE "scheduling"."visits" SET status='Billing', closed_at=NULL, updated_at=now() WHERE id=$1 AND status='Completed'`, [inv.visit_id]);
    await audit(client, req.user, 'PAYMENT_VOID', 'payments', p.id, { receipt: p.receipt_no, amount: p.amount, method: p.method, reason }, req.ip);
    return { receipt_no: code, ...st };
  });
  res.json({ ok: true, ...out });
}));

router.post('/billing/invoices/:id/pay', need('billing.cashier'), wrap(async (req, res) => {
  const out = await db.tx(async (client) => {
    const r = await billing.payInvoice(client, req.user, Number(req.params.id), req.body);
    await audit(client, req.user, 'PAYMENT', 'payments', r.payment_id, { amount: req.body.amount, method: req.body.method }, req.ip);
    return r;
  });
  res.json({ ...out, bundle: await invoiceBundle(Number(req.params.id)) });
}));

router.post('/billing/invoices/:id/cancel', need('billing.cashier'), wrap(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) throw bad('Enter a reason for cancelling the invoice');
  await db.tx(async (client) => {
    const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [Number(req.params.id)])).rows[0];
    if (!inv) throw notFound('Invoice not found');
    if (inv.status === 'Cancelled') throw conflict('Already cancelled');
    if (Number(inv.paid) > 0) throw conflict('This invoice has payments. Refund first, then cancel.');
    const claim = (await client.query(`SELECT 1 FROM "insurance"."claims" WHERE invoice_id=$1 AND status NOT IN ('Rejected') AND is_deleted=false LIMIT 1`, [inv.id])).rows.length;
    if (claim) throw conflict('A claim exists for this invoice');
    await client.query(`UPDATE "billing"."invoices" SET status='Cancelled', notes = COALESCE(notes,'') || $2, updated_at=now() WHERE id=$1`, [inv.id, ` [Cancelled: ${reason}]`]);
    await client.query(`UPDATE "billing"."charges" SET status='Pending', invoice_id=NULL, updated_at=now() WHERE invoice_id=$1 AND status='Invoiced'`, [inv.id]);
    await audit(client, req.user, 'INVOICE_CANCEL', 'invoices', inv.id, { reason }, req.ip);
  });
  res.json({ ok: true });
}));

/* ---- day close ---- */
async function daySummary(client, date) {
  const q = (sql, a) => client.query(sql, a);
  const pay = (await q(`SELECT method, kind, COALESCE(SUM(amount),0) amt, COUNT(*)::int n FROM "billing"."payments" WHERE paid_at::date=$1::date AND is_deleted=false GROUP BY method, kind`, [date])).rows;
  const sum = (m, k) => round2(pay.filter((r) => r.method === m && r.kind === k).reduce((a, r) => a + Number(r.amt), 0));
  const refunds = round2(pay.filter((r) => r.kind === 'Refund').reduce((a, r) => a + Number(r.amt), 0));
  const cash = round2(sum('Cash', 'Payment') - sum('Cash', 'Refund'));
  const card = round2(sum('Card', 'Payment') - sum('Card', 'Refund'));
  const bank = round2(sum('Bank transfer', 'Payment') - sum('Bank transfer', 'Refund'));
  const online = round2(sum('Online', 'Payment') + sum('Deposit', 'Payment') - sum('Online', 'Refund') - sum('Deposit', 'Refund'));
  const payments_count = pay.filter((r) => r.kind === 'Payment').reduce((a, r) => a + r.n, 0);
  const inv = (await q(`SELECT COUNT(*)::int n, COALESCE(SUM(net),0) total FROM "billing"."invoices" WHERE invoice_date=$1::date AND status<>'Cancelled' AND is_deleted=false`, [date])).rows[0];
  const sessions = (await q(`SELECT s.id, s.status, s.opened_at, s.closed_at, s.opening_cash, s.expected_cash, s.closing_cash, s.variance, u.full_name AS cashier
      FROM "billing"."cashier_sessions" s LEFT JOIN "auth"."users" u ON u.id=s.user_id WHERE s.opened_at::date=$1::date OR s.status='Open' AND s.is_deleted=false ORDER BY s.id`, [date])).rows;
  const open_sessions = sessions.filter((s) => s.status === 'Open').length;
  const unpaid = (await q(`SELECT COUNT(*)::int n, COALESCE(SUM(balance),0) amt FROM "billing"."invoices" WHERE status IN ('Issued','Partially Paid') AND balance > 0.005 AND is_deleted=false`)).rows[0];
  const pending = (await q(`SELECT COUNT(*)::int n FROM "billing"."charges" WHERE status='Pending' AND is_deleted=false`)).rows[0];
  const closed = (await q(`SELECT d.*, u.full_name AS closed_by_name FROM "billing"."day_closes" d LEFT JOIN "auth"."users" u ON u.id=d.closed_by WHERE d.close_date=$1::date AND d.is_deleted=false`, [date])).rows[0] || null;
  return { date, cash, card, bank, online, refunds, net: round2(cash + card + bank + online), payments_count, invoices_count: inv.n, invoices_total: Number(inv.total),
    sessions, open_sessions, unpaid_invoices: unpaid.n, unpaid_amount: Number(unpaid.amt), pending_charges: pending.n, closed };
}

router.get('/billing/day-close/summary', need('billing.day_close'), wrap(async (req, res) => {
  const d = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.date : today();
  res.json(await daySummary(db, d));
}));

router.post('/billing/day-close', need('billing.day_close'), wrap(async (req, res) => {
  const out = await db.tx(async (client) => {
    const date = today();
    const sm = await daySummary(client, date);
    if (sm.closed && sm.closed.status === 'Closed') throw conflict('Today is already closed');
    if (sm.open_sessions) throw conflict(`${sm.open_sessions} cashier session(s) are still open. Close them first.`);
    const vals = [date, sm.cash, sm.card, sm.bank, sm.online, sm.refunds, sm.net, sm.invoices_count, sm.payments_count, req.body.counted_cash == null || req.body.counted_cash === '' ? null : Number(req.body.counted_cash), req.body.notes || null, req.user.id];
    if (sm.closed) {
      await client.query(`UPDATE "billing"."day_closes" SET status='Closed', cash_total=$2, card_total=$3, bank_total=$4, online_total=$5, refund_total=$6, net_total=$7, invoices_count=$8, payments_count=$9, counted_cash=$10, notes=$11, closed_by=$12, closed_at=now(), updated_by=$12, updated_at=now() WHERE close_date=$1::date`, vals);
    } else {
      await client.query(`INSERT INTO "billing"."day_closes"("close_date","cash_total","card_total","bank_total","online_total","refund_total","net_total","invoices_count","payments_count","counted_cash","notes","closed_by","closed_at","status","created_by","updated_by") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),'Closed',$12,$12)`, vals);
    }
    await audit(client, req.user, 'DAY_CLOSE', 'day_closes', null, { date, net: sm.net, cash: sm.cash }, req.ip);
    return daySummary(client, date);
  });
  res.json(out);
}));

router.post('/billing/day-close/reopen', need('billing.day_reopen'), wrap(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) throw bad('Enter a reason for reopening the day');
  await db.tx(async (client) => {
    const r = await client.query(`UPDATE "billing"."day_closes" SET status='Reopened', reopened_by=$1, reopen_reason=$2, updated_at=now() WHERE close_date=CURRENT_DATE AND status='Closed' AND is_deleted=false`, [req.user.id, reason]);
    if (!r.rowCount) throw conflict('Today is not closed');
    await audit(client, req.user, 'DAY_REOPEN', 'day_closes', null, { reason }, req.ip);
  });
  res.json({ ok: true });
}));

/* ---- cashier session ---- */
router.get('/billing/session/current', need('billing.cashier'), wrap(async (req, res) => {
  const s = (await db.query(`SELECT * FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false LIMIT 1`, [req.user.id])).rows[0];
  if (!s) return res.json({ session: null });
  const t = (await db.query(
    `SELECT COALESCE(SUM(CASE WHEN kind='Payment' AND method='Cash' THEN amount WHEN kind='Refund' AND method='Cash' THEN -amount ELSE 0 END),0) AS cash,
            COALESCE(SUM(CASE WHEN kind='Payment' THEN amount ELSE -amount END),0) AS total, COUNT(*)::int n
       FROM "billing"."payments" WHERE session_id=$1 AND is_deleted=false`, [s.id])).rows[0];
  res.json({ session: s, takings: t, expected_cash: round2(Number(s.opening_cash) + Number(t.cash)) });
}));

router.post('/billing/session/open', need('billing.cashier'), wrap(async (req, res) => {
  const opening = Number(req.body.opening_cash || 0);
  if (!(opening >= 0)) throw bad('Opening cash must be zero or more');
  await billing.assertDayOpen(db);
  const ex = (await db.query(`SELECT 1 FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false`, [req.user.id])).rows.length;
  if (ex) throw conflict('You already have an open session');
  const id = (await db.query(
    `INSERT INTO "billing"."cashier_sessions"("user_id","opened_at","opening_cash","status","created_by","updated_by") VALUES ($1,now(),$2,'Open',$1,$1) RETURNING id`, [req.user.id, opening])).rows[0].id;
  await audit(null, req.user, 'SESSION_OPEN', 'cashier_sessions', id, { opening }, req.ip);
  res.json({ id });
}));

router.post('/billing/session/close', need('billing.cashier'), wrap(async (req, res) => {
  const counted = Number(req.body.closing_cash);
  if (!(counted >= 0)) throw bad('Enter the counted cash');
  const out = await db.tx(async (client) => {
    const s = (await client.query(`SELECT * FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false FOR UPDATE`, [req.user.id])).rows[0];
    if (!s) throw conflict('No open session');
    const t = (await client.query(
      `SELECT COALESCE(SUM(CASE WHEN kind='Payment' AND method='Cash' THEN amount WHEN kind='Refund' AND method='Cash' THEN -amount ELSE 0 END),0) AS cash FROM "billing"."payments" WHERE session_id=$1`, [s.id])).rows[0];
    const expected = round2(Number(s.opening_cash) + Number(t.cash));
    const variance = round2(counted - expected);
    await client.query(
      `UPDATE "billing"."cashier_sessions" SET status='Closed', closed_at=now(), expected_cash=$1, closing_cash=$2, variance=$3, notes=$4, updated_at=now() WHERE id=$5`,
      [expected, counted, variance, req.body.notes || null, s.id]);
    await audit(client, req.user, 'SESSION_CLOSE', 'cashier_sessions', s.id, { expected, counted, variance }, req.ip);
    return { expected, counted, variance };
  });
  res.json(out);
}));

/* ================================================================ Claims workbench */
router.get('/claims/summary', need('claims.work'), wrap(async (req, res) => {
  const byStatus = (await db.query(`SELECT status, COUNT(*)::int n, COALESCE(SUM(amount),0) amount, COALESCE(SUM(paid_amount),0) paid FROM "insurance"."claims" WHERE is_deleted=false GROUP BY status`)).rows;
  const ready = (await db.query(
    `SELECT i.id, i.invoice_no, i.invoice_date, i.payer_share, p.mrn, p.full_name, py.name AS payer
       FROM "billing"."invoices" i JOIN "mpi"."patients" p ON p.id=i.patient_id LEFT JOIN "insurance"."payers" py ON py.id=i.payer_id
      WHERE i.payer_type='Insurance' AND i.status <> 'Cancelled' AND i.payer_share > 0 AND i.is_deleted=false
        AND NOT EXISTS (SELECT 1 FROM "insurance"."claims" c WHERE c.invoice_id=i.id AND c.status <> 'Rejected' AND c.is_deleted=false)
      ORDER BY i.id DESC LIMIT 100`)).rows;
  const preauth = (await db.query(`SELECT count(*)::int n FROM "insurance"."pre_auths" WHERE status='Requested' AND is_deleted=false`)).rows[0].n;
  const openRej = (await db.query(`SELECT count(*)::int n FROM "insurance"."rejections" WHERE status='Open' AND is_deleted=false`)).rows[0].n;
  res.json({ by_status: byStatus, invoices_without_claim: ready, pending_preauth: preauth, open_rejections: openRej });
}));

router.get('/claims/list', need('claims.work'), wrap(async (req, res) => {
  const params = [];
  let where = `c.is_deleted=false`;
  if (req.query.status) { params.push(req.query.status); where += ` AND c.status=$${params.length}`; }
  const { rows } = await db.query(
    `SELECT c.id, c.claim_no, c.status, c.amount, c.paid_amount, c.submitted_at, c.scrub_errors, p.mrn, p.full_name, py.name AS payer, i.invoice_no,
            (SELECT json_agg(json_build_object('id',r.id,'code',rc.code,'reason',r.reason,'status',r.status)) FROM "insurance"."rejections" r LEFT JOIN "insurance"."rejection_codes" rc ON rc.id=r.code_id WHERE r.claim_id=c.id AND r.is_deleted=false) AS rejections
       FROM "insurance"."claims" c JOIN "mpi"."patients" p ON p.id=c.patient_id LEFT JOIN "insurance"."payers" py ON py.id=c.payer_id LEFT JOIN "billing"."invoices" i ON i.id=c.invoice_id
      WHERE ${where} ORDER BY c.id DESC LIMIT 200`, params);
  res.json(rows);
}));

router.post('/claims/from-invoice/:invoiceId', need('claims.work'), wrap(async (req, res) => {
  const out = await db.tx(async (client) => {
    const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1 AND is_deleted=false`, [Number(req.params.invoiceId)])).rows[0];
    if (!inv) throw notFound('Invoice not found');
    if (inv.payer_type !== 'Insurance') throw bad('Claims are raised for insurance invoices only');
    if (inv.status === 'Cancelled') throw conflict('Invoice is cancelled');
    if (!(Number(inv.payer_share) > 0)) throw bad('There is no payer share on this invoice');
    const ex = (await client.query(`SELECT claim_no FROM "insurance"."claims" WHERE invoice_id=$1 AND status <> 'Rejected' AND is_deleted=false LIMIT 1`, [inv.id])).rows[0];
    if (ex) throw conflict(`Claim ${ex.claim_no} already exists for this invoice`);
    const charges = (await client.query(
      `SELECT c.id, c.service_id, c.description, c.amount, s.code FROM "billing"."charges" c JOIN "billing"."services" s ON s.id=c.service_id
        WHERE c.invoice_id=$1 AND c.is_deleted=false AND c.status='Invoiced' AND s.covered ORDER BY c.id`, [inv.id])).rows;
    if (!charges.length) throw bad('No covered services on this invoice');
    const coveredTotal = charges.reduce((s, c) => s + Number(c.amount), 0);
    const no = await db.nextCode(client, 'CLM', 6);
    const cid = (await client.query(
      `INSERT INTO "insurance"."claims"("claim_no","invoice_id","visit_id","patient_id","payer_id","policy_id","amount","paid_amount","status","created_by","updated_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,'Draft',$8,$8) RETURNING id`, [no, inv.id, inv.visit_id, inv.patient_id, inv.payer_id, inv.policy_id, inv.payer_share, req.user.id])).rows[0].id;
    let allocated = 0;
    for (let i = 0; i < charges.length; i += 1) {
      const c = charges[i];
      const share = i === charges.length - 1 ? round2(Number(inv.payer_share) - allocated) : round2((Number(c.amount) / coveredTotal) * Number(inv.payer_share));
      allocated = round2(allocated + share);
      await client.query(
        `INSERT INTO "insurance"."claim_lines"("claim_id","charge_id","service_id","service_code","description","amount","created_by","updated_by") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [cid, c.id, c.service_id, c.code, c.description, share, req.user.id]);
    }
    await audit(client, req.user, 'CLAIM_CREATE', 'claims', cid, { invoice: inv.invoice_no }, req.ip);
    return { id: cid, claim_no: no };
  });
  res.status(201).json(out);
}));

/** Pre-submission checks. Returns list of problems; empty list = ready. */
async function scrubClaim(client, claim) {
  const errors = [];
  const visit = claim.visit_id ? (await client.query(`SELECT * FROM "scheduling"."visits" WHERE id=$1`, [claim.visit_id])).rows[0] : null;
  const policy = claim.policy_id ? (await client.query(`SELECT pm.*, pl.annual_limit FROM "insurance"."policy_members" pm LEFT JOIN "insurance"."plans" pl ON pl.id=pm.plan_id WHERE pm.id=$1`, [claim.policy_id])).rows[0] : null;
  if (!policy) errors.push('No insurance policy on the claim');
  else {
    if (policy.status !== 'Active') errors.push(`Policy status is ${policy.status}`);
    const vd = visit ? visit.visit_date : null;
    if (vd && policy.valid_to < vd) errors.push(`Policy expired (${policy.valid_to}) before the visit date (${vd})`);
    if (vd && policy.valid_from && policy.valid_from > vd) errors.push(`Policy starts (${policy.valid_from}) after the visit date (${vd})`);
    if (policy.annual_limit && Number(policy.annual_limit) > 0) {
      const used = (await client.query(
        `SELECT COALESCE(SUM(amount),0) s FROM "insurance"."claims" WHERE policy_id=$1 AND id <> $2 AND status IN ('Submitted','Accepted','Partially Paid','Paid') AND is_deleted=false AND date_part('year', created_at)=date_part('year', now())`,
        [policy.id, claim.id])).rows[0].s;
      if (Number(used) + Number(claim.amount) > Number(policy.annual_limit)) errors.push(`Annual limit ${Number(policy.annual_limit).toFixed(2)} would be exceeded (already claimed ${Number(used).toFixed(2)})`);
    }
  }
  if (visit && visit.eligibility_status !== 'Eligible' && visit.visit_type !== 'Emergency') errors.push('Eligibility was not confirmed for this visit');
  const dx = (await client.query(`SELECT count(*)::int n FROM "clinical"."diagnoses" WHERE visit_id=$1 AND is_deleted=false`, [claim.visit_id])).rows[0].n;
  if (!dx) errors.push('No diagnosis recorded for the visit (diagnosis code is mandatory on claims)');
  const lines = (await client.query(
    `SELECT l.*, s.needs_preauth, s.name AS service_name FROM "insurance"."claim_lines" l JOIN "billing"."services" s ON s.id=l.service_id WHERE l.claim_id=$1 AND l.is_deleted=false`, [claim.id])).rows;
  if (!lines.length) errors.push('Claim has no lines');
  const sum = round2(lines.reduce((s, l) => s + Number(l.amount), 0));
  if (Math.abs(sum - Number(claim.amount)) > 0.01) errors.push(`Line total ${sum.toFixed(2)} does not equal claim amount ${Number(claim.amount).toFixed(2)}`);
  for (const l of lines) {
    if (!l.service_code) errors.push(`Line "${l.description}" has no service code`);
    if (l.needs_preauth) {
      const pa = (await client.query(
        `SELECT * FROM "insurance"."pre_auths" WHERE visit_id=$1 AND service_id=$2 AND is_deleted=false AND status IN ('Approved','Partially Approved') ORDER BY id DESC LIMIT 1`, [claim.visit_id, l.service_id])).rows[0];
      if (!pa) errors.push(`${l.service_name}: pre-authorisation is required but not approved`);
      else {
        if (pa.valid_to && visit && pa.valid_to < visit.visit_date) errors.push(`${l.service_name}: pre-authorisation expired on ${pa.valid_to}`);
        if (pa.status === 'Partially Approved' && Number(pa.approved_amount) < Number(l.amount)) errors.push(`${l.service_name}: approved amount ${Number(pa.approved_amount).toFixed(2)} is below the claimed ${Number(l.amount).toFixed(2)}`);
      }
    }
  }
  const dup = (await client.query(`SELECT claim_no FROM "insurance"."claims" WHERE invoice_id=$1 AND id <> $2 AND status <> 'Rejected' AND is_deleted=false LIMIT 1`, [claim.invoice_id, claim.id])).rows[0];
  if (dup) errors.push(`Duplicate: claim ${dup.claim_no} already exists for the same invoice`);
  return errors;
}

router.post('/claims/:id/scrub', need('claims.work'), wrap(async (req, res) => {
  const out = await db.tx(async (client) => {
    const c = (await client.query(`SELECT * FROM "insurance"."claims" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [Number(req.params.id)])).rows[0];
    if (!c) throw notFound('Claim not found');
    if (!['Draft', 'Scrub Failed', 'Ready'].includes(c.status)) throw conflict(`Claim is ${c.status}`);
    const errors = await scrubClaim(client, c);
    await client.query(`UPDATE "insurance"."claims" SET status=$1, scrub_errors=$2, updated_at=now() WHERE id=$3`, [errors.length ? 'Scrub Failed' : 'Ready', errors.length ? errors.map((e) => `- ${e}`).join('\n') : 'All checks passed', c.id]);
    return { ok: !errors.length, errors };
  });
  res.json(out);
}));

router.post('/claims/submit', need('claims.submit'), wrap(async (req, res) => {
  const ids = (req.body.claim_ids || []).map(Number);
  if (!ids.length) throw bad('Select claims to submit');
  const out = await db.tx(async (client) => {
    const claims = (await client.query(`SELECT * FROM "insurance"."claims" WHERE id = ANY($1::bigint[]) AND is_deleted=false FOR UPDATE`, [ids])).rows;
    if (claims.length !== ids.length) throw notFound('A selected claim was not found');
    const notReady = claims.filter((c) => c.status !== 'Ready');
    if (notReady.length) throw conflict(`Only claims in "Ready" status can be submitted (${notReady.map((c) => `${c.claim_no}: ${c.status}`).join(', ')})`);
    const byPayer = {};
    for (const c of claims) (byPayer[c.payer_id] = byPayer[c.payer_id] || []).push(c);
    const batches = [];
    for (const [payerId, list] of Object.entries(byPayer)) {
      const cfg = (await client.query(`SELECT mode FROM "admin"."integration_settings" WHERE type='Insurer' AND active AND is_deleted=false ORDER BY id LIMIT 1`)).rows[0];
      const mode = cfg ? cfg.mode : 'Simulated';
      const no = await db.nextCode(client, 'BCH', 6);
      const total = round2(list.reduce((s, c) => s + Number(c.amount), 0));
      const bid = (await client.query(
        `INSERT INTO "insurance"."claim_batches"("batch_no","payer_id","submitted_at","claim_count","total","status","reference","created_by","updated_by")
         VALUES ($1,$2,now(),$3,$4,'Submitted',$5,$6,$6) RETURNING id`, [no, payerId, list.length, total, `${mode.toUpperCase()}-${no}`, req.user.id])).rows[0].id;
      await client.query(`UPDATE "insurance"."claims" SET status='Submitted', batch_id=$1, submitted_at=now(), updated_at=now() WHERE id = ANY($2::bigint[])`, [bid, list.map((c) => c.id)]);
      await client.query(
        `INSERT INTO "admin"."integration_logs"("integration","direction","reference","status","message","created_by","updated_by")
         VALUES ('Insurer claims','Outbound',$1,$2,$3,$4,$4)`,
        [no, mode === 'Live' ? 'Queued' : 'Simulated', `${list.length} claim(s), total ${total.toFixed(2)} QAR. ${mode === 'Live' ? 'Queued for the payer adapter.' : 'Simulation mode: nothing was sent to the payer.'}`, req.user.id]);
      batches.push({ batch_no: no, claims: list.length, total, mode });
    }
    await audit(client, req.user, 'CLAIMS_SUBMIT', 'claims', null, { ids }, req.ip);
    return { batches };
  });
  res.json(out);
}));

/** Record the payer's decision (manual entry, or from the integration adapter). */
router.post('/claims/:id/decision', need('claims.work'), wrap(async (req, res) => {
  const { status, code_id, reason } = req.body;
  if (!['Accepted', 'Rejected'].includes(status)) throw bad('Decision must be Accepted or Rejected');
  await db.tx(async (client) => {
    const c = (await client.query(`SELECT * FROM "insurance"."claims" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [Number(req.params.id)])).rows[0];
    if (!c) throw notFound('Claim not found');
    if (!['Submitted', 'Appealed'].includes(c.status)) throw conflict(`Claim is ${c.status}; a decision can be recorded for Submitted or Appealed claims`);
    if (status === 'Rejected') {
      if (!String(reason || '').trim() && !code_id) throw bad('Give a rejection code or reason');
      await client.query(`UPDATE "insurance"."claims" SET status='Rejected', updated_at=now() WHERE id=$1`, [c.id]);
      await client.query(
        `INSERT INTO "insurance"."rejections"("claim_id","code_id","reason","status","assigned_to","created_by","updated_by") VALUES ($1,$2,$3,'Open',$4,$4,$4)`,
        [c.id, code_id || null, reason || null, req.user.id]);
    } else {
      await client.query(`UPDATE "insurance"."claims" SET status='Accepted', updated_at=now() WHERE id=$1`, [c.id]);
      await client.query(`UPDATE "insurance"."rejections" SET status='Closed', updated_at=now() WHERE claim_id=$1 AND status IN ('Open','Appealed')`, [c.id]);
    }
    await audit(client, req.user, 'CLAIM_DECISION', 'claims', c.id, { status, code_id, reason }, req.ip);
  });
  res.json({ ok: true });
}));

router.post('/claims/:id/appeal', need('claims.work'), wrap(async (req, res) => {
  await db.tx(async (client) => {
    const c = (await client.query(`SELECT * FROM "insurance"."claims" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [Number(req.params.id)])).rows[0];
    if (!c) throw notFound('Claim not found');
    if (c.status !== 'Rejected') throw conflict('Only rejected claims can be appealed');
    await client.query(`UPDATE "insurance"."claims" SET status='Appealed', updated_at=now() WHERE id=$1`, [c.id]);
    await client.query(`UPDATE "insurance"."rejections" SET status='Appealed', resolution=$2, updated_at=now() WHERE claim_id=$1 AND status='Open'`, [c.id, req.body.note || 'Appeal sent']);
  });
  res.json({ ok: true });
}));

router.post('/claims/:id/resubmit', need('claims.work'), wrap(async (req, res) => {
  await db.tx(async (client) => {
    const c = (await client.query(`SELECT * FROM "insurance"."claims" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [Number(req.params.id)])).rows[0];
    if (!c) throw notFound('Claim not found');
    if (c.status !== 'Rejected') throw conflict('Only rejected claims can be resubmitted');
    await client.query(`UPDATE "insurance"."claims" SET status='Draft', scrub_errors=NULL, updated_at=now() WHERE id=$1`, [c.id]);
    await client.query(`UPDATE "insurance"."rejections" SET status='Resubmitted', resolution=$2, updated_at=now() WHERE claim_id=$1 AND status='Open'`, [c.id, req.body.note || 'Corrected and resubmitted']);
  });
  res.json({ ok: true });
}));

module.exports = router;
