'use strict';
const db = require('./db');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
const bad = (m, extra) => new HttpError(400, m, extra);
const forbidden = (m = 'You do not have permission for this action') => new HttpError(403, m);
const notFound = (m = 'Not found') => new HttpError(404, m);
const conflict = (m) => new HttpError(409, m);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function can(req, perm) {
  return req.user && req.user.perms.has(perm);
}
const need = (perm) => (req, res, next) => {
  if (!can(req, perm)) return next(forbidden(`Missing permission: ${perm}`));
  next();
};

async function audit(client, user, action, resource, recordId, details, ip) {
  try {
    await (client || db).query(
      `INSERT INTO "admin"."audit_log"("username","action","resource","record_id","ip","details","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [user ? user.username : 'system', action, resource, recordId == null ? null : String(recordId), ip || null,
        details ? JSON.stringify(details) : null, user ? user.id : null],
    );
  } catch (e) {
    console.error('audit failed', e.message);
  }
}

/* ---------- Pricing & charges ---------- */
async function getVisit(client, visitId) {
  const { rows } = await client.query(
    `SELECT v.*, pm."payer_id" AS policy_payer_id, pm."plan_id" AS policy_plan_id
       FROM "scheduling"."visits" v
       LEFT JOIN "insurance"."policy_members" pm ON pm.id = v.policy_id
      WHERE v.id = $1 AND v.is_deleted = false`, [visitId]);
  if (!rows.length) throw notFound('Visit not found');
  return rows[0];
}

/** Resolve selling price of a service for this visit (payer / corporate price list aware). */
async function priceFor(client, serviceId, visit) {
  const { rows } = await client.query(`SELECT * FROM "billing"."services" WHERE id=$1 AND is_deleted=false`, [serviceId]);
  if (!rows.length) throw bad('Service not found');
  const svc = rows[0];
  let price = Number(svc.price);
  let listQuery = null;
  if (visit && visit.payer_type === 'Insurance' && visit.policy_payer_id) {
    listQuery = [`SELECT * FROM "billing"."price_lists" WHERE payer_id=$1 AND active AND is_deleted=false ORDER BY id LIMIT 1`, [visit.policy_payer_id]];
  } else if (visit && visit.payer_type === 'Corporate' && visit.corporate_id) {
    listQuery = [`SELECT * FROM "billing"."price_lists" WHERE corporate_id=$1 AND active AND is_deleted=false ORDER BY id LIMIT 1`, [visit.corporate_id]];
  }
  if (listQuery) {
    const pl = (await client.query(listQuery[0], listQuery[1])).rows[0];
    if (pl) {
      const sp = (await client.query(
        `SELECT price FROM "billing"."price_list_items" WHERE price_list_id=$1 AND service_id=$2 AND is_deleted=false LIMIT 1`, [pl.id, serviceId])).rows[0];
      price = sp ? Number(sp.price) : price * (1 - Number(pl.discount_pct || 0) / 100);
    }
  }
  return { price: round2(price), service: svc };
}

/**
 * Post a charge to the visit bill. If the service needs pre-authorisation and the visit is
 * an insurance visit, a pre-auth request is raised automatically (once per visit + service).
 */
async function addCharge(client, { visit, service_id, qty = 1, source = 'Manual', source_id = null, description, unit_price, user }) {
  const { price, service } = await priceFor(client, service_id, visit);
  const unit = unit_price !== undefined && unit_price !== null ? round2(unit_price) : price;
  const amount = round2(unit * qty);
  const { rows } = await client.query(
    `INSERT INTO "billing"."charges"("visit_id","patient_id","service_id","description","qty","unit_price","amount","source","source_id","status","created_by","updated_by")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending',$10,$10) RETURNING *`,
    [visit.id, visit.patient_id, service_id, description || service.name, qty, unit, amount, source, source_id, user ? user.id : null]);
  if (service.needs_preauth && visit.payer_type === 'Insurance' && visit.policy_id) {
    const ex = await client.query(
      `SELECT 1 FROM "insurance"."pre_auths" WHERE visit_id=$1 AND service_id=$2 AND is_deleted=false AND status IN ('Requested','Approved','Partially Approved') LIMIT 1`,
      [visit.id, service_id]);
    if (!ex.rows.length) {
      const code = await db.nextCode(client, 'PA', 6);
      await client.query(
        `INSERT INTO "insurance"."pre_auths"("auth_no","visit_id","patient_id","policy_id","service_id","amount","status","requested_by","requested_at","created_by","updated_by")
         VALUES ($1,$2,$3,$4,$5,$6,'Requested',$7,now(),$7,$7)`,
        [code, visit.id, visit.patient_id, visit.policy_id, service_id, amount, user ? user.id : null]);
    }
  }
  return rows[0];
}

/** Cancel not-yet-invoiced charges that came from a given source record. */
async function cancelCharges(client, source, source_id) {
  await client.query(
    `UPDATE "billing"."charges" SET status='Cancelled', updated_at=now() WHERE source=$1 AND source_id=$2 AND status='Pending'`, [source, source_id]);
}


/** Drug classes for allergy matching. A recorded allergy to a class (or a drug) matches any drug in it. Basic aid only; not a substitute for clinical judgement. */
const ALLERGY_CLASSES = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'flucloxacillin', 'piperacillin', 'co-amoxiclav', 'amoxicillin/clavulanate', 'cloxacillin'],
  cephalosporin: ['cephalexin', 'cefuroxime', 'ceftriaxone', 'cefixime', 'cefazolin', 'cefadroxil', 'cefotaxime'],
  sulfa: ['sulfa', 'sulfamethoxazole', 'co-trimoxazole', 'trimethoprim/sulfamethoxazole', 'sulfasalazine'],
  nsaid: ['nsaid', 'ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'ketorolac', 'mefenamic acid', 'indomethacin'],
  opioid: ['opioid', 'morphine', 'codeine', 'tramadol', 'fentanyl', 'oxycodone'],
};
function allergyMatches(allergen, genericName, brandName) {
  const a = String(allergen || '').toLowerCase().trim();
  const g = String(genericName || '').toLowerCase();
  const b = String(brandName || '').toLowerCase();
  if (!a || !g) return false;
  if (g.includes(a) || a.includes(g) || (b && b.includes(a))) return true;
  for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) {
    const allergenInClass = a.includes(cls) || members.some((m) => a.includes(m));
    const drugInClass = members.some((m) => g.includes(m));
    if (allergenInClass && drugInClass) return true;
  }
  return false;
}

module.exports = { allergyMatches, HttpError, bad, forbidden, notFound, conflict, wrap, today, round2, can, need, audit, getVisit, priceFor, addCharge, cancelCharges };
