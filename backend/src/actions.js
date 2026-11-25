'use strict';
/** Handlers for resource actions declared in the registry (Approve, Post, Generate ...). */
const db = require('./db');
const { bad, conflict, notFound, round2 } = require('./lib');
const billing = require('./billingCore');

const map = {};
const def = (key, name, fn) => { map[`${key}.${name}`] = fn; };
const get = (key, name) => map[`${key}.${name}`];

const mustBe = (row, ...states) => {
  if (!states.includes(row.status)) throw conflict(`Only records in status ${states.join(' / ')} can do this (current: ${row.status})`);
};

/* ---------- stock helpers ---------- */
async function findOrCreateBatch(client, { store_id, drug_id, item_id, batch_no, expiry_date, cost_price, user }) {
  const ex = (await client.query(
    `SELECT id FROM "inventory"."stock_batches"
      WHERE is_deleted=false AND store_id=$1 AND batch_no=$2 AND COALESCE(drug_id,0)=COALESCE($3::bigint,0) AND COALESCE(item_id,0)=COALESCE($4::bigint,0)
        AND expiry_date IS NOT DISTINCT FROM $5::date LIMIT 1`,
    [store_id, batch_no, drug_id || null, item_id || null, expiry_date || null])).rows[0];
  if (ex) return ex.id;
  return (await client.query(
    `INSERT INTO "inventory"."stock_batches"("store_id","drug_id","item_id","batch_no","expiry_date","qty_on_hand","cost_price","received_on","created_by","updated_by")
     VALUES ($1,$2,$3,$4,$5,0,$6,CURRENT_DATE,$7,$7) RETURNING id`,
    [store_id, drug_id || null, item_id || null, batch_no, expiry_date || null, cost_price || 0, user.id])).rows[0].id;
}

async function moveStock(client, user, { batch_id, qty, movement, ref_no }) {
  const b = (await client.query(`SELECT * FROM "inventory"."stock_batches" WHERE id=$1 FOR UPDATE`, [batch_id])).rows[0];
  if (!b) throw notFound('Batch not found');
  const after = Number(b.qty_on_hand) + Number(qty);
  if (after < 0) throw conflict(`Insufficient stock in batch ${b.batch_no} (on hand ${b.qty_on_hand})`);
  await client.query(`UPDATE "inventory"."stock_batches" SET qty_on_hand=$1, updated_at=now() WHERE id=$2`, [after, batch_id]);
  await client.query(
    `INSERT INTO "inventory"."stock_ledger"("store_id","drug_id","item_id","batch_id","movement","qty","ref_no","moved_by","moved_at","created_by","updated_by")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$8,$8)`,
    [b.store_id, b.drug_id, b.item_id, batch_id, movement, qty, ref_no || null, user.id]);
  return b;
}

/* ---------- inventory ---------- */
def('requisitions', 'approve', async ({ client, row }) => {
  mustBe(row, 'Draft', 'Submitted');
  const n = (await client.query(`SELECT count(*)::int n FROM "inventory"."requisition_items" WHERE requisition_id=$1 AND is_deleted=false`, [row.id])).rows[0].n;
  if (!n) throw bad('Add at least one line first');
  await client.query(`UPDATE "inventory"."requisitions" SET status='Approved', updated_at=now() WHERE id=$1`, [row.id]);
});
def('requisitions', 'reject', async ({ client, row }) => {
  mustBe(row, 'Draft', 'Submitted');
  await client.query(`UPDATE "inventory"."requisitions" SET status='Rejected', updated_at=now() WHERE id=$1`, [row.id]);
});

def('purchase_orders', 'approve', async ({ client, row }) => {
  mustBe(row, 'Draft');
  const n = (await client.query(`SELECT count(*)::int n FROM "inventory"."po_items" WHERE po_id=$1 AND is_deleted=false`, [row.id])).rows[0].n;
  if (!n) throw bad('Add at least one line first');
  await client.query(`UPDATE "inventory"."purchase_orders" SET status='Approved', updated_at=now() WHERE id=$1`, [row.id]);
});
def('purchase_orders', 'cancel', async ({ client, row }) => {
  mustBe(row, 'Draft', 'Approved');
  await client.query(`UPDATE "inventory"."purchase_orders" SET status='Cancelled', updated_at=now() WHERE id=$1`, [row.id]);
});

