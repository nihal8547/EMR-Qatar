'use strict';
const { Pool, types } = require('pg');

// Return numerics as JS numbers and dates as plain strings (avoids timezone shifting of DATE columns)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1083, (v) => (v ? v.slice(0, 5) : v)); // time HH:MM

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://hms:hms_pass@localhost:5432/qatar_hms',
  max: 10,
});

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Next sequential code, e.g. nextCode(client,'MRN',6) -> MRN-000001 (atomic, per prefix) */
async function nextCode(client, prefix, pad = 6) {
  const { rows } = await client.query(
    `INSERT INTO "admin"."counters"("prefix","value") VALUES ($1,1)
     ON CONFLICT ("prefix") DO UPDATE SET "value" = "admin"."counters"."value" + 1 RETURNING "value"`,
    [prefix],
  );
  return `${prefix}-${String(rows[0].value).padStart(pad, '0')}`;
}

module.exports = { pool, query, tx, nextCode };
