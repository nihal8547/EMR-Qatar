'use strict';
/** Container start-up: wait for PostgreSQL, create tables + seed on first run only. */
const { execFileSync } = require('child_process');
const path = require('path');
const db = require('./db');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (f) => execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: process.env });

(async () => {
  for (let i = 1; ; i += 1) {
    try { await db.query('SELECT 1'); break; } catch (e) {
      if (i >= 40) { console.error('PostgreSQL is not reachable:', e.message); process.exit(1); }
      console.log(`Waiting for PostgreSQL (${i})...`); await sleep(2000);
    }
  }
  const { rows } = await db.query(`SELECT to_regclass('auth.roles') AS t`);
  await db.pool.end();
  if (!rows[0].t) {
    console.log('First start: creating tables and demo data...');
    run('migrate.js');
    run('seed.js');
    if (process.env.CATALOG !== 'false') run('seed_catalog.js');
    if (process.env.DEMO_DATA !== 'false') run('seed_demo.js');
  } else console.log('Database already initialised.');
})().catch((e) => { console.error(e); process.exit(1); });
