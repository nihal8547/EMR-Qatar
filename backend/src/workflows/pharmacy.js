'use strict';
/** Pharmacy: dispensing queue, FEFO dispensing, controlled drug register, OTC POS, stock view */
const express = require('express');
const db = require('../db');
const actions = require('../actions');
const { allergyMatches, wrap, bad, notFound, conflict, forbidden, need, can, audit, getVisit, addCharge, round2, HttpError } = require('../lib');
const billing = require('../billingCore');

const router = express.Router();

async function pharmacyStore(client) {
  const s = (await client.query(`SELECT id FROM "inventory"."stores" WHERE type='Pharmacy' AND active AND is_deleted=false ORDER BY id LIMIT 1`)).rows[0];
  if (!s) throw conflict('No active Pharmacy store is configured (Inventory > Stores)');
  return s.id;
}

/** Batches usable for sale: not expired, qty>0, earliest expiry first. */
async function availableBatches(client, storeId, drugId) {
  return (await client.query(
    `SELECT id, batch_no, expiry_date, qty_on_hand FROM "inventory"."stock_batches"
      WHERE store_id=$1 AND drug_id=$2 AND qty_on_hand > 0 AND is_deleted=false AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
      ORDER BY expiry_date NULLS LAST, id FOR UPDATE`, [storeId, drugId])).rows;
}


/** Payer details + checks that must pass before medicines are handed over. */
async function payerContext(client, visitId) {
  const v = (await client.query(
    `SELECT v.id, v.payer_type, v.eligibility_status, v.policy_id, v.corporate_id,
            pm.policy_no, pm.member_id, pm.valid_from, pm.valid_to, pm.status AS policy_status, pm.plan_id,
            py.name AS payer_name, pl.name AS plan_name, pl.copay_pct, pl.copay_max, pl.annual_limit,
            ca.name AS corporate_name, ca.credit_limit, ca.active AS corporate_active
       FROM "scheduling"."visits" v LEFT JOIN "insurance"."policy_members" pm ON pm.id=v.policy_id LEFT JOIN "insurance"."payers" py ON py.id=pm.payer_id
       LEFT JOIN "insurance"."plans" pl ON pl.id=pm.plan_id LEFT JOIN "insurance"."corporate_accounts" ca ON ca.id=v.corporate_id
      WHERE v.id=$1`, [visitId])).rows[0];
  const ph = (await client.query(`SELECT covered FROM "billing"."services" WHERE code='PHARM' AND is_deleted=false`)).rows[0];
  const covered = ph ? !!ph.covered : true;
  const blockers = []; const warnings = [];
  const today = new Date().toISOString().slice(0, 10);
  const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : null);
  if (v.payer_type === 'Insurance') {
    if (!v.policy_id) blockers.push('Insurance visit has no policy selected');
    else {
      if (v.policy_status !== 'Active') blockers.push(`Policy ${v.policy_no} is ${v.policy_status}`);
      if (d(v.valid_to) && d(v.valid_to) < today) blockers.push(`Policy ${v.policy_no} expired on ${d(v.valid_to)}`);
      if (d(v.valid_from) && d(v.valid_from) > today) blockers.push(`Policy ${v.policy_no} starts on ${d(v.valid_from)}`);
    }
    if (v.eligibility_status === 'Not eligible') blockers.push('Eligibility check says the patient is NOT eligible');
    else if (v.eligibility_status === 'Not checked') warnings.push('Eligibility has not been checked for this visit');
    if (!covered) warnings.push('Medicines are not covered by insurance - patient pays 100%');
  } else if (v.payer_type === 'Corporate') {
    if (!v.corporate_id) blockers.push('Corporate visit has no company selected');
    else if (v.corporate_active === false) blockers.push(`${v.corporate_name} account is inactive`);
  }
  return { visit: v, covered, blockers, warnings };
}

