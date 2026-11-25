'use strict';
/** Price configuration: one place for treatment / test / dental / pharmacy / package prices, bulk changes, payer prices */
const express = require('express');
const db = require('../db');
const { wrap, bad, notFound, need, audit, round2 } = require('../lib');

const router = express.Router();
const view = need('pricing.view');
const edit = need('pricing.edit');
const MAX_PRICE = 1000000;

const TABLES = {
  service: { t: '"billing"."services"', res: 'services' },
  drug: { t: '"pharmacy"."drugs"', res: 'drugs' },
  package: { t: '"billing"."packages"', res: 'packages' },
};
const UNION = `
  SELECT 'service' AS kind, id, code, name, category, price, covered, needs_preauth, active, updated_at, NULL::text AS extra FROM "billing"."services" WHERE is_deleted=false AND code <> 'PHARM'
  UNION ALL
  SELECT 'drug', id, code, generic_name || COALESCE(' ' || strength, '') || COALESCE(' (' || brand_name || ')', ''), 'Pharmacy', price, NULL, NULL, active, updated_at, schedule FROM "pharmacy"."drugs" WHERE is_deleted=false
  UNION ALL
  SELECT 'package', id, NULL, name, 'Package', price, NULL, NULL, active, updated_at, NULL FROM "billing"."packages" WHERE is_deleted=false`;

function filters(q) {
  const w = []; const p = [];
  if (['service', 'drug', 'package'].includes(q.kind)) { p.push(q.kind); w.push(`kind = $${p.length}`); }
  if (q.category) { p.push(String(q.category)); w.push(`category = $${p.length}`); }
  if (q.q) { p.push(`%${String(q.q).slice(0, 60)}%`); w.push(`(name ILIKE $${p.length} OR code ILIKE $${p.length})`); }
  if (q.active === 'true') w.push('active = true');
  return { where: w.length ? `WHERE ${w.join(' AND ')}` : '', p };
}
const validPrice = (v) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw bad('Enter a valid price');
  if (n < 0) throw bad('Price cannot be negative');
  if (n > MAX_PRICE) throw bad(`Price cannot exceed ${MAX_PRICE.toLocaleString()}`);
  return round2(n);
};

router.get('/pricing/items', view, wrap(async (req, res) => {
  const { where, p } = filters(req.query);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), req.query.all ? 5000 : 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const total = (await db.query(`SELECT count(*)::int n FROM (${UNION}) u ${where}`, p)).rows[0].n;
  const rows = (await db.query(
    `SELECT * FROM (${UNION}) u ${where} ORDER BY category, name LIMIT ${limit} OFFSET ${(page - 1) * limit}`, p)).rows;
  const cats = (await db.query(`SELECT category, count(*)::int n, round(avg(price),2) AS avg, min(price) AS min, max(price) AS max FROM (${UNION}) u GROUP BY category ORDER BY category`)).rows;
  res.json({ rows, total, page, limit, categories: cats });
}));

router.put('/pricing/items/:kind/:id', edit, wrap(async (req, res) => {
  const tb = TABLES[req.params.kind]; const id = Number(req.params.id);
  if (!tb || !Number.isSafeInteger(id) || id < 1) throw notFound('Item not found');
  const b = req.body || {};
  await db.tx(async (client) => {
    const old = (await client.query(`SELECT * FROM ${tb.t} WHERE id=$1 AND is_deleted=false FOR UPDATE`, [id])).rows[0];
    if (!old) throw notFound('Item not found');
    const sets = []; const vals = []; const changes = {};
    const add = (col, v) => { vals.push(v); sets.push(`"${col}" = $${vals.length}`); changes[col] = { from: old[col], to: v }; };
    if (b.price !== undefined) { const np = validPrice(b.price); if (np !== Number(old.price)) add('price', np); }
    if (b.active !== undefined && typeof b.active === 'boolean' && b.active !== old.active) add('active', b.active);
    if (req.params.kind === 'service') {
      for (const c of ['covered', 'needs_preauth']) if (b[c] !== undefined && typeof b[c] === 'boolean' && b[c] !== old[c]) add(c, b[c]);
    }
    if (!sets.length) return;
    vals.push(req.user.id, id);
    await client.query(`UPDATE ${tb.t} SET ${sets.join(', ')}, updated_at=now(), updated_by=$${vals.length - 1} WHERE id=$${vals.length}`, vals);
    await audit(client, req.user, changes.price ? 'PRICE_CHANGE' : 'PRICE_SETTING', tb.res, id, changes, req.ip);
  });
  const row = (await db.query(`SELECT * FROM (${UNION}) u WHERE kind=$1 AND id=$2`, [req.params.kind, id])).rows[0];
  res.json(row);
}));

