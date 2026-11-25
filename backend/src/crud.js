'use strict';
/** Generic, registry-driven REST API: list / get / create / update / delete / actions / lookup / csv export */
const express = require('express');
const db = require('./db');
const reg = require('./registry');
const hooks = require('./hooks');
const actions = require('./actions');
const { wrap, bad, forbidden, notFound, conflict, HttpError, can, audit, today } = require('./lib');

const q = (s) => `"${s}"`;
const fq = (r) => `${q(r.schema)}.${q(r.table)}`;

function dispExpr(res, alias) {
  const parts = res.disp.map((d) => (d === 'id' ? `${alias}."id"::text` : `${alias}."${d}"::text`));
  return `concat_ws(' · ', ${parts.join(', ')})`;
}

function getRes(key) {
  const r = reg.resources[key];
  if (!r || r.isAlias) throw notFound(`Unknown resource "${key}"`);
  return r;
}

/* ---------- value coercion ---------- */
function coerce(f, v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  switch (f.type) {
    case 'int': {
      const n = Number(v);
      if (!Number.isInteger(n)) throw bad(`${f.label}: must be a whole number`);
      return n;
    }
    case 'decimal':
    case 'money': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw bad(`${f.label}: must be a number`);
      return n;
    }
    case 'bool':
      return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
    case 'date': {
      const s = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw bad(`${f.label}: invalid date`);
      return s;
    }
    case 'time': {
      const s = String(v);
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) throw bad(`${f.label}: invalid time`);
      return s;
    }
    case 'datetime': {
      if (Number.isNaN(Date.parse(v))) throw bad(`${f.label}: invalid date/time`);
      return new Date(v).toISOString();
    }
    case 'ref': {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw bad(`${f.label}: invalid selection`);
      return n;
    }
    case 'select':
      if (!f.options.includes(String(v))) throw bad(`${f.label}: "${v}" is not a valid option`);
      return String(v);
    case 'json':
      return typeof v === 'string' ? v : JSON.stringify(v);
    case 'email': {
      const s = String(v).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw bad(`${f.label}: invalid email`);
      return s;
    }
    default:
      return String(v).trim();
  }
}

function defaultValue(f) {
  if (f.def === null || f.def === undefined) return undefined;
  switch (f.def) {
    case 'today': return today();
    case 'now': return new Date().toISOString();
    case 'true': return true;
    case 'false': return false;
    default:
      if (f.type === 'int' || f.type === 'decimal' || f.type === 'money') return Number(f.def);
      return f.def;
  }
}

/* ---------- SELECT builder with ref labels ---------- */
function selectSQL(res) {
  const joins = [];
  const cols = ['t.*'];
  res.fields.filter((f) => f.type === 'ref').forEach((f, i) => {
    const tr = reg.target(f.ref);
    const a = `j${i}`;
    joins.push(`LEFT JOIN ${fq(tr)} ${a} ON ${a}."id" = t.${q(f.name)}`);
    cols.push(`${dispExpr(tr, a)} AS ${q(`${f.name}__label`)}`);
  });
  return { from: `${fq(res)} t ${joins.join(' ')}`, cols: cols.join(', ') };
}

function cleanRow(res, row) {
  for (const f of res.fields) if (f.secret) delete row[f.name];
  return row;
}

async function fetchOne(clientOrPool, res, id) {
  const s = selectSQL(res);
  const { rows } = await clientOrPool.query(`SELECT ${s.cols} FROM ${s.from} WHERE t."id" = $1 AND t."is_deleted" = false`, [id]);
  return rows[0] ? cleanRow(res, rows[0]) : null;
}

/* ---------- list ---------- */
function buildWhere(res, query) {
  const where = ['t."is_deleted" = false'];
  const params = [];
  const add = (sql, v) => { params.push(v); return sql.replace('$$', `$${params.length}`); };
  for (const f of res.fields) {
    if (f.secret) continue;
    const v = query[f.name];
    if (v !== undefined && v !== '') {
      if (v === '__null') where.push(`t.${q(f.name)} IS NULL`);
      else if (f.type === 'bool') where.push(add(`t.${q(f.name)} = $$`, v === 'true' || v === '1'));
      else if (f.type === 'ref' || f.type === 'int') where.push(add(`t.${q(f.name)} = $$`, Number(v)));
      else if (f.type === 'datetime') where.push(add(`t.${q(f.name)}::date = $$::date`, String(v).slice(0, 10)));
      else where.push(add(`t.${q(f.name)}::text = $$`, String(v)));
    }
    if (f.type === 'date' || f.type === 'datetime') {
      if (query[`from_${f.name}`]) where.push(add(`t.${q(f.name)}::date >= $$::date`, String(query[`from_${f.name}`]).slice(0, 10)));
      if (query[`to_${f.name}`]) where.push(add(`t.${q(f.name)}::date <= $$::date`, String(query[`to_${f.name}`]).slice(0, 10)));
    }
  }
  const search = res.fields.filter((f) => f.search && !f.secret);
  if (query.q && search.length) {
    params.push(`%${String(query.q).trim()}%`);
    const p = `$${params.length}`;
    where.push(`(${search.map((f) => `t.${q(f.name)}::text ILIKE ${p}`).join(' OR ')})`);
  }
  return { where: where.join(' AND '), params };
}

