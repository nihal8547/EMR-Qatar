'use strict';
const db = require('../src/db');
const reg = require('../src/registry');

async function migrate() {
  console.log('Applying paediatric schema updates...');
  await db.tx(async (c) => {
    // 1. Tables
    await c.query(`
      CREATE TABLE IF NOT EXISTS "clinical"."vaccines" (
        "id" bigserial PRIMARY KEY,
        "code" text,
        "name" text,
        "protects_against" text,
        "route" text DEFAULT 'IM',
        "usual_site" text,
        "active" boolean DEFAULT true,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" bigint,
        "updated_by" bigint
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_vaccines_code" ON "clinical"."vaccines" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "ix_vaccines_created" ON "clinical"."vaccines" ("created_at");

      CREATE TABLE IF NOT EXISTS "clinical"."vaccine_schedule" (
        "id" bigserial PRIMARY KEY,
        "vaccine_id" bigint REFERENCES "clinical"."vaccines"("id") ON DELETE CASCADE,
        "dose_no" integer NOT NULL DEFAULT 1,
        "label" text,
        "due_age_months" integer NOT NULL DEFAULT 0,
        "window_months" integer NOT NULL DEFAULT 1,
        "routine" boolean NOT NULL DEFAULT true,
        "notes" text,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" bigint,
        "updated_by" bigint
      );
      CREATE INDEX IF NOT EXISTS "ix_vaccine_schedule_vaccine_id" ON "clinical"."vaccine_schedule" ("vaccine_id");
      CREATE INDEX IF NOT EXISTS "ix_vaccine_schedule_created" ON "clinical"."vaccine_schedule" ("created_at");

      CREATE TABLE IF NOT EXISTS "clinical"."immunizations" (
        "id" bigserial PRIMARY KEY,
        "patient_id" bigint REFERENCES "mpi"."patients"("id"),
        "vaccine_id" bigint REFERENCES "clinical"."vaccines"("id"),
        "dose_no" integer NOT NULL DEFAULT 1,
        "status" text NOT NULL DEFAULT 'Given',
        "given_on" date DEFAULT CURRENT_DATE,
        "source" text NOT NULL DEFAULT 'This centre',
        "batch_no" text,
        "expiry_date" date,
        "site" text,
        "visit_id" bigint REFERENCES "scheduling"."visits"("id"),
        "recorded_by" bigint REFERENCES "auth"."users"("id"),
        "notes" text,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" bigint,
        "updated_by" bigint
      );
      CREATE INDEX IF NOT EXISTS "ix_immunizations_patient_id" ON "clinical"."immunizations" ("patient_id");
      CREATE INDEX IF NOT EXISTS "ix_immunizations_vaccine_id" ON "clinical"."immunizations" ("vaccine_id");
      CREATE INDEX IF NOT EXISTS "ix_immunizations_visit_id" ON "clinical"."immunizations" ("visit_id");
      CREATE INDEX IF NOT EXISTS "ix_immunizations_recorded_by" ON "clinical"."immunizations" ("recorded_by");
      CREATE INDEX IF NOT EXISTS "ix_immunizations_created" ON "clinical"."immunizations" ("created_at");

      CREATE TABLE IF NOT EXISTS "clinical"."growth_measurements" (
        "id" bigserial PRIMARY KEY,
        "patient_id" bigint REFERENCES "mpi"."patients"("id"),
        "measured_on" date DEFAULT CURRENT_DATE,
        "weight_kg" numeric(14,3),
        "height_cm" numeric(14,3),
        "head_circ_cm" numeric(14,3),
        "source" text DEFAULT 'This centre',
        "recorded_by" bigint REFERENCES "auth"."users"("id"),
        "notes" text,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" bigint,
        "updated_by" bigint
      );
      CREATE INDEX IF NOT EXISTS "ix_growth_measurements_patient_id" ON "clinical"."growth_measurements" ("patient_id");
      CREATE INDEX IF NOT EXISTS "ix_growth_measurements_recorded_by" ON "clinical"."growth_measurements" ("recorded_by");
      CREATE INDEX IF NOT EXISTS "ix_growth_measurements_created" ON "clinical"."growth_measurements" ("created_at");
    `);

    // 2. Sync permissions
    for (const [code, description] of reg.allPermissions()) {
      await c.query(`INSERT INTO "auth"."permissions"(code, description) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING`, [code, description]);
    }
    const adminRole = (await c.query(`SELECT id FROM "auth"."roles" WHERE name = 'Super Admin'`)).rows[0];
    if (adminRole) {
      const allPerms = reg.allPermissions().map(([code]) => code);
      await c.query(`
        INSERT INTO "auth"."role_permissions"(role_id, perm_code)
        SELECT $1, unnest($2::text[])
        ON CONFLICT DO NOTHING
      `, [adminRole.id, allPerms]);
    }
  });
  console.log('Paediatric schema and permissions updated successfully.');
  await db.pool.end();
}

migrate().catch(e => {
  console.error('Migration error:', e);
  process.exit(1);
});
