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

const maskSecret = (row) => { if (row && row.key === 'evolution_api_key' && row.value) row.value = '••••••••'; };

/* ---------- record scoping for roles flagged "restrict to own patients" (Doctor, Nurse) ----------
   A patient's clinical records are visible only if the user treated the patient (doctors) / the patient has an open visit today (nurses),
   otherwise a break-glass reason (8+ chars) is required for reads and is written to the audit log. Writes are never allowed on break-glass. */
const SCOPE_EXEMPT = new Set(['patients', 'appointments']);
function scopeKind(r) {
  if (SCOPE_EXEMPT.has(r.key)) return null;
  if (r.fields.some((f) => f.name === 'patient_id')) return 'patient';
  if (r.fields.some((f) => f.name === 'visit_id')) return 'visit';
  return null;
}
function relationSQL(user, patientExpr, params) {
  params.push(user.id);
  const nd = user.role_name !== 'Doctor' ? ` OR (sv.visit_date = CURRENT_DATE AND sv.status NOT IN ('Completed','Cancelled'))` : '';
  return `EXISTS (SELECT 1 FROM scheduling.visits sv WHERE sv.patient_id = ${patientExpr} AND sv.is_deleted = false AND (sv.doctor_id = $${params.length}${nd}))`;
}
function scopeSQL(user, alias, kind, params) {
  const pe = kind === 'patient' ? `${alias}."patient_id"` : `(SELECT v2.patient_id FROM scheduling.visits v2 WHERE v2.id = ${alias}."visit_id")`;
  return relationSQL(user, pe, params);
}
/** Throws unless the (restricted) user may see this patient. Use for any endpoint that returns a patient's clinical data. */
async function assertPatientAccess(req, patientId, opts = {}) {
  if (!req.user.restrict || !patientId) return;
  const params = [];
  const sql = relationSQL(req.user, '$2', params);
  const ok = (await db.query(`SELECT ${sql} AS ok`.replace('$2', `$${params.length + 1}`), [...params, patientId])).rows[0].ok;
  if (ok) return;
  const reason = String(req.query.breakglass || '').trim();
  if (opts.write || reason.length < 8) throw new HttpError(403, opts.write ? 'This patient is not under your care' : 'BREAKGLASS_REQUIRED', opts.write ? undefined : { breakglass: true });
  await audit(null, req.user, 'BREAK_GLASS', 'patients', patientId, { reason, via: req.path }, req.ip);
}
async function assertRecordAccess(req, r, row, opts = {}) {
  const kind = req.user.restrict ? scopeKind(r) : null;
  if (!kind || !row) return;
  let pid = row.patient_id;
  if (kind === 'visit') pid = (await db.query(`SELECT patient_id FROM scheduling.visits WHERE id=$1`, [row.visit_id])).rows[0]?.patient_id;
  await assertPatientAccess(req, pid, opts);
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
  const sc = searchClause(res, 't', search, query.q, params);
  if (sc) where.push(sc);
  return { where: where.join(' AND '), params };
}



