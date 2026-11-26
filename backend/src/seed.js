'use strict';
/**
 * Seed: permissions, roles, role-permission map, demo users and master/demo data.
 * Run after `npm run db:migrate`.  (npm run db:reset runs both.)
 * DEMO PASSWORD for all demo users: Demo@12345  -- change before any real use.
 */
const bcrypt = require('bcryptjs');
const db = require('./db');
const reg = require('./registry');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';

/* ------------------------------------------------------------------ roles */
const ALL = reg.allPermissions().map(([c]) => c);
const ALLSET = new Set(ALL);
const ACTION_NAMES = (key) => reg.resources[key].actions.map((a) => a.name);

/** spec strings: "key:vced" (view/create/edit/delete), "key:*" (all + actions), "key:v+approve", or a raw permission */
function expand(specs) {
  const out = new Set();
  for (const s of specs) {
    if (!s.includes(':')) { if (!ALLSET.has(s)) throw new Error(`Unknown permission ${s}`); out.add(s); continue; }
    const [key, rest] = s.split(':');
    if (!reg.resources[key]) throw new Error(`Unknown resource ${key} in role spec`);
    if (rest === '*') {
      ['view', 'create', 'edit', 'delete', ...ACTION_NAMES(key)].forEach((a) => out.add(`${key}.${a}`));
      continue;
    }
    const [flags, ...acts] = rest.split('+');
    const m = { v: 'view', c: 'create', e: 'edit', d: 'delete' };
    for (const ch of flags) { if (!m[ch]) throw new Error(`Bad flag ${ch} in ${s}`); out.add(`${key}.${m[ch]}`); }
    for (const a of acts) out.add(`${key}.${a}`);
  }
  for (const p of out) if (!ALLSET.has(p)) throw new Error(`Spec produced unknown permission ${p}`);
  return [...out];
}

const LOOKUPS = ['departments:v', 'specialities:v', 'nationalities:v', 'branches:v', 'templates:v'];