async function list(res, query) {
  const limit = Math.min(Math.max(parseInt(query.limit || '25', 10) || 25, 1), query.format === 'csv' ? 20000 : 200);
  const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
  const s = selectSQL(res);
  const { where, params } = buildWhere(res, query);
  let order = res.orderBy;
  if (query.sort) {
    const f = res.fields.find((x) => x.name === query.sort && !x.secret);
    if (f || ['id', 'created_at', 'updated_at'].includes(query.sort)) {
      order = `t.${q(query.sort)} ${String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'}, t."id" DESC`;
    }
  } else {
    order = order.replace(/^"/, 't."').replace(/, "/g, ', t."');
  }
  const total = (await db.query(`SELECT count(*)::int AS n FROM ${fq(res)} t WHERE ${where}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT ${s.cols} FROM ${s.from} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
  return { rows: rows.map((r) => cleanRow(res, r)), total, page, limit };
}

/* ---------- prepare data for insert/update ---------- */
function prepare(res, body, mode) {
  const data = {};
  for (const f of res.fields) {
    if (f.secret) continue;
    if (f.auto && mode === 'create') continue; // generated later
    if (f.readonly) {
      if (mode === 'create') {
        const d = defaultValue(f);
        if (d !== undefined) data[f.name] = d;
      }
      continue;
    }
    let v = coerce(f, body[f.name]);
    if (v === undefined) {
      if (mode === 'create') v = defaultValue(f);
      else continue;
    }
    if (v === undefined || v === null) {
      if (f.required && f.type !== 'password' && (mode === 'create' || body[f.name] !== undefined)) throw bad(`${f.label} is required`);
      if (mode === 'create' && v === undefined) continue;
    }
    data[f.name] = v;
  }
  return data;
}

function errorFromPg(e) {
  if (e.code === '23505') return conflict('A record with the same unique value already exists' + (e.constraint ? ` (${e.constraint.replace(/^ux_/, '')})` : ''));
  if (e.code === '23503') return conflict('This record is linked to other records and cannot be changed that way');
  if (e.code === '22P02' || e.code === '22007' || e.code === '22003') return bad('Invalid value supplied');
  return e;
}

async function insertRow(client, res, data, user) {
  for (const f of res.fields) {
    if (f.auto && data[f.name] === undefined) data[f.name] = await db.nextCode(client, f.auto.prefix, f.auto.pad);
  }
  // virtual password field is never a column
  const names = Object.keys(data).filter((n) => res.fields.find((f) => f.name === n && f.type !== 'password'));
  const cols = [...names, 'created_by', 'updated_by'];
  const vals = [...names.map((n) => data[n]), user ? user.id : null, user ? user.id : null];
  const sql = `INSERT INTO ${fq(res)} (${cols.map(q).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING "id"`;
  return (await client.query(sql, vals)).rows[0].id;
}

/* ---------- router ---------- */
const router = express.Router();

router.use((req, res, next) => {
  if (req.user.isPortal) return next(forbidden('Patients can only use the portal'));
  next();
});

/* Lookup: id + label only, for dropdowns */
router.get('/lookup/:key', wrap(async (req, res) => {
  const base = reg.resources[req.params.key];
  if (!base) throw notFound('Unknown lookup');
  const tr = base.isAlias ? reg.resources[base.alias.of] : base;
  if (!can(req, `${tr.key}.view`)) throw forbidden();
  const where = ['t."is_deleted" = false'];
  const params = [];
  if (base.isAlias) where.push(base.alias.where.replace(/"role_id"/g, 't."role_id"'));
  if (req.query.id) { params.push(Number(req.query.id)); where.push(`t."id" = $${params.length}`); }
  if (req.query.q) {
    const s = tr.fields.filter((f) => (f.search || tr.disp.includes(f.name)) && !f.secret && f.type !== 'ref');
    if (s.length) {
      params.push(`%${String(req.query.q).trim()}%`);
      where.push(`(${s.map((f) => `t.${q(f.name)}::text ILIKE $${params.length}`).join(' OR ')})`);
    }
  }
  const sql = `SELECT t."id", ${dispExpr(tr, 't')} AS label FROM ${fq(tr)} t WHERE ${where.join(' AND ')} ORDER BY label LIMIT 30`;
  res.json((await db.query(sql, params)).rows);
}));

router.get('/r/:key', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  if (!can(req, `${r.key}.view`)) throw forbidden();
  const out = await list(r, req.query);
  if (req.query.format === 'csv') {
    const cols = r.fields.filter((f) => !f.secret && f.type !== 'password');
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = (v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v));
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => esc(c.label)).join(',')];
    for (const row of out.rows) lines.push(cols.map((c) => esc(c.type === 'ref' ? row[`${c.name}__label`] : row[c.name])).join(','));
    await audit(null, req.user, 'EXPORT', r.key, null, { rows: out.rows.length }, req.ip);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.key}.csv"`);
    return res.send('﻿' + lines.join('\n'));
  }
  res.json(out);
}));

router.get('/r/:key/:id', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  if (!can(req, `${r.key}.view`)) throw forbidden();
  const row = await fetchOne(db, r, Number(req.params.id));
  if (!row) throw notFound();
  res.json(row);
}));

