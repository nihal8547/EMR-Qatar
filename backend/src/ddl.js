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
  out.push('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
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
      if (f.search && !f.secret && sqlType(f) === 'text') {
        idx.push(`CREATE INDEX ${q(`tg_${r.table}_${f.name}`)} ON ${fq(r)} USING gin ((${q(f.name)}::text) gin_trgm_ops);`);
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
  // security: MFA columns + server-side sessions (revocable logins)
  out.push(`ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "mfa_secret" text, ADD COLUMN IF NOT EXISTS "mfa_pending" text, ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "mfa_last_step" bigint NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "password_changed_at" timestamptz;`);
  out.push(`CREATE TABLE IF NOT EXISTS "auth"."sessions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" bigint NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE, "created_at" timestamptz NOT NULL DEFAULT now(), "last_seen" timestamptz NOT NULL DEFAULT now(), "expires_at" timestamptz NOT NULL, "revoked" boolean NOT NULL DEFAULT false, "ip" text, "ua" text);`);
  out.push(`CREATE INDEX IF NOT EXISTS "ix_sessions_user" ON "auth"."sessions" ("user_id");`);
  // tamper-evident audit log: hash chain + append-only (no UPDATE/DELETE)
  out.push(`ALTER TABLE "admin"."audit_log" ADD COLUMN IF NOT EXISTS "prev_hash" text, ADD COLUMN IF NOT EXISTS "row_hash" text;
CREATE OR REPLACE FUNCTION "admin"."audit_row_hash"(prev text, id bigint, u text, a text, r text, rid text, ip text, d text, cb bigint) RETURNS text AS $f$
  SELECT encode(sha256(convert_to(coalesce(prev,'')||'|'||id||'|'||coalesce(u,'')||'|'||coalesce(a,'')||'|'||coalesce(r,'')||'|'||coalesce(rid,'')||'|'||coalesce(ip,'')||'|'||coalesce(d,'')||'|'||coalesce(cb::text,''),'UTF8')),'hex')
$f$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION "admin"."audit_chain"() RETURNS trigger AS $f$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(7771001);
  SELECT row_hash INTO prev FROM "admin"."audit_log" WHERE row_hash IS NOT NULL ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := coalesce(prev,'GENESIS');
  NEW.row_hash := "admin"."audit_row_hash"(NEW.prev_hash, NEW.id, NEW.username, NEW.action, NEW.resource, NEW.record_id, NEW.ip, NEW.details::text, NEW.created_by);
  RETURN NEW;
END $f$ LANGUAGE plpgsql;
CREATE TRIGGER "trg_audit_chain" BEFORE INSERT ON "admin"."audit_log" FOR EACH ROW EXECUTE FUNCTION "admin"."audit_chain"();
CREATE OR REPLACE FUNCTION "admin"."audit_immutable"() RETURNS trigger AS $f$ BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $f$ LANGUAGE plpgsql;
CREATE TRIGGER "trg_audit_immutable" BEFORE UPDATE OR DELETE ON "admin"."audit_log" FOR EACH ROW EXECUTE FUNCTION "admin"."audit_immutable"();`);
  return out.join('\n') + '\n';
}

module.exports = { buildDDL, sqlType };

if (require.main === module && process.argv.includes('--write')) {
  const dir = path.join(__dirname, '..', '..', 'db');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'schema.sql'), buildDDL());
  console.log('Wrote', path.join(dir, 'schema.sql'));
}