def('grns', 'post', async ({ client, user, row }) => {
  mustBe(row, 'Draft');
  const lines = (await client.query(`SELECT * FROM "inventory"."grn_items" WHERE grn_id=$1 AND is_deleted=false`, [row.id])).rows;
  if (!lines.length) throw bad('Add received items first');
  let total = 0;
  for (const l of lines) {
    if (!!l.drug_id === !!l.item_id) throw bad('Each line needs either a drug or an item (not both)');
    if (!(l.qty > 0)) throw bad('Quantity must be positive');
    const bid = await findOrCreateBatch(client, { store_id: row.store_id, drug_id: l.drug_id, item_id: l.item_id, batch_no: l.batch_no, expiry_date: l.expiry_date, cost_price: l.unit_cost, user });
    await moveStock(client, user, { batch_id: bid, qty: l.qty, movement: 'GRN', ref_no: row.grn_no });
    total += Number(l.qty) * Number(l.unit_cost);
    if (row.po_id) {
      await client.query(
        `UPDATE "inventory"."po_items" SET received_qty = received_qty + $1, updated_at=now()
          WHERE po_id=$2 AND COALESCE(drug_id,0)=COALESCE($3::bigint,0) AND COALESCE(item_id,0)=COALESCE($4::bigint,0) AND is_deleted=false`,
        [l.qty, row.po_id, l.drug_id, l.item_id]);
    }
  }
  if (row.po_id) {
    const r = (await client.query(
      `SELECT bool_and(received_qty >= qty) AS done, bool_or(received_qty > 0) AS any FROM "inventory"."po_items" WHERE po_id=$1 AND is_deleted=false`, [row.po_id])).rows[0];
    await client.query(`UPDATE "inventory"."purchase_orders" SET status=$1, updated_at=now() WHERE id=$2 AND status IN ('Approved','Partially Received')`,
      [r.done ? 'Received' : r.any ? 'Partially Received' : 'Approved', row.po_id]);
  }
  await client.query(`UPDATE "inventory"."grns" SET status='Posted', updated_at=now() WHERE id=$1`, [row.id]);
  // payable
  if (row.invoice_no && total > 0) {
    const sup = (await client.query(`SELECT credit_days FROM "inventory"."suppliers" WHERE id=$1`, [row.supplier_id])).rows[0];
    await client.query(
      `INSERT INTO "finance"."vendor_bills"("bill_ref","supplier_id","grn_id","bill_date","due_date","amount","paid","status","created_by","updated_by")
       VALUES ($1,$2,$3,CURRENT_DATE, CURRENT_DATE + $4::int, $5, 0, 'Unpaid', $6, $6)`,
      [row.invoice_no, row.supplier_id, row.id, (sup && sup.credit_days) || 30, round2(total), user.id]);
  }
  return { message: `Posted ${lines.length} line(s) to stock` + (row.invoice_no ? ' and created a vendor bill' : '') };
});

def('stock_adjustments', 'post', async ({ client, user, row }) => {
  mustBe(row, 'Draft');
  if (!row.qty_change) throw bad('Quantity change cannot be zero');
  const b = (await client.query(`SELECT store_id FROM "inventory"."stock_batches" WHERE id=$1`, [row.batch_id])).rows[0];
  if (!b || b.store_id !== row.store_id) throw bad('Batch does not belong to the selected store');
  await moveStock(client, user, { batch_id: row.batch_id, qty: row.qty_change, movement: `Adjustment (${row.reason})`, ref_no: row.adj_no });
  await client.query(`UPDATE "inventory"."stock_adjustments" SET status='Posted', updated_at=now() WHERE id=$1`, [row.id]);
});

def('stock_transfers', 'post', async ({ client, user, row }) => {
  mustBe(row, 'Draft');
  if (row.from_store_id === row.to_store_id) throw bad('From and To store must be different');
  if (!(row.qty > 0)) throw bad('Quantity must be positive');
  const b = (await client.query(`SELECT * FROM "inventory"."stock_batches" WHERE id=$1`, [row.batch_id])).rows[0];
  if (!b || b.store_id !== row.from_store_id) throw bad('Batch is not in the From store');
  await moveStock(client, user, { batch_id: b.id, qty: -row.qty, movement: 'Transfer Out', ref_no: row.trf_no });
  const to = await findOrCreateBatch(client, { store_id: row.to_store_id, drug_id: b.drug_id, item_id: b.item_id, batch_no: b.batch_no, expiry_date: b.expiry_date, cost_price: b.cost_price, user });
  await moveStock(client, user, { batch_id: to, qty: row.qty, movement: 'Transfer In', ref_no: row.trf_no });
  await client.query(`UPDATE "inventory"."stock_transfers" SET status='Posted', updated_at=now() WHERE id=$1`, [row.id]);
});