router.post('/r/:key', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  if (!can(req, `${r.key}.create`)) throw forbidden();
  if (r.noCreate) throw forbidden('Records of this type are created by the system workflow');
  const id = await db.tx(async (client) => {
    const data = prepare(r, req.body, 'create');
    const ctx = { res: r, data, user: req.user, client, mode: 'create', body: req.body, query: req.query };
    if (r.fromVisit && data.visit_id && !data.patient_id) {
      const v = await client.query(`SELECT patient_id FROM "scheduling"."visits" WHERE id=$1 AND is_deleted=false`, [data.visit_id]);
      if (!v.rows.length) throw bad('Visit not found');
      data.patient_id = v.rows[0].patient_id;
    }
    await hooks.run(r.hooks.before, ctx);
    let newId;
    try { newId = await insertRow(client, r, data, req.user); } catch (e) { throw errorFromPg(e); }
    const row = await fetchOne(client, r, newId);
    await hooks.run(r.hooks.after, { ...ctx, row, action: 'create' });
    const safe = { ...data }; delete safe.password; delete safe.password_hash;
    await audit(client, req.user, 'CREATE', r.key, newId, safe, req.ip);
    return newId;
  });
  res.status(201).json(await fetchOne(db, r, id));
}));

router.put('/r/:key/:id', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  if (!can(req, `${r.key}.edit`)) throw forbidden();
  if (r.noEdit) throw forbidden('Records of this type cannot be edited directly');
  const id = Number(req.params.id);
  await db.tx(async (client) => {
    const existing = await fetchOne(client, r, id);
    if (!existing) throw notFound();
    const data = prepare(r, req.body, 'update');
    const ctx = { res: r, data, user: req.user, client, mode: 'update', existing, body: req.body, query: req.query, id };
    await hooks.run(r.hooks.before, ctx);
    const names = Object.keys(data).filter((n) => r.fields.find((f) => f.name === n && f.type !== 'password'));
    if (names.length) {
      const sets = names.map((n, i) => `${q(n)} = $${i + 1}`);
      sets.push(`"updated_at" = now()`, `"updated_by" = $${names.length + 1}`);
      try {
        await client.query(`UPDATE ${fq(r)} SET ${sets.join(', ')} WHERE "id" = $${names.length + 2}`, [...names.map((n) => data[n]), req.user.id, id]);
      } catch (e) { throw errorFromPg(e); }
    }
    const row = await fetchOne(client, r, id);
    await hooks.run(r.hooks.after, { ...ctx, row, action: 'update' });
    const changes = {};
    for (const n of names) if (String(existing[n] ?? '') !== String(data[n] ?? '') && n !== 'password_hash') changes[n] = { from: existing[n], to: n === 'password' ? '***' : data[n] };
    await audit(client, req.user, 'UPDATE', r.key, id, changes, req.ip);
  });
  res.json(await fetchOne(db, r, id));
}));

router.delete('/r/:key/:id', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  if (!can(req, `${r.key}.delete`)) throw forbidden();
  if (r.noDelete) throw forbidden('Records of this type cannot be deleted');
  const id = Number(req.params.id);
  if (r.key === 'users' && id === req.user.id) throw conflict('You cannot delete your own account');
  await db.tx(async (client) => {
    const existing = await fetchOne(client, r, id);
    if (!existing) throw notFound();
    if (r.key === 'users') await hooks.run('userDeleteGuard', { client, user: req.user, row: existing });
    await client.query(`UPDATE ${fq(r)} SET "is_deleted" = true, "updated_at" = now(), "updated_by" = $1 WHERE "id" = $2`, [req.user.id, id]);
    await hooks.run(r.hooks.after, { res: r, user: req.user, client, row: existing, action: 'delete', id });
    await audit(client, req.user, 'DELETE', r.key, id, null, req.ip);
  });
  res.json({ ok: true });
}));

router.post('/r/:key/:id/action/:name', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  const a = r.actions.find((x) => x.name === req.params.name);
  if (!a) throw notFound('Unknown action');
  if (!can(req, a.perm)) throw forbidden();
  const id = Number(req.params.id);
  const handler = actions.get(r.key, a.name);
  if (!handler) throw new HttpError(501, 'Action not implemented');
  const out = await db.tx(async (client) => {
    const row = await fetchOne(client, r, id);
    if (!row) throw notFound();
    const result = await handler({ client, user: req.user, row, id, body: req.body });
    await audit(client, req.user, `ACTION:${a.name}`, r.key, id, null, req.ip);
    return result;
  });
  res.json({ ok: true, ...(out || {}), record: await fetchOne(db, r, id) });
}));

module.exports = { router, fetchOne, selectSQL, list, fq, q, getRes, dispExpr };