/** Server-side text search: every word must match (AND), each word may match any search field (OR). % and _ are escaped. */
function searchClause(res, alias, fields, text, params) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return '';
  const hasPat = !!patientSearchSQL(res, alias, '$0');
  if (!fields.length && !hasPat) return '';
  const parts = words.map((w) => {
    params.push(`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    return `(${[...fields.map((f) => `${alias}.${q(f.name)}::text ILIKE ${p}`), 'false'].join(' OR ')}${patientSearchSQL(res, alias, p)})`;
  });
  return parts.join(' AND ');
}

// Records that belong to a patient (have a patient_id -> patients ref) are also found by that patient's MRN, name, QID or phone.
function patientSearchSQL(res, alias, p) {
  const f = res.fields.find((x) => x.name === 'patient_id' && x.type === 'ref' && x.ref === 'patients');
  if (!f || res.key === 'patients') return '';
  return ` OR EXISTS (SELECT 1 FROM mpi.patients sp WHERE sp.id = ${alias}."patient_id" AND (sp.mrn ILIKE ${p} OR sp.full_name ILIKE ${p} OR sp.qid ILIKE ${p} OR sp.phone ILIKE ${p}))`;
}

async function list(res, query, user) {
  const limit = Math.min(Math.max(parseInt(query.limit || '25', 10) || 25, 1), query.format === 'csv' ? 20000 : 200);
  const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
  const s = selectSQL(res);
  const built = buildWhere(res, query);
  const params = built.params;
  let where = built.where;
  const kind = user && user.restrict ? scopeKind(res) : null;
  if (kind) where += ` AND ${scopeSQL(user, 't', kind, params)}`;
  let order = res.orderBy;
  if (query.sort) {
    const f = res.fields.find((x) => x.name === query.sort && !x.secret && x.type !== 'password');
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
  // equality filters on the target's own fields, e.g. /lookup/plans?f_payer_id=3 (field names come from the registry only)
  for (const [k, v] of Object.entries(req.query)) {
    if (!k.startsWith('f_')) continue;
    const f = tr.fields.find((x) => x.name === k.slice(2) && ['ref', 'select', 'bool'].includes(x.type) && !x.secret);
    if (!f || v === '' || v === undefined) continue;
    params.push(f.type === 'ref' ? Number(v) : f.type === 'bool' ? v === 'true' : String(v));
    where.push(`t.${q(f.name)} = $${params.length}`);
  }
  if (req.query.q) {
    const sc = searchClause(tr, 't', tr.fields.filter((f) => (f.search || tr.disp.includes(f.name)) && !f.secret && f.type !== 'ref'), req.query.q, params);
    if (sc) where.push(sc);
  }
  const sql = `SELECT t."id", ${dispExpr(tr, 't')} AS label FROM ${fq(tr)} t WHERE ${where.join(' AND ')} ORDER BY label LIMIT 30`;
  res.json((await db.query(sql, params)).rows);
}));

router.get('/r/:key', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  if (!can(req, `${r.key}.view`)) throw forbidden();
  const out = await list(r, req.query, req.user);
  if (r.key === 'settings') out.rows.forEach(maskSecret);
  if (req.query.format === 'csv') {
    const cols = r.fields.filter((f) => !f.secret && f.type !== 'password');
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      let s = (v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v));
      if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;   // stop spreadsheet formula injection
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
  await assertRecordAccess(req, r, row);
  if (r.key === 'settings') maskSecret(row);
  res.json(row);
}));

/** Generic printable document for any record: its fields, child rows, the patient block and the centre header. */
router.get('/print/:key/:id', wrap(async (req, res) => {
  const r = getRes(req.params.key);
  if (!can(req, `${r.key}.view`)) throw forbidden();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw notFound();
  const row = await fetchOne(db, r, id);
  if (!row) throw notFound();
  await assertRecordAccess(req, r, row);
  const vis = (res_) => res_.fields.filter((f) => !f.hidden && !f.secret && f.type !== 'password' && !['created_by', 'updated_by'].includes(f.name));
  const fields = vis(r).map((f) => ({ name: f.name, label: f.label, type: f.type }));
  const children = [];
  for (const c of r.children || []) {
    const cr = reg.resources[c.res];
    if (!cr || !can(req, `${cr.key}.view`)) continue;
    const out = await list(cr, { [c.fk]: String(id), limit: '200' }, req.user);
    children.push({ key: cr.key, label: c.label || cr.label, fields: vis(cr).filter((f) => f.list && f.name !== c.fk).map((f) => ({ name: f.name, label: f.label, type: f.type })), rows: out.rows });
  }
  let patient = null;
  if (row.patient_id && r.key !== 'patients' && can(req, 'patients.view')) {
    patient = (await db.query(`SELECT mrn, full_name, dob, gender, qid, phone, blood_group FROM "mpi"."patients" WHERE id=$1`, [row.patient_id])).rows[0] || null;
  }
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  await audit(null, req.user, 'PRINT', r.key, id, null, req.ip);
  res.json({ meta: { key: r.key, label: r.label, singular: r.singular || r.label }, fields, record: row, children, patient, centre: Object.fromEntries(s.map((x) => [x.key, x.value])) });
}));

/** Insurance policies entered together with a new patient: same rules and audit as adding them one by one. */
async function addPolicies(client, req, patientId, list) {
  const items = Array.isArray(list) ? list : [list];
  if (items.length > 5) throw bad('At most 5 policies can be added at registration');
  const pr = getRes('policy_members');
  if (items.length && !can(req, 'policy_members.create')) throw forbidden('Your role cannot add insurance policies');
  for (const raw of items) {
    const data = prepare(pr, { ...raw, patient_id: patientId, status: 'Active' }, 'create');
    if (data.valid_from && data.valid_to && String(data.valid_to) < String(data.valid_from)) throw bad('Policy "valid to" date is before "valid from"');
    if (data.plan_id) {
      const pl = (await client.query(`SELECT payer_id FROM "insurance"."plans" WHERE id=$1 AND is_deleted=false`, [data.plan_id])).rows[0];
      if (!pl) throw bad('Plan not found');
      if (String(pl.payer_id) !== String(data.payer_id)) throw bad('The chosen plan belongs to a different insurance company');
    }
    let pid; try { pid = await insertRow(client, pr, data, req.user); } catch (e) { throw errorFromPg(e); }
    await audit(client, req.user, 'CREATE', 'policy_members', pid, { ...data, via: 'patient registration' }, req.ip);
  }
}

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
    if (req.user.restrict && scopeKind(r) && data.patient_id) await assertPatientAccess(req, data.patient_id, { write: true });
    await hooks.run(r.hooks.before, ctx);
    let newId;
    try { newId = await insertRow(client, r, data, req.user); } catch (e) { throw errorFromPg(e); }
    const row = await fetchOne(client, r, newId);
    await hooks.run(r.hooks.after, { ...ctx, row, action: 'create' });
    const safe = { ...data }; delete safe.password; delete safe.password_hash;
    await audit(client, req.user, 'CREATE', r.key, newId, safe, req.ip);
    if (r.key === 'patients' && req.body.insurance !== undefined && req.body.insurance !== null) await addPolicies(client, req, newId, req.body.insurance);
    return newId;
  });
  if (r.key === 'patients') require('./notify').auto('patient.registered', { patient_id: id });
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
    await assertRecordAccess(req, r, existing, { write: true });
    if (r.key === 'settings' && existing.key === 'evolution_api_key') throw forbidden('Change the Evolution API key on the WhatsApp Connect page');
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
  if (r.key === 'settings') require('./notify').resetCache();
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
    await assertRecordAccess(req, r, existing, { write: true });
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
    await assertRecordAccess(req, r, row, { write: true });
    const result = await handler({ client, user: req.user, row, id, body: req.body });
    await audit(client, req.user, `ACTION:${a.name}`, r.key, id, null, req.ip);
    return result;
  });
  res.json({ ok: true, ...(out || {}), record: await fetchOne(db, r, id) });
}));

module.exports = { router, fetchOne, selectSQL, list, fq, q, getRes, dispExpr, assertPatientAccess, relationSQL };