/** Patient / payer split of the medicines about to be dispensed (added on top of the visit's existing bill). */
async function estimateFor(client, rx, lines, ctx) {
  let gross = 0;
  for (const line of lines) {
    const pi = (await client.query(`SELECT d.price FROM "clinical"."prescription_items" i JOIN "pharmacy"."drugs" d ON d.id=i.drug_id WHERE i.id=$1 AND i.prescription_id=$2`, [line.prescription_item_id, rx.id])).rows[0];
    if (pi) gross += Number(pi.price) * Number(line.qty || 0);
  }
  const v = ctx.visit;
  const plan = v.payer_type === 'Insurance' && v.plan_id ? { copay_pct: v.copay_pct, copay_max: v.copay_max } : null;
  const inv = (await client.query(`SELECT discount, gross FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [rx.visit_id])).rows[0];
  const pct = inv && Number(inv.gross) > 0 ? (Number(inv.discount) / Number(inv.gross)) * 100 : 0;
  const split = billing.computeSplit({ charges: [{ amount: round2(gross), covered: ctx.covered }], payer_type: v.payer_type, plan, discountPct: pct });
  return split;
}

router.post('/pharmacy/estimate', need('pharmacy.dispense'), wrap(async (req, res) => {
  const rx = (await db.query(`SELECT * FROM "clinical"."prescriptions" WHERE id=$1 AND is_deleted=false`, [Number(req.body.prescription_id)])).rows[0];
  if (!rx) throw notFound('Prescription not found');
  const ctx = await payerContext(db, rx.visit_id);
  const split = await estimateFor(db, rx, (req.body.items || []).filter((l) => Number(l.qty) > 0), ctx);
  res.json({ ...split, blockers: ctx.blockers, warnings: ctx.warnings });
}));

router.get('/pharmacy/queue', need('pharmacy.dispense'), wrap(async (req, res) => {
  const store = (await db.query(`SELECT id FROM "inventory"."stores" WHERE type='Pharmacy' AND active AND is_deleted=false ORDER BY id LIMIT 1`)).rows[0];
  const { rows } = await db.query(
    `SELECT r.id, r.rx_no, r.status, r.created_at, r.visit_id, r.patient_id, p.mrn, p.full_name, p.gender, p.dob, d.full_name AS doctor, v.payer_type,
            (SELECT COALESCE(json_agg(json_build_object('id',i.id,'drug_id',dr.id,'drug',dr.generic_name || ' ' || COALESCE(dr.strength,'') || COALESCE(' (' || dr.brand_name || ')',''),
                'schedule',dr.schedule,'dose',i.dose,'frequency',i.frequency,'days',i.duration_days,'qty',i.qty,'dispensed',i.dispensed_qty,'price',dr.price,
                'stock',(SELECT COALESCE(SUM(b.qty_on_hand),0) FROM "inventory"."stock_batches" b WHERE b.drug_id=dr.id AND b.store_id=$1 AND b.is_deleted=false AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE))
              ) ORDER BY i.id),'[]'::json)
               FROM "clinical"."prescription_items" i JOIN "pharmacy"."drugs" dr ON dr.id=i.drug_id WHERE i.prescription_id=r.id AND i.is_deleted=false) AS items,
            (SELECT COALESCE(json_agg(a.allergen || COALESCE(' (' || a.severity || ')','')),'[]'::json) FROM "mpi"."patient_allergies" a WHERE a.patient_id=r.patient_id AND a.is_deleted=false) AS allergies
       FROM "clinical"."prescriptions" r JOIN "mpi"."patients" p ON p.id=r.patient_id LEFT JOIN "auth"."users" d ON d.id=r.doctor_id JOIN "scheduling"."visits" v ON v.id=r.visit_id
      WHERE r.is_deleted=false AND r.status IN ('Pending','Partially Dispensed') ORDER BY r.created_at LIMIT 100`, [store ? store.id : 0]);
  for (const r of rows) {
    const c = await payerContext(db, r.visit_id);
    const v = c.visit;
    r.payer = { type: v.payer_type, payer_name: v.payer_name, plan_name: v.plan_name, copay_pct: v.copay_pct, copay_max: v.copay_max, policy_no: v.policy_no, member_id: v.member_id, valid_to: v.valid_to, policy_status: v.policy_status,
      eligibility: v.eligibility_status, corporate_name: v.corporate_name, covered: c.covered, blockers: c.blockers, warnings: c.warnings };
  }
  res.json(rows);
}));

router.post('/pharmacy/dispense', need('pharmacy.dispense'), wrap(async (req, res) => {
  const { prescription_id, items = [], witness, override_allergy, payment, pay_later } = req.body;
  if (!items.length) throw bad('Select the medicines to dispense');
  const out = await db.tx(async (client) => {
    const rx = (await client.query(`SELECT * FROM "clinical"."prescriptions" WHERE id=$1 AND is_deleted=false FOR UPDATE`, [prescription_id])).rows[0];
    if (!rx) throw notFound('Prescription not found');
    if (!['Pending', 'Partially Dispensed'].includes(rx.status)) throw conflict(`Prescription is ${rx.status}`);
    const visit = await getVisit(client, rx.visit_id);
    const ctx = await payerContext(client, rx.visit_id);
    if (ctx.blockers.length) throw new HttpError(409, `PAYER CHECK FAILED: ${ctx.blockers.join('; ')}. Fix the payer details (or switch the visit to cash) before dispensing.`, { payer_blocked: true, blockers: ctx.blockers });
    if (pay_later && !can(req, 'pharmacy.dispense_credit')) throw forbidden('Your role cannot dispense without taking payment');
    const store = await pharmacyStore(client);
    const phSvc = (await client.query(`SELECT id FROM "billing"."services" WHERE code='PHARM' AND is_deleted=false`)).rows[0];
    if (!phSvc) throw conflict('Create a billing service with code PHARM (category Pharmacy) to charge dispensed medicines');

    const allergies = (await client.query(`SELECT allergen FROM "mpi"."patient_allergies" WHERE patient_id=$1 AND is_deleted=false`, [rx.patient_id])).rows.map((a) => a.allergen);
    const dispNo = await db.nextCode(client, 'DSP', 6);
    const dispId = (await client.query(
      `INSERT INTO "pharmacy"."pharmacy_dispenses"("dispense_no","visit_id","prescription_id","patient_id","status","dispensed_by","dispensed_at","total","created_by","updated_by")
       VALUES ($1,$2,$3,$4,'Partial',$5,now(),0,$5,$5) RETURNING id`, [dispNo, rx.visit_id, rx.id, rx.patient_id, req.user.id])).rows[0].id;
    let total = 0;
    const chargeIds = [];
    for (const line of items) {
      const qty = Number(line.qty);
      if (!(qty > 0) || !Number.isInteger(qty)) throw bad('Dispense quantity must be a whole number above zero');
      const pi = (await client.query(
        `SELECT i.*, d.generic_name, d.brand_name, d.strength, d.schedule, d.price FROM "clinical"."prescription_items" i JOIN "pharmacy"."drugs" d ON d.id=i.drug_id
          WHERE i.id=$1 AND i.prescription_id=$2 AND i.is_deleted=false FOR UPDATE`, [line.prescription_item_id, rx.id])).rows[0];
      if (!pi) throw bad('Prescription line not found');
      if (qty > pi.qty - pi.dispensed_qty) throw bad(`${pi.generic_name}: only ${pi.qty - pi.dispensed_qty} left to dispense`);
      if (allergies.some((a) => allergyMatches(a, pi.generic_name, pi.brand_name)) && !override_allergy) {
        throw new (require('../lib').HttpError)(409, `ALLERGY: patient has a recorded allergy matching ${pi.generic_name}. Confirm with the doctor and tick override.`, { allergy: true });
      }
      if (pi.schedule === 'Narcotic' && !String(witness || '').trim()) throw bad('Narcotic drugs need a witness name');
      let need = qty;
      const batches = await availableBatches(client, store, pi.drug_id);
      const have = batches.reduce((s, b) => s + b.qty_on_hand, 0);
      if (have < qty) throw conflict(`${pi.generic_name}: only ${have} in stock (expired batches excluded)`);
      for (const b of batches) {
        if (need <= 0) break;
        const take = Math.min(need, b.qty_on_hand);
        need -= take;
        const diId = (await client.query(
          `INSERT INTO "pharmacy"."dispense_items"("dispense_id","drug_id","batch_id","qty","unit_price","created_by","updated_by") VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
          [dispId, pi.drug_id, b.id, take, pi.price, req.user.id])).rows[0].id;
        await actions.moveStock(client, req.user, { batch_id: b.id, qty: -take, movement: 'Dispense', ref_no: dispNo });
        if (pi.schedule !== 'Normal') {
          const bal = (await client.query(`SELECT COALESCE(SUM(qty_on_hand),0)::int n FROM "inventory"."stock_batches" WHERE drug_id=$1 AND store_id=$2 AND is_deleted=false`, [pi.drug_id, store])).rows[0].n;
          await client.query(
            `INSERT INTO "pharmacy"."controlled_register"("drug_id","batch_id","movement","qty","balance","patient_id","prescription_id","performed_by","witness","entry_at","created_by","updated_by")
             VALUES ($1,$2,'Out',$3,$4,$5,$6,$7,$8,now(),$7,$7)`, [pi.drug_id, b.id, take, bal, rx.patient_id, rx.id, req.user.id, witness || null]);
        }
      }
      const amount = round2(qty * Number(pi.price));
      total += amount;
      const ch = await addCharge(client, {
        visit, service_id: phSvc.id, qty, unit_price: pi.price, source: 'Pharmacy', source_id: pi.id, user: req.user,
        description: `${pi.generic_name} ${pi.strength || ''}`.trim(),
      });
      chargeIds.push(ch.id);
      await client.query(`UPDATE "clinical"."prescription_items" SET dispensed_qty = dispensed_qty + $1, updated_at=now() WHERE id=$2`, [qty, pi.id]);
    }
    const left = (await client.query(`SELECT COUNT(*) FILTER (WHERE dispensed_qty < qty)::int open, COUNT(*) FILTER (WHERE dispensed_qty > 0)::int any FROM "clinical"."prescription_items" WHERE prescription_id=$1 AND is_deleted=false`, [rx.id])).rows[0];
    const status = left.open === 0 ? 'Dispensed' : 'Partially Dispensed';
    await client.query(`UPDATE "clinical"."prescriptions" SET status=$1, updated_at=now() WHERE id=$2`, [status, rx.id]);
    await client.query(`UPDATE "pharmacy"."pharmacy_dispenses" SET total=$1, status=$2, updated_at=now() WHERE id=$3`, [round2(total), left.open === 0 ? 'Complete' : 'Partial', dispId]);
    // payment collection: bill only these medicines and take the patient's share before the stock leaves
    let paid = null;
    if (!pay_later) {
      const before = (await client.query(`SELECT id, patient_share FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [rx.visit_id])).rows[0];
      const invId = await billing.createOrRefreshInvoice(client, req.user, rx.visit_id, { only_charge_ids: chargeIds });
      const inv = (await client.query(`SELECT * FROM "billing"."invoices" WHERE id=$1`, [invId])).rows[0];
      const due = Math.min(round2(Number(inv.patient_share) - (before ? Number(before.patient_share) : 0)), Number(inv.balance));
      if (due > 0.005) {
        if (!payment || !payment.method) throw new HttpError(409, `PAYMENT REQUIRED: patient pays ${due.toFixed(2)} QAR before the medicines are handed over.`, { payment_required: true, due });
        const r = await billing.payInvoice(client, req.user, invId, { amount: due, method: payment.method, reference: payment.reference });
        await audit(client, req.user, 'PAYMENT', 'payments', r.payment_id, { amount: due, method: payment.method, source: 'pharmacy' }, req.ip);
        paid = { amount: due, receipt_no: r.receipt_no, invoice_id: invId };
      } else paid = { amount: 0, receipt_no: null, invoice_id: invId };
    }
    if (status === 'Dispensed') {
      await client.query(`UPDATE "scheduling"."visits" SET status='Billing', updated_at=now() WHERE id=$1 AND status IN ('Pharmacy','With Doctor','Diagnostics')`, [rx.visit_id]);
    }
    await audit(client, req.user, 'DISPENSE', 'pharmacy_dispenses', dispId, { rx: rx.rx_no, total }, req.ip);
    if (status === 'Dispensed') await billing.settleVisit(client, rx.visit_id);
    return { dispense_id: dispId, dispense_no: dispNo, total: round2(total), prescription_status: status, payment: paid, pay_later: !!pay_later };
  });
  res.json(out);
}));

/** Printable dispense slip + medicine labels. */
router.get('/pharmacy/dispenses/:id/print', need('pharmacy.dispense'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw notFound('Dispense not found');
  const d = (await db.query(
    `SELECT x.id, x.dispense_no, x.dispensed_at, x.total, x.status, x.prescription_id, x.visit_id, p.mrn, p.full_name, p.dob, p.gender, p.phone, u.full_name AS dispensed_by, r.rx_no, doc.full_name AS doctor, v.visit_no, v.payer_type
       FROM "pharmacy"."pharmacy_dispenses" x JOIN "mpi"."patients" p ON p.id=x.patient_id LEFT JOIN "auth"."users" u ON u.id=x.dispensed_by
       LEFT JOIN "clinical"."prescriptions" r ON r.id=x.prescription_id LEFT JOIN "auth"."users" doc ON doc.id=r.doctor_id LEFT JOIN "scheduling"."visits" v ON v.id=x.visit_id
      WHERE x.id=$1 AND x.is_deleted=false`, [id])).rows[0];
  if (!d) throw notFound('Dispense not found');
  const items = (await db.query(
    `SELECT dr.generic_name, dr.brand_name, dr.strength, dr.form, di.qty, di.unit_price, b.batch_no, b.expiry_date,
            pi.dose, pi.frequency, pi.route, pi.duration_days, pi.instructions
       FROM "pharmacy"."dispense_items" di JOIN "pharmacy"."drugs" dr ON dr.id=di.drug_id LEFT JOIN "inventory"."stock_batches" b ON b.id=di.batch_id
       LEFT JOIN "clinical"."prescription_items" pi ON pi.prescription_id=$2 AND pi.drug_id=di.drug_id AND pi.is_deleted=false
      WHERE di.dispense_id=$1 AND di.is_deleted=false ORDER BY di.id`, [id, d.prescription_id])).rows;
  const pay = (await db.query(
    `SELECT receipt_no, amount, method, paid_at FROM "billing"."payments" WHERE invoice_id IN (SELECT id FROM "billing"."invoices" WHERE visit_id=$1 AND is_deleted=false) AND kind='Payment' AND is_deleted=false ORDER BY id DESC LIMIT 3`, [d.visit_id])).rows;
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  await audit(null, req.user, 'DISPENSE_PRINT', 'pharmacy_dispenses', id, null, req.ip);
  res.json({ dispense: d, items, payments: pay, centre: Object.fromEntries(s.map((r) => [r.key, r.value])) });
}));

router.get('/pharmacy/drugs/search', need('pharmacy.pos'), wrap(async (req, res) => {
  const store = (await db.query(`SELECT id FROM "inventory"."stores" WHERE type='Pharmacy' AND active AND is_deleted=false ORDER BY id LIMIT 1`)).rows[0];
  const { rows } = await db.query(
    `SELECT d.id, d.generic_name, d.brand_name, d.strength, d.form, d.price, d.schedule, d.requires_prescription,
            COALESCE((SELECT SUM(b.qty_on_hand) FROM "inventory"."stock_batches" b WHERE b.drug_id=d.id AND b.store_id=$2 AND b.is_deleted=false AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)),0)::int AS stock
       FROM "pharmacy"."drugs" d WHERE d.active AND d.is_deleted=false AND (d.generic_name ILIKE $1 OR d.brand_name ILIKE $1 OR d.code ILIKE $1) ORDER BY d.generic_name LIMIT 20`,
    [`%${req.query.q || ''}%`, store ? store.id : 0]);
  res.json(rows);
}));

router.post('/pharmacy/otc', need('pharmacy.pos'), wrap(async (req, res) => {
  const { items = [], customer_name, patient_id, payment_method } = req.body;
  if (!items.length) throw bad('Add at least one item');
  if (!['Cash', 'Card', 'Bank transfer'].includes(payment_method)) throw bad('Choose a payment method');
  const out = await db.tx(async (client) => {
    const store = await pharmacyStore(client);
    const no = await db.nextCode(client, 'OTC', 6);
    const sid = (await client.query(
      `INSERT INTO "pharmacy"."otc_sales"("receipt_no","customer_name","patient_id","total","payment_method","sold_by","sold_at","created_by","updated_by")
       VALUES ($1,$2,$3,0,$4,$5,now(),$5,$5) RETURNING id`, [no, customer_name || 'Walk-in', patient_id || null, payment_method, req.user.id])).rows[0].id;
    let total = 0;
    for (const line of items) {
      const qty = Number(line.qty);
      if (!(qty > 0) || !Number.isInteger(qty)) throw bad('Quantity must be a whole number above zero');
      const d = (await client.query(`SELECT * FROM "pharmacy"."drugs" WHERE id=$1 AND active AND is_deleted=false`, [line.drug_id])).rows[0];
      if (!d) throw bad('Drug not found');
      if (d.schedule !== 'Normal') throw conflict(`${d.generic_name} is a ${d.schedule} drug and needs a prescription (use dispensing queue)`);
      if (d.requires_prescription) throw conflict(`${d.generic_name} is prescription-only; it cannot be sold over the counter`);
      let need = qty;
      const batches = await availableBatches(client, store, d.id);
      const have = batches.reduce((s, b) => s + b.qty_on_hand, 0);
      if (have < qty) throw conflict(`${d.generic_name}: only ${have} in stock`);
      for (const b of batches) {
        if (need <= 0) break;
        const take = Math.min(need, b.qty_on_hand);
        need -= take;
        const amt = round2(take * Number(d.price));
        total += amt;
        await client.query(
          `INSERT INTO "pharmacy"."otc_sale_items"("sale_id","drug_id","batch_id","qty","unit_price","amount","created_by","updated_by") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [sid, d.id, b.id, take, d.price, amt, req.user.id]);
        await actions.moveStock(client, req.user, { batch_id: b.id, qty: -take, movement: 'OTC sale', ref_no: no });
      }
    }
    await client.query(`UPDATE "pharmacy"."otc_sales" SET total=$1 WHERE id=$2`, [round2(total), sid]);
    await audit(client, req.user, 'OTC_SALE', 'otc_sales', sid, { total }, req.ip);
    return { id: sid, receipt_no: no, total: round2(total) };
  });
  res.json(out);
}));

