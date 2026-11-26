'use strict';
/**
 * Loads the default Qatar catalogue: drugs, lab tests, radiology, procedures, dental, vaccines, ICD-10 diagnoses.
 * Safe to run any time: existing rows (same code / same drug) are skipped, nothing is overwritten.
 *   npm run db:catalog        (also runs automatically after seed on first start; set CATALOG=false to skip)
 * Prices are indicative QAR defaults. Review them in Billing > Service Master and Pharmacy > Drug Master before go-live.
 */
const db = require('./db');
const DRUGS = require('./catalog/drugs');
const { LAB, RAD, OTHER } = require('./catalog/services');
const DX = require('./catalog/diagnoses');

const n = (v) => (v === '-' || v === '' || v === undefined ? null : Number(v));
const FORM_UNIT = { Tablet: 'tab', Capsule: 'cap', Syrup: 'bottle', Injection: 'vial', Cream: 'tube', Drops: 'bottle', Inhaler: 'inhaler', Other: 'unit' };
const SCHED = { C: 'Controlled', N: 'Narcotic' };

async function loadCatalog(c) {
  const out = { drugs: 0, lab_tests: 0, radiology: 0, services: 0, diagnoses: 0 };
  const dept = {};
  for (const r of (await c.query(`SELECT id, code FROM "admin"."departments" WHERE is_deleted=false`)).rows) dept[r.code] = r.id;
  const svcId = async (code) => (await c.query(`SELECT id FROM "billing"."services" WHERE code=$1 AND is_deleted=false`, [code])).rows[0]?.id;
  const addSvc = async (code, name, category, d, price, covered, preauth) => {
    const r = await c.query(
      `INSERT INTO "billing"."services"(code,name,category,department_id,price,covered,needs_preauth,taxable,active) VALUES ($1,$2,$3,$4,$5,$6,$7,false,true) ON CONFLICT DO NOTHING RETURNING id`,
      [code, name, category, dept[d] || null, price, covered, preauth]);
    if (r.rowCount) { out.services++; return r.rows[0].id; }
    return svcId(code);
  };

  // consultations, procedures, dental, vaccines, certificates
  for (const l of OTHER) {
    const [code, name, category, d, price, covered, preauth] = l.split('|');
    await addSvc(code, name, category, d, Number(price), covered === '1', preauth === '1');
  }

  // lab: billing service + test catalogue row
  for (const l of LAB) {
    const [code, name, sample, unit, lo, hi, clo, chi, tat, price] = l.split('|');
    if ((await c.query(`SELECT 1 FROM "lab"."lab_tests" WHERE code=$1`, [code])).rowCount) continue;
    const sid = await addSvc(`LAB-${code}`, name, 'Lab', 'LAB', Number(price), true, false);
    const r = await c.query(
      `INSERT INTO "lab"."lab_tests"(code,name,service_id,sample_type,unit,ref_low,ref_high,critical_low,critical_high,tat_hours,outsourced,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,true) ON CONFLICT DO NOTHING`,
      [code, name, sid, sample, unit === '-' ? null : unit, n(lo), n(hi), n(clo), n(chi), n(tat)]);
    out.lab_tests += r.rowCount;
  }

  // radiology: modalities + billing services
  const MOD = { XR: ['X-Ray', 'Rad 1'], US: ['Ultrasound', 'Rad 2'], CT: ['CT Scan', 'Rad 3'], MRI: ['MRI', 'Rad 4'], MG: ['Mammography', 'Rad 5'], DX: ['Bone Densitometry (DEXA)', 'Rad 5'] };
  for (const [code, [name, room]] of Object.entries(MOD)) {
    if (!(await c.query(`SELECT 1 FROM "radiology"."imaging_modalities" WHERE code=$1`, [code])).rowCount) {
      await c.query(`INSERT INTO "radiology"."imaging_modalities"(name,code,room,active) VALUES ($1,$2,$3,true)`, [name, code, room]);
    }
  }
  for (const l of RAD) {
    const [code, name, , price, pre] = l.split('|');
    const id = await addSvc(code, name, 'Radiology', 'RAD', Number(price), true, pre === '1');
    if (id) out.radiology++;
  }

  // drugs (skip when the same generic + strength + form already exists)
  const used = new Set((await c.query(`SELECT code FROM "pharmacy"."drugs"`)).rows.map((r) => r.code));
  for (const l of DRUGS) {
    const [generic, brand, form, strength, price, rx, sch] = l.split('|');
    const dup = await c.query(`SELECT 1 FROM "pharmacy"."drugs" WHERE lower(generic_name)=lower($1) AND lower(coalesce(strength,''))=lower($2) AND form=$3 AND is_deleted=false`, [generic, strength, form]);
    if (dup.rowCount) continue;
    const base = (generic.replace(/[^A-Za-z]/g, '').slice(0, 5) + (strength.match(/\d+(\.\d+)?/) || [''])[0].replace('.', '') + form[0]).toUpperCase();
    let code = base, i = 1; while (used.has(code)) code = `${base}${++i}`; used.add(code);
    await c.query(
      `INSERT INTO "pharmacy"."drugs"(code,generic_name,brand_name,form,strength,unit,schedule,price,reorder_level,requires_prescription,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
      [code, generic, brand, form, strength, FORM_UNIT[form] || 'unit', SCHED[sch] || 'Normal', Number(price), sch ? 20 : 20, rx === '1']);
    out.drugs++;
  }

  // diagnoses
  for (const l of DX) {
    const i = l.indexOf('|');
    const r = await c.query(`INSERT INTO "clinical"."diagnosis_codes"(code,description,code_system,active) VALUES ($1,$2,'ICD-10',true) ON CONFLICT DO NOTHING`, [l.slice(0, i), l.slice(i + 1)]);
    out.diagnoses += r.rowCount;
  }
  return out;
}

module.exports = { loadCatalog };

if (require.main === module) {
  (async () => {
    await db.assertDedicatedDb();
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await loadCatalog(c);
      await c.query('COMMIT');
      console.log(`Catalogue loaded: ${r.drugs} drugs, ${r.lab_tests} lab tests, ${r.radiology} imaging services, ${r.services} new billing services, ${r.diagnoses} diagnosis codes.`);
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await db.pool.end(); }
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