/** Bulk change of the filtered items. preview=true returns the planned changes only. */
router.post('/pricing/bulk', edit, wrap(async (req, res) => {
  const b = req.body || {};
  const mode = b.mode; const value = Number(b.value);
  if (!['percent', 'amount', 'set'].includes(mode)) throw bad('Choose a change type');
  if (!Number.isFinite(value)) throw bad('Enter a value');
  if (mode === 'percent' && (value < -90 || value > 500)) throw bad('Percentage must be between -90 and 500');
  if (mode === 'set' && (value < 0 || value > MAX_PRICE)) throw bad('Invalid price');
  const step = [0, 0.5, 1, 5, 10].includes(Number(b.rounding)) ? Number(b.rounding) : 0;
  const { where, p } = filters(b.filter || {});
  const sel = (await db.query(`SELECT kind, id, name, category, price FROM (${UNION}) u ${where} ORDER BY category, name LIMIT 2001`, p)).rows;
  if (sel.length > 2000) throw bad('More than 2000 items match; narrow the filter first');
  const ids = Array.isArray(b.ids) && b.ids.length ? new Set(b.ids.map((x) => `${x.kind}:${x.id}`)) : null;
  const plan = [];
  for (const r of sel) {
    if (ids && !ids.has(`${r.kind}:${r.id}`)) continue;
    const old = Number(r.price);
    let np = mode === 'percent' ? old * (1 + value / 100) : mode === 'amount' ? old + value : value;
    if (step) np = Math.round(np / step) * step;
    np = Math.min(Math.max(round2(np), 0), MAX_PRICE);
    if (np !== old) plan.push({ kind: r.kind, id: r.id, name: r.name, category: r.category, old, new: np });
  }
  if (b.preview) return res.json({ preview: true, count: plan.length, changes: plan.slice(0, 500) });
  if (!plan.length) return res.json({ updated: 0 });
  await db.tx(async (client) => {
    for (const c of plan) {
      const tb = TABLES[c.kind];
      await client.query(`UPDATE ${tb.t} SET price=$1, updated_at=now(), updated_by=$2 WHERE id=$3`, [c.new, req.user.id, c.id]);
      await audit(client, req.user, 'PRICE_CHANGE', tb.res, c.id, { price: { from: c.old, to: c.new }, bulk: `${mode} ${value}` }, req.ip);
    }
  });
  res.json({ updated: plan.length });
}));

router.get('/pricing/history/:kind/:id', view, wrap(async (req, res) => {
  const tb = TABLES[req.params.kind]; const id = Number(req.params.id);
  if (!tb || !Number.isSafeInteger(id) || id < 1) throw notFound('Item not found');
  const { rows } = await db.query(
    `SELECT created_at, username, action, details FROM "admin"."audit_log" WHERE resource=$1 AND record_id=$2 AND action IN ('PRICE_CHANGE','PRICE_SETTING') ORDER BY id DESC LIMIT 50`, [tb.res, String(id)]);
  res.json(rows.map((r) => { let d = r.details; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } } return { at: r.created_at, by: r.username, action: r.action, price: d && d.price ? d.price : null, bulk: d && d.bulk || null }; }));
}));

/* ---- payer / corporate price lists ---- */
router.get('/pricing/lists', view, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.id, l.name, l.discount_pct, l.active, py.name AS payer, c.name AS corporate,
            (SELECT count(*)::int FROM "billing"."price_list_items" i WHERE i.price_list_id=l.id AND i.is_deleted=false) AS special_count
       FROM "billing"."price_lists" l LEFT JOIN "insurance"."payers" py ON py.id=l.payer_id LEFT JOIN "insurance"."corporate_accounts" c ON c.id=l.corporate_id
      WHERE l.is_deleted=false ORDER BY l.name`);
  res.json(rows);
}));

router.get('/pricing/lists/:id', view, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Price list not found');
  const list = (await db.query(`SELECT id, name, discount_pct FROM "billing"."price_lists" WHERE id=$1 AND is_deleted=false`, [id])).rows[0];
  if (!list) throw notFound('Price list not found');
  const q = req.query.q ? `%${String(req.query.q).slice(0, 60)}%` : null;
  const { rows } = await db.query(
    `SELECT s.id, s.code, s.name, s.category, s.price AS cash_price, i.price AS special_price, i.id AS item_id,
            round(COALESCE(i.price, s.price * (1 - $2::numeric / 100)), 2) AS effective_price
       FROM "billing"."services" s LEFT JOIN "billing"."price_list_items" i ON i.service_id=s.id AND i.price_list_id=$1 AND i.is_deleted=false
      WHERE s.is_deleted=false AND s.active AND s.code <> 'PHARM' AND ($3::text IS NULL OR s.name ILIKE $3 OR s.code ILIKE $3)
      ORDER BY s.category, s.name LIMIT 500`, [id, Number(list.discount_pct || 0), q]);
  res.json({ list, rows });
}));

/** Set (price number) or clear (price null) the special price of one service in a price list. */
router.put('/pricing/lists/:id/service/:serviceId', edit, wrap(async (req, res) => {
  const id = Number(req.params.id); const sid = Number(req.params.serviceId);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(sid)) throw notFound('Not found');
  await db.tx(async (client) => {
    const l = (await client.query(`SELECT id FROM "billing"."price_lists" WHERE id=$1 AND is_deleted=false`, [id])).rows[0];
    const s = (await client.query(`SELECT id FROM "billing"."services" WHERE id=$1 AND is_deleted=false`, [sid])).rows[0];
    if (!l || !s) throw notFound('Price list or service not found');
    const ex = (await client.query(`SELECT id, price FROM "billing"."price_list_items" WHERE price_list_id=$1 AND service_id=$2 AND is_deleted=false`, [id, sid])).rows[0];
    if (req.body.price === null || req.body.price === '') {
      if (ex) await client.query(`UPDATE "billing"."price_list_items" SET is_deleted=true, updated_at=now(), updated_by=$2 WHERE id=$1`, [ex.id, req.user.id]);
    } else {
      const np = validPrice(req.body.price);
      if (ex) await client.query(`UPDATE "billing"."price_list_items" SET price=$2, updated_at=now(), updated_by=$3 WHERE id=$1`, [ex.id, np, req.user.id]);
      else await client.query(`INSERT INTO "billing"."price_list_items"(price_list_id, service_id, price, created_by, updated_by) VALUES ($1,$2,$3,$4,$4)`, [id, sid, np, req.user.id]);
    }
    await audit(client, req.user, 'PRICE_LIST_CHANGE', 'price_lists', id, { service_id: sid, from: ex ? ex.price : null, to: req.body.price }, req.ip);
  });
  res.json({ ok: true });
}));

module.exports = router;
