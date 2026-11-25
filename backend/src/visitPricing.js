'use strict';
/** Check-in pricing: which consultation service applies, what it costs for this payer, and how a discount is authorised. */
const { bad, round2, priceFor } = require('./lib');
const billing = require('./billingCore');

async function pickConsultService(client, visitType, departmentId) {
  let svc = null;
  if (visitType === 'Follow-up') svc = (await client.query(`SELECT id FROM "billing"."services" WHERE code='CONS-FU' AND active AND is_deleted=false`)).rows[0];
  if (!svc) {
    svc = (await client.query(
      `SELECT id FROM "billing"."services" WHERE category='Consultation' AND active AND is_deleted=false AND code <> 'CONS-FU'
        ORDER BY (department_id IS NOT DISTINCT FROM $1::bigint) DESC, id LIMIT 1`, [departmentId || null])).rows[0];
  }
  return svc || null;
}

/** Validate a discount request {type: percent|amount, value, reason}. Returns null when none was asked. */
function parseDiscount(d) {
  if (!d || d.value === undefined || d.value === null || d.value === '') return null;
  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const type = d.type === 'amount' ? 'amount' : 'percent';
  if (type === 'percent' && value > 100) throw bad('Discount % must be between 0 and 100');
  if (type === 'amount' && value > 1000000) throw bad('Discount amount is too large');
  return { type, value: round2(value), reason: d.reason ? String(d.reason).trim().slice(0, 200) : '' };
}

/** Equivalent percentage of a discount against a known gross amount. */
const pctOf = (disc, gross) => (!disc ? 0 : disc.type === 'percent' ? disc.value : gross > 0 ? Math.min(100, round2((disc.value / gross) * 100)) : 0);

/** Can this user give the discount straight away, or does a manager have to approve it? */
function authority(user, pct) {
  if (user.perms.has('billing.approve_discount')) return { mode: 'direct', limit: 100 };
  if (user.perms.has('billing.discount')) return { mode: pct <= user.discount_limit + 1e-9 ? 'direct' : 'approval', limit: user.discount_limit };
  return { mode: 'approval', limit: 0 };
}

async function estimate(client, user, { doctor, visit_type, payer_type, policy, corporate, discount }) {
  const warnings = [];
  const dept = doctor ? doctor.department_id : null;
  const svc = await pickConsultService(client, visit_type, dept);
  if (!svc) return { service: null, warnings: ['No consultation service is configured in the price list.'] };
  const visitLike = { payer_type, policy_id: policy ? policy.id : null, policy_payer_id: policy ? policy.payer_id : null, corporate_id: corporate ? corporate.id : null };
  const { price, service } = await priceFor(client, svc.id, visitLike);
  const cash = Number(service.price);
  let plan = null;
  if (payer_type === 'Insurance' && policy && policy.plan_id) plan = (await client.query(`SELECT * FROM "insurance"."plans" WHERE id=$1`, [policy.plan_id])).rows[0] || null;
  const pct = pctOf(discount, price);
  const split = billing.computeSplit({ charges: [{ amount: price, covered: service.covered }], payer_type, plan, discountPct: pct });
  if (payer_type === 'Insurance' && !service.covered) warnings.push('This consultation is not covered by insurance; the patient pays in full.');
  if (service.needs_preauth && payer_type === 'Insurance') warnings.push('Needs pre-authorisation from the insurer.');
  return {
    service: { id: service.id, code: service.code, name: service.name }, cash_price: cash, price: round2(price),
    price_basis: round2(price) === round2(cash) ? 'Standard price' : (payer_type === 'Corporate' ? 'Corporate price list' : 'Insurer price list'),
    covered: service.covered, needs_preauth: service.needs_preauth,
    plan: plan ? { name: plan.name, copay_pct: Number(plan.copay_pct), copay_max: Number(plan.copay_max || 0), annual_limit: plan.annual_limit == null ? null : Number(plan.annual_limit) } : null,
    discount: discount ? { ...discount, pct, authority: authority(user, pct) } : null,
    gross: split.gross, discount_amount: split.discount, net: split.net, patient_share: split.patient_share, payer_share: split.payer_share, warnings,
  };
}

module.exports = { pickConsultService, parseDiscount, pctOf, authority, estimate };
