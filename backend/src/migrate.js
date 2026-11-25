'use strict';
const { pool } = require('./db');
const { buildDDL } = require('./ddl');
const reg = require('./registry');

async function main() {
  const reset = process.argv.includes('--reset');
  const client = await pool.connect();
  try {
    if (reset) {
      const schemas = new Set(['auth', 'admin']);
      for (const k of reg.order) schemas.add(reg.resources[k].schema);
      for (const s of schemas) await client.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`);
      console.log('Dropped schemas:', [...schemas].join(', '));
    }
    await client.query('BEGIN');
    await client.query(buildDDL());
    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main();