/* ---------- billing ---------- */
def('refunds', 'approve', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1 FOR UPDATE`, [row.invoice_id])).rows[0];
  if (Number(row.amount) > Number(inv.paid) + 0.005) throw bad(`Refund exceeds the amount paid (${Number(inv.paid).toFixed(2)})`);
  const session = (await client.query(`SELECT id FROM "billing"."cashier_sessions" WHERE user_id=$1 AND status='Open' AND is_deleted=false LIMIT 1`, [user.id])).rows[0];
  const code = await db.nextCode(client, 'RCP', 6);
  await client.query(
    `INSERT INTO "billing"."payments"("receipt_no","invoice_id","patient_id","kind","amount","method","reference","cashier_id","session_id","paid_at","created_by","updated_by")
     VALUES ($1,$2,$3,'Refund',$4,'Cash',$5,$6,$7,now(),$6,$6)`,
    [code, row.invoice_id, inv.patient_id, row.amount, row.refund_no, user.id, session ? session.id : null]);
  await client.query(`UPDATE "billing"."refunds" SET status='Approved', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
  await billing.refreshInvoice(client, row.invoice_id);
});
def('refunds', 'reject', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  await client.query(`UPDATE "billing"."refunds" SET status='Rejected', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
});

def('credit_notes', 'approve', async ({ client, row }) => {
  mustBe(row, 'Draft');
  const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1 FOR UPDATE`, [row.invoice_id])).rows[0];
  if (Number(row.amount) > Number(inv.net) + 0.005) throw bad('Credit note is larger than the invoice net amount');
  const net = round2(Number(inv.net) - Number(row.amount));
  const patient = round2(Math.max(0, Number(inv.patient_share) - Number(row.amount)));
  await client.query(
    `UPDATE "billing"."invoices" SET net=$1, patient_share=$2, payer_share=$3, discount = discount + $4, updated_at=now() WHERE id=$5`,
    [net, patient, round2(net - patient), row.amount, inv.id]);
  await client.query(`UPDATE "billing"."credit_notes" SET status='Approved', updated_at=now() WHERE id=$1`, [row.id]);
  await billing.refreshInvoice(client, inv.id);
});

def('discount_approvals', 'approve', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  const inv = (await client.query(`SELECT status FROM "billing"."invoices" WHERE id=$1`, [row.invoice_id])).rows[0];
  if (inv.status === 'Cancelled') throw conflict('Invoice is cancelled');
  await billing.reprice(client, row.invoice_id, { discountPct: Number(row.requested_pct) });
  await client.query(`UPDATE "billing"."discount_approvals" SET status='Approved', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
});
def('discount_approvals', 'reject', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  await client.query(`UPDATE "billing"."discount_approvals" SET status='Rejected', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
});

