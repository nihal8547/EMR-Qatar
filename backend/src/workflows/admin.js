'use strict';
/** Role & permission matrix */
const express = require('express');
const db = require('../db');
const { allPermissions } = require('../registry');
const { clearPermCache } = require('../auth');
const { wrap, bad, notFound, conflict, need, audit } = require('../lib');

const router = express.Router();

router.get('/admin/matrix', need('admin.roles'), wrap(async (req, res) => {
  const roles = (await db.query(`SELECT id, name, description FROM "auth"."roles" WHERE is_deleted=false ORDER BY id`)).rows;
  const rp = (await db.query(`SELECT role_id, perm_code FROM "auth"."role_permissions"`)).rows;
  const granted = {};
  for (const r of rp) (granted[r.role_id] = granted[r.role_id] || []).push(r.perm_code);
  const perms = allPermissions().map(([code, description]) => {
    const dot = code.indexOf('.');
    return { code, description, group: code.slice(0, dot), action: code.slice(dot + 1) };
  });
  res.json({ roles, permissions: perms, granted });
}));

router.put('/admin/roles/:id/permissions', need('admin.roles'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const codes = Array.isArray(req.body.permissions) ? [...new Set(req.body.permissions.map(String))] : null;
  if (!codes) throw bad('permissions must be a list');
  const valid = new Set(allPermissions().map(([c]) => c));
  const unknown = codes.filter((c) => !valid.has(c));
  if (unknown.length) throw bad(`Unknown permission(s): ${unknown.slice(0, 5).join(', ')}`);
  await db.tx(async (client) => {
    const role = (await client.query(`SELECT * FROM "auth"."roles" WHERE id=$1 AND is_deleted=false`, [id])).rows[0];
    if (!role) throw notFound('Role not found');
    // Do not let an admin lock everyone out of the matrix
    if (role.name === 'Super Admin' && !codes.includes('admin.roles')) throw conflict('Super Admin must keep "admin.roles"');
    await client.query(`DELETE FROM "auth"."role_permissions" WHERE role_id=$1`, [id]);
    if (codes.length) {
      await client.query(`INSERT INTO "auth"."role_permissions"(role_id, perm_code) SELECT $1, unnest($2::text[])`, [id, codes]);
    }
    await audit(client, req.user, 'ROLE_PERMISSIONS', 'roles', id, { count: codes.length }, req.ip);
  });
  clearPermCache();
  res.json({ ok: true, count: codes.length });
}));

module.exports = router;
