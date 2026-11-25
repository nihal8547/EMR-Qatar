'use strict';
/** Generates the complete PostgreSQL DDL (schemas, tables, FKs, indexes) from the registry. */
const fs = require('fs');
const path = require('path');
const reg = require('./registry');

const q = (s) => `"${s}"`;
const fq = (r) => `${q(r.schema)}.${q(r.table)}`;

function sqlType(f) {
  switch (f.type) {
    case 'int': return 'integer';
    case 'decimal': return 'numeric(14,3)';
    case 'money': return 'numeric(14,2)';
    case 'date': return 'date';
    case 'time': return 'time';
    case 'datetime': return 'timestamptz';
    case 'bool': return 'boolean';
    case 'ref': return 'bigint';
    case 'json': return 'jsonb';
    case 'password': return null; // virtual
    default: return 'text';
  }
}

function buildDDL() {
  const out = [];
  out.push('-- Qatar HMS: generated from backend/src/registry. DO NOT EDIT BY HAND.');
  out.push('-- Regenerate with: npm run db:build');
  const schemas = new Set();
  for (const key of reg.order) schemas.add(reg.resources[key].schema);
  for (const s of ['auth', 'admin']) schemas.add(s);
  for (const s of [...schemas].sort()) out.push(`CREATE SCHEMA IF NOT EXISTS ${q(s)};`);

  // support tables that are not CRUD resources
  out.push(`
CREATE TABLE IF NOT EXISTS "auth"."permissions" (
  "code" text PRIMARY KEY,
  "description" text
);
CREATE TABLE IF NOT EXISTS "auth"."role_permissions" (
  "role_id" bigint NOT NULL,
  "perm_code" text NOT NULL REFERENCES "auth"."permissions"("code") ON DELETE CASCADE,
  PRIMARY KEY ("role_id", "perm_code")
);
CREATE TABLE IF NOT EXISTS "admin"."counters" (
  "prefix" text PRIMARY KEY,
  "value" bigint NOT NULL DEFAULT 0
);`);

  const fks = [];
  const idx = [];
  for (const key of reg.order) {
    const r = reg.resources[key];
    const cols = [`  "id" bigserial PRIMARY KEY`];
    for (const f of r.fields) {
      const t = sqlType(f);
      if (!t) continue;
      cols.push(`  ${q(f.name)} ${t}`);
      if (f.type === 'ref') {
        const tr = reg.target(f.ref);
        fks.push(`ALTER TABLE ${fq(r)} ADD CONSTRAINT ${q(`fk_${r.table}_${f.name}`)} FOREIGN KEY (${q(f.name)}) REFERENCES ${fq(tr)}("id");`);
        idx.push(`CREATE INDEX ${q(`ix_${r.table}_${f.name}`)} ON ${fq(r)} (${q(f.name)});`);
      }
      if (f.unique || f.auto) {
        idx.push(`CREATE UNIQUE INDEX ${q(`ux_${r.table}_${f.name}`)} ON ${fq(r)} (${q(f.name)}) WHERE "is_deleted" = false AND ${q(f.name)} IS NOT NULL;`);
      }
    }
    cols.push(
      `  "is_deleted" boolean NOT NULL DEFAULT false`,
      `  "created_at" timestamptz NOT NULL DEFAULT now()`,
      `  "updated_at" timestamptz NOT NULL DEFAULT now()`,
      `  "created_by" bigint`,
      `  "updated_by" bigint`,
    );
    out.push(`CREATE TABLE ${fq(r)} (\n${cols.join(',\n')}\n);`);
    idx.push(`CREATE INDEX ${q(`ix_${r.table}_created`)} ON ${fq(r)} ("created_at");`);
  }
  // role_permissions -> roles FK (roles table exists now)
  fks.push(`ALTER TABLE "auth"."role_permissions" ADD CONSTRAINT "fk_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id") ON DELETE CASCADE;`);

  out.push(...fks, ...idx);
  return out.join('\n') + '\n';
}

module.exports = { buildDDL, sqlType };

if (require.main === module && process.argv.includes('--write')) {
  const dir = path.join(__dirname, '..', '..', 'db');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'schema.sql'), buildDDL());
  console.log('Wrote', path.join(dir, 'schema.sql'));
}