router.get('/pharmacy/stock', need('pharmacy.stock'), wrap(async (req, res) => {
  const filter = req.query.filter || '';
  const { rows } = await db.query(
    `SELECT d.id, d.code, d.generic_name, d.brand_name, d.strength, d.form, d.schedule, d.reorder_level,
            COALESCE(SUM(b.qty_on_hand) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE),0)::int AS in_stock,
            COALESCE(SUM(b.qty_on_hand) FILTER (WHERE b.expiry_date < CURRENT_DATE),0)::int AS expired_qty,
            MIN(b.expiry_date) FILTER (WHERE b.qty_on_hand > 0 AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)) AS next_expiry,
            COALESCE(json_agg(json_build_object('batch',b.batch_no,'expiry',b.expiry_date,'qty',b.qty_on_hand,'store',s.name) ORDER BY b.expiry_date) FILTER (WHERE b.id IS NOT NULL AND b.qty_on_hand > 0),'[]'::json) AS batches
       FROM "pharmacy"."drugs" d
       LEFT JOIN "inventory"."stock_batches" b ON b.drug_id=d.id AND b.is_deleted=false
       LEFT JOIN "inventory"."stores" s ON s.id=b.store_id
      WHERE d.is_deleted=false AND d.active AND ($1 = '' OR d.generic_name ILIKE $2 OR d.brand_name ILIKE $2)
      GROUP BY d.id ORDER BY d.generic_name`, [req.query.q || '', `%${req.query.q || ''}%`]);
  const today = new Date(); const in90 = new Date(today.getTime() + 90 * 864e5).toISOString().slice(0, 10);
  const out = rows.map((r) => ({
    ...r, low: r.in_stock <= r.reorder_level, expiring: !!r.next_expiry && r.next_expiry <= in90, has_expired: r.expired_qty > 0,
  }));
  res.json(filter === 'low' ? out.filter((r) => r.low) : filter === 'expiring' ? out.filter((r) => r.expiring) : filter === 'expired' ? out.filter((r) => r.has_expired) : out);
}));

module.exports = router;