const ROLES = [
  { name: 'Super Admin', description: 'Full access to everything, including role matrix and audit log', restrict: false, discount: 100, perms: ALL },
  {
    name: 'Hospital Manager', description: 'Read-only oversight of every area, approvals, all reports', restrict: false, discount: 20,
    perms: [
      ...reg.order.map((k) => `${k}:v`), 'dashboard.view', 'notify.send', 'pricing.view', 'reports.view', 'reports.finance', 'billing.approve_discount', 'patients.360', 'visits.manage', 'billing.day_close', 'billing.day_reopen', 'day_closes:v',
      'refunds:v+approve+reject', 'bill_cancel_requests:v+approve+reject', 'credit_notes:v+approve', 'discount_approvals:v+approve+reject', 'write_offs:v+approve+reject', 'leaves:v+approve+reject',
      'dental.chart', 'requisitions:v+approve+reject', 'purchase_orders:v+approve+cancel', 'payroll_runs:v+approve', 'users:vced', 'roles:v', 'audit_log:v',
    ],
  },
  {
    name: 'Receptionist', description: 'Registration, appointments, check-in', restrict: false, discount: 5,
    perms: [
      'dashboard.view', 'notify.send', 'visits.start', 'visits.manage', 'walkin.create', 'billing.cashier', 'billing.discount', 'invoices:v', 'payments:v', 'bill_cancel_requests:vc', 'queue.view', 'patients:vce', 'patient_family:vced', 'patient_allergies:v', 'patient_documents:vce', 'consents:vce',
      'appointments:vced', 'doctor_schedules:v', 'visits:ve', 'policy_members:vce', 'payers:v', 'plans:v', 'eligibility_checks:v', 'corporate_accounts:v', 'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'Nurse', description: 'Triage, vitals, nursing notes', restrict: true, discount: 0,
    perms: [
      'dashboard.view', 'queue.view', 'patients:v', 'patient_allergies:vce', 'patient_family:v', 'visits:ve', 'vitals:vce', 'nursing_notes:vce', 'appointments:v',
      'encounters:v', 'diagnoses:v', 'prescriptions:v', 'prescription_items:v', 'procedure_orders:vce', 'patients.360', 'dental.chart', 'dental_chart_entries:v', 'dental_treatment_plans:v', 'dental_plan_items:v', 'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'Doctor', description: 'Consultation, EMR, orders, prescriptions', restrict: true, discount: 0,
    perms: [
      'dashboard.view', 'notify.send', 'pricing.view', 'queue.view', 'consult.use', 'patients.360', 'patients:v', 'patient_allergies:vce', 'patient_family:v', 'patient_documents:v', 'consents:v',
      'appointments:v', 'visits:v', 'vitals:v', 'nursing_notes:v', 'encounters:vce', 'diagnoses:vced', 'diagnosis_codes:v', 'prescriptions:vce', 'prescription_items:vced',
      'procedure_orders:vced', 'certificates:vced', 'referrals:vced', 'lab_orders:v', 'lab_order_items:v', 'lab_tests:v', 'lab_panels:v', 'imaging_orders:v', 'imaging_reports:v',
      'drugs:v', 'drug_interactions:v', 'services:v', 'imaging_modalities:v', 'doctor_schedules:v', 'users:v', ...LOOKUPS,
      'dental.chart', 'dental.complete', 'dental_chart_entries:vced', 'dental_treatment_plans:vce', 'dental_plan_items:vced',
    ],
  },
  {
    name: 'Lab Technician', description: 'Sample collection, results, validation, QC', restrict: false, discount: 0,
    perms: [
      'dashboard.view', 'notify.send', 'lab.work', 'lab.validate', 'patients:v', 'visits:v', 'lab_orders:ve', 'lab_order_items:ve', 'specimens:vce', 'qc_runs:vce', 'analyzers:v',
      'lab_tests:vce', 'lab_panels:vce', 'lab_panel_tests:vced', 'outsourced_labs:vce', 'items:v', 'stock_batches:v', 'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'Radiology Technician', description: 'Imaging worklist and reports', restrict: false, discount: 0,
    perms: ['dashboard.view', 'notify.send', 'radiology.report', 'patients:v', 'visits:v', 'imaging_orders:ve', 'imaging_reports:vce', 'imaging_modalities:v', 'users:v', ...LOOKUPS],
  },
  {
    name: 'Pharmacist', description: 'Dispensing, OTC sales, drug master, pharmacy stock', restrict: false, discount: 0,
    perms: [
      'dashboard.view', 'pricing.view', 'billing.cashier', 'pharmacy.dispense', 'pharmacy.pos', 'pharmacy.stock', 'patients:v', 'visits:v', 'patient_allergies:v', 'prescriptions:v', 'prescription_items:v',
      'drugs:vce', 'drug_interactions:vce', 'pharmacy_dispenses:v', 'dispense_items:v', 'controlled_register:v', 'otc_sales:v', 'otc_sale_items:v',
      'stock_batches:v', 'stock_ledger:v', 'stores:v', 'items:v', 'requisitions:vce', 'requisition_items:vced', 'stock_adjustments:vce', 'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'Store Keeper', description: 'Purchasing, GRN, stock, suppliers', restrict: false, discount: 0,
    perms: [
      'dashboard.view', 'pharmacy.stock', 'drugs:v', 'items:vced', 'suppliers:vced', 'stores:vce', 'stock_batches:v', 'stock_ledger:v', 'requisitions:v',
      'requisition_items:v', 'purchase_orders:vce+cancel', 'po_items:vced', 'grns:vce+post', 'grn_items:vced', 'stock_adjustments:vce+post', 'stock_transfers:vce+post', 'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'Cashier', description: 'Invoices, payments, deposits, refund requests, cashier session', restrict: false, discount: 5,
    perms: [
      'dashboard.view', 'notify.send', 'pricing.view', 'billing.cashier', 'billing.day_close', 'day_closes:v', 'walkin.create', 'billing.discount', 'queue.view', 'patients:v', 'visits:v', 'services:v', 'packages:v', 'package_items:v', 'price_lists:v', 'price_list_items:v',
      'charges:vce', 'invoices:v', 'payments:v', 'deposits:vc', 'refunds:vc', 'credit_notes:vc', 'bill_cancel_requests:v+approve+reject', 'cashier_sessions:v', 'discount_approvals:vc',
      'policy_members:v', 'payers:v', 'plans:v', 'corporate_accounts:v', 'guarantee_letters:v', 'pre_auths:v', 'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'Claims Officer', description: 'Insurance: eligibility, pre-auth, claims, rejections, remittances', restrict: false, discount: 0,
    perms: [
      'dashboard.view', 'pricing.view', 'claims.work', 'claims.submit', 'reports.view', 'reports.finance', 'patients:v', 'visits:v', 'invoices:v', 'charges:v', 'services:v', 'encounters:v', 'diagnoses:v', 'diagnosis_codes:v',
      'payers:vce', 'plans:vce', 'policy_members:vce', 'eligibility_checks:v', 'pre_auths:vce', 'claims:ve', 'claim_lines:vce', 'claim_batches:v', 'rejection_codes:vce', 'rejections:vce',
      'remittances:vce+post', 'remittance_lines:vced', 'corporate_accounts:vce', 'guarantee_letters:vce', 'corporate_payments:vce+apply', 'write_offs:vc', 'price_lists:vce', 'price_list_items:vced',
      'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'Accountant', description: 'Finance: ledger, journals, vendor bills, bank, finance reports', restrict: false, discount: 0,
    perms: [
      'dashboard.view', 'pricing.view', 'pricing.edit', 'reports.view', 'reports.finance', 'billing.day_close', 'day_closes:v', 'invoices:v', 'payments:v', 'refunds:v', 'credit_notes:v', 'cashier_sessions:v', 'claims:v', 'remittances:v', 'write_offs:v',
      'ledger_accounts:vce', 'journals:vce+post', 'journal_lines:vced', 'vendor_bills:vce', 'vendor_payments:vc', 'bank_accounts:vce', 'bank_statement_lines:vced',
      'suppliers:v', 'purchase_orders:v', 'grns:v', 'doctor_revenue_share:vce', 'payslips:v', 'users:v', ...LOOKUPS,
    ],
  },
  {
    name: 'HR Officer', description: 'Employees, rosters, attendance, leave, payroll, assets', restrict: false, discount: 0,
    perms: [
      'dashboard.view', 'employees:vced', 'rosters:vced', 'attendance:vced', 'leaves:vced+approve+reject', 'payroll_runs:vce+generate+approve+markpaid', 'payslips:vce',
      'equipment:vced', 'maintenance_tickets:vced', 'users:v', ...LOOKUPS,
    ],
  },
  { name: 'Patient', description: 'Patient portal login', restrict: true, discount: 0, perms: ['portal.use'] },
];

/* ------------------------------------------------------------------ helpers */
const one = async (c, sql, p) => (await c.query(sql, p)).rows[0];
async function ins(c, table, row) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table}(${cols.map((x) => `"${x}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`;
  return (await c.query(sql, cols.map((k) => row[k]))).rows[0].id;
}

async function main() {
  const pass = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.tx(async (c) => {
    const already = await one(c, `SELECT count(*)::int n FROM "auth"."roles"`);
    if (already.n) throw new Error('Database already seeded. Run `npm run db:reset` to start clean.');

    /* permissions */
    for (const [code, description] of reg.allPermissions()) {
      await c.query(`INSERT INTO "auth"."permissions"(code, description) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING`, [code, description]);
    }
    /* roles */
    const roleId = {};
    for (const r of ROLES) {
      const id = await ins(c, '"auth"."roles"', { name: r.name, description: r.description, restrict_to_own_visits: r.restrict, discount_limit_pct: r.discount });
      roleId[r.name] = id;
      const perms = r.name === 'Super Admin' ? ALL : expand(r.perms);
      await c.query(`INSERT INTO "auth"."role_permissions"(role_id, perm_code) SELECT $1, unnest($2::text[])`, [id, perms]);
    }

    /* admin masters */
    await ins(c, '"admin"."branches"', { name: 'Main Clinic - Doha', code: 'DOH', phone: '+974 4000 0000', address: 'Doha, Qatar', active: true });
    const dept = {};
    for (const [name, code, type] of [
      ['General Medicine', 'GM', 'Clinical'], ['Paediatrics', 'PED', 'Clinical'], ['Obstetrics & Gynaecology', 'OBG', 'Clinical'], ['Dental', 'DEN', 'Clinical'],
      ['Laboratory', 'LAB', 'Diagnostic'], ['Radiology', 'RAD', 'Diagnostic'], ['Pharmacy', 'PHM', 'Support'], ['Front Office', 'FO', 'Administrative'], ['Accounts', 'ACC', 'Administrative'],
    ]) dept[code] = await ins(c, '"admin"."departments"', { name, code, type, active: true });
    const spec = {};
    for (const n of ['General Practice', 'Paediatrics', 'Obstetrics & Gynaecology', 'Dentistry', 'Pathology', 'Radiology']) spec[n] = await ins(c, '"admin"."specialities"', { name: n });
    for (const [name, iso] of [['Qatari', 'QAT'], ['Indian', 'IND'], ['Filipino', 'PHL'], ['Egyptian', 'EGY'], ['Nepalese', 'NPL'], ['Pakistani', 'PAK'], ['Bangladeshi', 'BGD'], ['Sri Lankan', 'LKA'], ['British', 'GBR']]) {
      await ins(c, '"admin"."nationalities"', { name, iso_code: iso });
    }
    for (const [key, value, description] of [
      ['centre_name', 'Al Shifa Medical Centre', 'Name shown on invoices and reports'],
      ['centre_address', 'Doha, State of Qatar', 'Address on invoices'],
      ['centre_phone', '+974 4000 0000', 'Phone on invoices'],
      ['tax_note', 'No VAT is currently charged in Qatar on healthcare services. Confirm with your accountant.', 'Printed on invoices'],
      ['currency', 'QAR', 'Currency'],
      ['n8n_enabled', 'false', 'WhatsApp via n8n: true / false'],
      ['n8n_webhook_base', 'https://n8n.webbea.qa/webhook/hms', 'n8n webhook base URL (the secret goes in env N8N_WEBHOOK_SECRET)'],
      ['public_base_url', 'http://localhost:4000', 'Public URL of this HMS (WhatsApp PDF links point here; must be reachable from the internet)'],
      ['n8n_send_bill_on_complete', 'false', 'Attach the bill to the thank-you message: true / false'],
    ]) await ins(c, '"admin"."settings"', { key, value, description });
    for (const [name, type, mode, notes] of [
      ['Insurer claims gateway', 'Insurer', 'Simulated', 'Simulation only. A real payer adapter must be built per insurer.'],
      ['QHIE-Hub (MOPH)', 'QHIE-Hub', 'Simulated', 'Not connected. Requires MOPH onboarding.'],
      ['Lab analyzer interface', 'Lab analyzer', 'Simulated', 'Not connected. Results are entered manually.'],
      ['PACS', 'PACS', 'Simulated', 'Not connected.'],
    ]) await ins(c, '"admin"."integration_settings"', { name, type, mode, notes, active: true });

    /* users */
    const user = {};
    const U = [
      ['admin', 'System Administrator', 'Super Admin'],
      ['manager', 'Hospital Manager', 'Hospital Manager'],
      ['reception', 'Aisha Reception', 'Receptionist'],
      ['nurse', 'Maria Nurse', 'Nurse'],
      ['drsara', 'Dr. Sara Al-Thani', 'Doctor', 'GM', 'General Practice', 'QTR-GP-1001'],
      ['drravi', 'Dr. Ravi Menon', 'Doctor', 'PED', 'Paediatrics', 'QTR-PD-1002'],
      ['drdental', 'Dr. Layla Haddad', 'Doctor', 'DEN', 'Dentistry', 'QTR-DN-1003'],
      ['lab', 'Lina Lab Technician', 'Lab Technician', 'LAB'],
      ['radiology', 'Omar Radiographer', 'Radiology Technician', 'RAD'],
      ['pharmacist', 'Priya Pharmacist', 'Pharmacist', 'PHM'],
      ['store', 'Hamad Store Keeper', 'Store Keeper', 'PHM'],
      ['cashier', 'Noor Cashier', 'Cashier', 'ACC'],
      ['claims', 'Yusuf Claims Officer', 'Claims Officer', 'ACC'],
      ['accountant', 'Fatima Accountant', 'Accountant', 'ACC'],
      ['hr', 'Nadia HR Officer', 'HR Officer', 'FO'],
    ];
    for (const [username, full_name, role, d, sp, lic] of U) {
      user[username] = await ins(c, '"auth"."users"', {
        username, full_name, email: `${username}@demo.local`, role_id: roleId[role], password_hash: pass,
        department_id: d ? dept[d] : null, speciality_id: sp ? spec[sp] : null, licence_no: lic || null,
        licence_expiry: lic ? '2028-12-31' : null, active: true,
      });
    }
    for (const username of ['drsara', 'drravi', 'drdental']) {
      for (const wd of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']) {
        await ins(c, '"scheduling"."doctor_schedules"', { doctor_id: user[username], weekday: wd, start_time: '08:00', end_time: '14:00', slot_minutes: 15, room: username === 'drsara' ? 'Room 1' : username === 'drravi' ? 'Room 2' : 'Dental 1', active: true });
      }
    }

    /* services */
    const svc = {};
    const S = [
      ['CONS-GP', 'Consultation - General Practitioner', 'Consultation', 'GM', 100, true, false],
      ['CONS-PED', 'Consultation - Paediatrics', 'Consultation', 'PED', 120, true, false],
      ['CONS-FU', 'Follow-up consultation', 'Consultation', 'GM', 50, true, false],
      ['CONS-DENT', 'Consultation - Dentist', 'Consultation', 'DEN', 120, true, false],
      ['DENT-XRAY', 'Dental X-ray (periapical)', 'Dental', 'DEN', 40, true, false],
      ['DENT-SCALE', 'Scaling and polishing', 'Dental', 'DEN', 200, true, false],
      ['DENT-FILL', 'Tooth filling (composite)', 'Dental', 'DEN', 250, true, false],
      ['DENT-RCT', 'Root canal treatment', 'Dental', 'DEN', 900, true, true],
      ['DENT-EXT', 'Tooth extraction (simple)', 'Dental', 'DEN', 200, true, false],
      ['DENT-SURG-EXT', 'Surgical extraction', 'Dental', 'DEN', 600, true, false],
      ['DENT-CROWN', 'Crown (porcelain fused to metal)', 'Dental', 'DEN', 1200, false, false],
      ['DENT-WHITEN', 'Teeth whitening', 'Dental', 'DEN', 800, false, false],
      ['PHARM', 'Pharmacy - dispensed medicines', 'Pharmacy', 'PHM', 0, true, false],
      ['LAB-CBC', 'Complete blood count', 'Lab', 'LAB', 40, true, false],
      ['LAB-GLU', 'Blood glucose (random)', 'Lab', 'LAB', 15, true, false],
      ['LAB-HBA1C', 'HbA1c', 'Lab', 'LAB', 70, true, false],
      ['LAB-CREA', 'Creatinine', 'Lab', 'LAB', 25, true, false],
      ['LAB-LDL', 'LDL cholesterol', 'Lab', 'LAB', 35, true, false],
      ['LAB-TSH', 'Thyroid stimulating hormone', 'Lab', 'LAB', 60, true, false],
      ['RAD-CXR', 'Chest X-ray', 'Radiology', 'RAD', 90, true, false],
      ['RAD-USG-ABD', 'Ultrasound abdomen', 'Radiology', 'RAD', 200, true, false],
      ['RAD-MRI-BRAIN', 'MRI brain', 'Radiology', 'RAD', 1500, true, true],
      ['PROC-DRESS', 'Wound dressing', 'Procedure', 'GM', 60, true, false],
      ['PROC-INJ', 'Injection administration', 'Procedure', 'GM', 20, true, false],
      ['PROC-ECG', 'ECG', 'Procedure', 'GM', 80, true, false],
      ['OTHER-CERT', 'Medical certificate', 'Other', 'GM', 50, false, false],
    ];
    for (const [code, name, category, d, price, covered, needs_preauth] of S) {
      svc[code] = await ins(c, '"billing"."services"', { code, name, category, department_id: dept[d], price, covered, needs_preauth, taxable: false, active: true });
    }

    /* lab tests */
    for (const [code, name, sample, unit, lo, hi, clo, chi, tat, sv] of [
      ['CBC-HB', 'Haemoglobin', 'Blood', 'g/dL', 12, 17, 7, 20, 2, 'LAB-CBC'],
      ['GLU-R', 'Glucose (random)', 'Serum', 'mg/dL', 70, 140, 40, 400, 1, 'LAB-GLU'],
      ['HBA1C', 'HbA1c', 'Blood', '%', 4, 5.6, null, 12, 4, 'LAB-HBA1C'],
      ['CREA', 'Creatinine', 'Serum', 'mg/dL', 0.6, 1.3, null, 5, 2, 'LAB-CREA'],
      ['LDL', 'LDL cholesterol', 'Serum', 'mg/dL', 0, 130, null, null, 4, 'LAB-LDL'],
      ['TSH', 'TSH', 'Serum', 'mIU/L', 0.4, 4.0, 0.01, 50, 6, 'LAB-TSH'],
    ]) {
      await ins(c, '"lab"."lab_tests"', { code, name, service_id: svc[sv], sample_type: sample, unit, ref_low: lo, ref_high: hi, critical_low: clo, critical_high: chi, tat_hours: tat, outsourced: false, active: true });
    }
    await ins(c, '"radiology"."imaging_modalities"', { name: 'X-Ray', code: 'XR', room: 'Rad 1', active: true });
    await ins(c, '"radiology"."imaging_modalities"', { name: 'Ultrasound', code: 'US', room: 'Rad 2', active: true });

    /* ICD-10 (sample) */
    for (const [code, description] of [
      ['J06.9', 'Acute upper respiratory infection, unspecified'], ['E11.9', 'Type 2 diabetes mellitus without complications'], ['I10', 'Essential (primary) hypertension'],
      ['K29.7', 'Gastritis, unspecified'], ['M54.5', 'Low back pain'], ['R50.9', 'Fever, unspecified'], ['A09', 'Infectious gastroenteritis and colitis'],
      ['J45.9', 'Asthma, unspecified'], ['N39.0', 'Urinary tract infection, site not specified'], ['Z00.0', 'General medical examination'],
    ]) await ins(c, '"clinical"."diagnosis_codes"', { code, description, code_system: 'ICD-10', active: true });

    /* pharmacy */
    const store = await ins(c, '"inventory"."stores"', { name: 'Main Pharmacy', type: 'Pharmacy', location: 'Ground floor', active: true });
    await ins(c, '"inventory"."stores"', { name: 'Central Store', type: 'Main store', location: 'Basement', active: true });
    const drug = {};
    const D = [
      ['PARA500', 'Paracetamol', 'Panadol', 'Tablet', '500 mg', 'Normal', 0.5, 200, false],
      ['AMOX500', 'Amoxicillin', 'Amoxil', 'Capsule', '500 mg', 'Normal', 2.0, 100, true],
      ['IBU400', 'Ibuprofen', 'Brufen', 'Tablet', '400 mg', 'Normal', 1.0, 100, false],
      ['WARF5', 'Warfarin', 'Marevan', 'Tablet', '5 mg', 'Normal', 1.5, 30, true],
      ['METF500', 'Metformin', 'Glucophage', 'Tablet', '500 mg', 'Normal', 0.8, 100, true],
      ['OMEP20', 'Omeprazole', 'Losec', 'Capsule', '20 mg', 'Normal', 1.2, 60, false],
      ['SALB', 'Salbutamol', 'Ventolin', 'Inhaler', '100 mcg', 'Normal', 18, 20, true],
      ['MORPH10', 'Morphine', 'MST', 'Tablet', '10 mg', 'Narcotic', 6, 20, true],
    ];
    for (const [code, generic_name, brand_name, form, strength, schedule, price, reorder_level, rx] of D) {
      drug[code] = await ins(c, '"pharmacy"."drugs"', { code, generic_name, brand_name, form, strength, unit: form === 'Inhaler' ? 'inhaler' : 'unit', schedule, price, reorder_level, requires_prescription: rx, active: true });
    }
    await ins(c, '"pharmacy"."drug_interactions"', { drug_a_id: drug.WARF5, drug_b_id: drug.IBU400, severity: 'Major', note: 'Increased bleeding risk' });
    await ins(c, '"pharmacy"."drug_interactions"', { drug_a_id: drug.WARF5, drug_b_id: drug.AMOX500, severity: 'Moderate', note: 'May increase INR' });
    const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 2);
    const soon = new Date(); soon.setDate(soon.getDate() + 45);
    for (const [code, qty, cost] of [['PARA500', 1000, 0.2], ['AMOX500', 500, 0.9], ['IBU400', 500, 0.4], ['WARF5', 100, 0.6], ['METF500', 600, 0.3], ['OMEP20', 300, 0.5], ['SALB', 40, 12], ['MORPH10', 50, 3.5]]) {
      const bid = await ins(c, '"inventory"."stock_batches"', {
        store_id: store, drug_id: drug[code], batch_no: `B-${code}-01`, expiry_date: nextYear.toISOString().slice(0, 10), qty_on_hand: qty, cost_price: cost, received_on: new Date().toISOString().slice(0, 10),
      });
      await ins(c, '"inventory"."stock_ledger"', { store_id: store, drug_id: drug[code], batch_id: bid, movement: 'Opening stock', qty, ref_no: 'OPENING', moved_by: user.admin, moved_at: new Date() });
    }
    // a near-expiry batch to demonstrate FEFO and expiry alerts
    const nb = await ins(c, '"inventory"."stock_batches"', { store_id: store, drug_id: drug.PARA500, batch_no: 'B-PARA500-OLD', expiry_date: soon.toISOString().slice(0, 10), qty_on_hand: 100, cost_price: 0.2, received_on: new Date().toISOString().slice(0, 10) });
    await ins(c, '"inventory"."stock_ledger"', { store_id: store, drug_id: drug.PARA500, batch_id: nb, movement: 'Opening stock', qty: 100, ref_no: 'OPENING', moved_by: user.admin, moved_at: new Date() });
    await ins(c, '"inventory"."suppliers"', { name: 'Gulf Medical Supplies', phone: '+974 4400 0001', email: 'sales@gms.demo', active: true });

    /* insurance */
    const payerA = await ins(c, '"insurance"."payers"', { name: 'Gulf Demo Insurance', code: 'GDI', type: 'Insurer', credit_days: 60, claim_format: 'Manual', active: true });
    const payerB = await ins(c, '"insurance"."payers"', { name: 'Doha Demo TPA', code: 'DTPA', type: 'TPA', credit_days: 45, claim_format: 'Manual', active: true });
    const planA = await ins(c, '"insurance"."plans"', { payer_id: payerA, name: 'Gold', copay_pct: 10, copay_max: 100, annual_limit: 100000, network: 'Tier 1', active: true });
    await ins(c, '"insurance"."plans"', { payer_id: payerB, name: 'Basic', copay_pct: 20, copay_max: 50, annual_limit: 20000, network: 'Tier 2', active: true });
    await ins(c, '"billing"."price_lists"', { name: 'Gulf Demo Insurance tariff', payer_id: payerA, discount_pct: 0, active: true });
    for (const [code, description, category] of [
      ['AUTH-01', 'Pre-authorisation missing or expired', 'Authorization'], ['ELIG-01', 'Member not eligible on date of service', 'Eligibility'],
      ['COD-01', 'Diagnosis code missing or invalid', 'Coding'], ['DUP-01', 'Duplicate claim', 'Duplicate'], ['DOC-01', 'Supporting documents missing', 'Documentation'],
    ]) await ins(c, '"insurance"."rejection_codes"', { code, description, category });

    /* finance */
    for (const [code, name, type] of [
      ['1000', 'Cash in hand', 'Asset'], ['1100', 'Bank', 'Asset'], ['1200', 'Insurance receivables', 'Asset'], ['1300', 'Inventory', 'Asset'],
      ['2000', 'Accounts payable', 'Liability'], ['4000', 'Patient revenue', 'Income'], ['4100', 'Insurance revenue', 'Income'], ['5000', 'Cost of medicines', 'Expense'], ['5100', 'Salaries', 'Expense'],
    ]) await ins(c, '"finance"."ledger_accounts"', { code, name, type, active: true });

    /* demo patients */
    const P = [
      ['MRN-DEMO-1', '29012345678', 'Mohammed Al-Kuwari', 'Male', '1990-03-14', 'Qatari', '+974 5500 1001', 'O+'],
      ['MRN-DEMO-2', '28512345679', 'Anita Nair', 'Female', '1985-07-22', 'Indian', '+974 5500 1002', 'B+'],
      ['MRN-DEMO-3', '30012345680', 'Joseph Santos', 'Male', '2000-11-05', 'Filipino', '+974 5500 1003', 'A+'],
    ];
    const patient = [];
    for (const [, qid, full_name, gender, dob, nat, phone, bg] of P) {
      const nid = (await one(c, `SELECT id FROM "admin"."nationalities" WHERE name=$1`, [nat])).id;
      const mrn = await db.nextCode(c, 'MRN', 6);
      patient.push(await ins(c, '"mpi"."patients"', { mrn, qid, full_name, gender, dob, nationality_id: nid, phone, blood_group: bg, language: 'English', active: true }));
    }
    await ins(c, '"mpi"."consents"', { patient_id: patient[0], consent_type: 'Data processing (PDPPL)', signed_at: new Date(), version: '1.0', withdrawn: false });
    await ins(c, '"insurance"."policy_members"', {
      patient_id: patient[1], payer_id: payerA, plan_id: planA, policy_no: 'GDI-2026-001', member_id: 'M-1002', relation: 'Self', valid_from: '2026-01-01', valid_to: '2026-12-31', status: 'Active',
    });
    await ins(c, '"mpi"."patient_allergies"', { patient_id: patient[2], allergen: 'Penicillin', reaction: 'Rash', severity: 'Moderate', noted_on: new Date().toISOString().slice(0, 10) });

    // demo dental chart + plan for Mohammed
    const dd = user.drdental;
    for (const [tooth, surface, condition, note] of [['16', 'Whole tooth', 'Caries', 'Deep occlusal caries'], ['26', 'O', 'Filling', null], ['36', 'Whole tooth', 'Root canal', null], ['18', 'Whole tooth', 'Impacted', 'Mesio-angular'], ['46', 'Whole tooth', 'Missing', null], ['21', 'Whole tooth', 'Crown', null]]) {
      await ins(c, '"dental"."dental_chart_entries"', { patient_id: patient[0], dentition: 'Permanent', tooth_no: tooth, surface, condition, entry_date: new Date().toISOString().slice(0, 10), recorded_by: dd, notes: note });
    }
    const dplan = await ins(c, '"dental"."dental_treatment_plans"', { plan_no: await db.nextCode(c, 'DTP', 5), patient_id: patient[0], doctor_id: dd, plan_date: new Date().toISOString().slice(0, 10), status: 'Accepted', total: 1050, notes: 'Restore 16, then scale and polish' });
    await ins(c, '"dental"."dental_plan_items"', { plan_id: dplan, dentition: 'Permanent', tooth_no: '16', surface: 'MOD', service_id: svc['DENT-FILL'], fee: 250, status: 'Planned' });
    await ins(c, '"dental"."dental_plan_items"', { plan_id: dplan, dentition: 'Permanent', tooth_no: '18', surface: 'Whole tooth', service_id: svc['DENT-SURG-EXT'], fee: 600, status: 'Planned' });
    await ins(c, '"dental"."dental_plan_items"', { plan_id: dplan, dentition: 'Permanent', tooth_no: null, surface: 'Whole tooth', service_id: svc['DENT-SCALE'], fee: 200, status: 'Planned' });

    // patient portal login linked to Mohammed
    await ins(c, '"auth"."users"', { username: 'patient', full_name: 'Mohammed Al-Kuwari', email: 'patient@demo.local', role_id: roleId.Patient, password_hash: pass, patient_id: patient[0], active: true });
  });
  console.log(`Seed complete. Demo password for every user: ${DEMO_PASSWORD}`);
  console.log('Users: admin, manager, reception, nurse, drsara, drravi, drdental, lab, radiology, pharmacist, store, cashier, claims, accountant, hr, patient');
}

main().then(() => db.pool.end()).catch((e) => { console.error(e.message); process.exit(1); });