/* ---------- insurance / credit ---------- */
def('write_offs', 'approve', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1 FOR UPDATE`, [row.invoice_id])).rows[0];
  const open = round2(Number(inv.payer_share) - Number(inv.payer_paid));
  if (Number(row.amount) > open + 0.005) throw bad(`Write-off exceeds the open payer balance (${open.toFixed(2)})`);
  await client.query(`UPDATE "billing"."invoices" SET payer_paid = payer_paid + $1, updated_at=now() WHERE id=$2`, [row.amount, inv.id]);
  await client.query(`UPDATE "insurance"."write_offs" SET status='Approved', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
});
def('write_offs', 'reject', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  await client.query(`UPDATE "insurance"."write_offs" SET status='Rejected', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
});

def('remittances', 'post', async ({ client, row }) => {
  mustBe(row, 'Draft');
  const lines = (await client.query(`SELECT * FROM "insurance"."remittance_lines" WHERE remittance_id=$1 AND is_deleted=false`, [row.id])).rows;
  if (!lines.length) throw bad('Add the claim payment lines first');
  const sum = round2(lines.reduce((s, l) => s + Number(l.paid_amount), 0));
  if (Math.abs(sum - Number(row.amount)) > 0.01) throw bad(`Lines total ${sum.toFixed(2)} but remittance amount is ${Number(row.amount).toFixed(2)}`);
  for (const l of lines) {
    const c = (await client.query(`SELECT * FROM "insurance"."claims" WHERE id=$1 FOR UPDATE`, [l.claim_id])).rows[0];
    if (!c) throw notFound('Claim not found');
    if (c.payer_id !== row.payer_id) throw bad(`Claim ${c.claim_no} belongs to a different payer`);
    if (!['Submitted', 'Accepted', 'Partially Paid', 'Appealed'].includes(c.status)) throw conflict(`Claim ${c.claim_no} is ${c.status}; it cannot receive payment`);
    const paid = round2(Number(c.paid_amount) + Number(l.paid_amount));
    if (paid > Number(c.amount) + 0.005) throw bad(`Payment on ${c.claim_no} exceeds the claim amount`);
    const status = paid >= Number(c.amount) - 0.005 ? 'Paid' : 'Partially Paid';
    await client.query(`UPDATE "insurance"."claims" SET paid_amount=$1, status=$2, updated_at=now() WHERE id=$3`, [paid, status, c.id]);
    await client.query(`UPDATE "billing"."invoices" SET payer_paid = payer_paid + $1, updated_at=now() WHERE id=$2`, [l.paid_amount, c.invoice_id]);
  }
  await client.query(`UPDATE "insurance"."remittances" SET status='Posted', updated_at=now() WHERE id=$1`, [row.id]);
});

def('corporate_payments', 'apply', async ({ client, row }) => {
  if (row.applied) throw conflict('Already applied');
  const invs = (await client.query(
    `SELECT id, payer_share, payer_paid FROM "billing"."invoices"
      WHERE corporate_id=$1 AND payer_type='Corporate' AND status <> 'Cancelled' AND is_deleted=false AND payer_share - payer_paid > 0.005
      ORDER BY invoice_date, id FOR UPDATE`, [row.corporate_id])).rows;
  let left = Number(row.amount);
  let used = 0;
  for (const i of invs) {
    if (left <= 0.005) break;
    const take = Math.min(left, Number(i.payer_share) - Number(i.payer_paid));
    await client.query(`UPDATE "billing"."invoices" SET payer_paid = payer_paid + $1, updated_at=now() WHERE id=$2`, [round2(take), i.id]);
    left = round2(left - take);
    used += 1;
  }
  await client.query(`UPDATE "insurance"."corporate_payments" SET applied=true, updated_at=now() WHERE id=$1`, [row.id]);
  return { message: `Applied to ${used} invoice(s)` + (left > 0.005 ? `; unallocated advance ${left.toFixed(2)}` : '') };
});

/* ---------- finance ---------- */
def('journals', 'post', async ({ client, row }) => {
  mustBe(row, 'Draft');
  const t = (await client.query(
    `SELECT COUNT(*)::int n, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM "finance"."journal_lines" WHERE journal_id=$1 AND is_deleted=false`, [row.id])).rows[0];
  if (t.n < 2) throw bad('A voucher needs at least two lines');
  if (Math.abs(Number(t.d) - Number(t.c)) > 0.005) throw bad(`Debits (${Number(t.d).toFixed(2)}) and credits (${Number(t.c).toFixed(2)}) must be equal`);
  if (!(Number(t.d) > 0)) throw bad('Voucher total cannot be zero');
  await client.query(`UPDATE "finance"."journals" SET status='Posted', updated_at=now() WHERE id=$1`, [row.id]);
});

/* ---------- hr ---------- */
def('leaves', 'approve', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  await client.query(`UPDATE "hr"."leaves" SET status='Approved', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
});
def('leaves', 'reject', async ({ client, user, row }) => {
  mustBe(row, 'Requested');
  await client.query(`UPDATE "hr"."leaves" SET status='Rejected', approved_by=$1, updated_at=now() WHERE id=$2`, [user.id, row.id]);
});

async function runTotal(client, runId) {
  await client.query(
    `UPDATE "hr"."payroll_runs" SET total=(SELECT COALESCE(SUM(net),0) FROM "hr"."payslips" WHERE run_id=$1 AND is_deleted=false), updated_at=now() WHERE id=$1`, [runId]);
}
def('payroll_runs', 'generate', async ({ client, user, row }) => {
  mustBe(row, 'Draft');
  await client.query(`DELETE FROM "hr"."payslips" WHERE run_id=$1`, [row.id]);
  const emps = (await client.query(`SELECT * FROM "hr"."employees" WHERE status='Active' AND is_deleted=false`)).rows;
  if (!emps.length) throw bad('No active employees');
  for (const e of emps) {
    const basic = Number(e.basic_salary || 0);
    const allowance = Number(e.allowance || 0);
    await client.query(
      `INSERT INTO "hr"."payslips"("run_id","employee_id","basic","allowance","deductions","net","created_by","updated_by") VALUES ($1,$2,$3,$4,0,$5,$6,$6)`,
      [row.id, e.id, basic, allowance, round2(basic + allowance), user.id]);
  }
  await runTotal(client, row.id);
  return { message: `Generated ${emps.length} payslip(s). Edit deductions where needed, then approve.` };
});
def('payroll_runs', 'approve', async ({ client, row }) => {
  mustBe(row, 'Draft');
  await runTotal(client, row.id);
  const n = (await client.query(`SELECT count(*)::int n FROM "hr"."payslips" WHERE run_id=$1 AND is_deleted=false`, [row.id])).rows[0].n;
  if (!n) throw bad('Generate payslips first');
  await client.query(`UPDATE "hr"."payroll_runs" SET status='Approved', updated_at=now() WHERE id=$1`, [row.id]);
});
def('payroll_runs', 'markpaid', async ({ client, row }) => {
  mustBe(row, 'Approved');
  await client.query(`UPDATE "hr"."payroll_runs" SET status='Paid', updated_at=now() WHERE id=$1`, [row.id]);
});

module.exports = { get, map, moveStock, findOrCreateBatch };
