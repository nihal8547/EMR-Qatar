'use strict';
const { parseField, titleCase } = require('./dsl');

/* ---------- Modules (sidebar groups) ---------- */
const MODULES = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'front', label: 'Front Office', icon: '🧾', schema: 'mpi' },
  { key: 'clinical', label: 'Clinical (OPD / EMR)', icon: '🩺', schema: 'clinical' },
  { key: 'lab', label: 'Laboratory', icon: '🧪', schema: 'lab' },
  { key: 'radiology', label: 'Radiology', icon: '🩻', schema: 'radiology' },
  { key: 'pharmacy', label: 'Pharmacy', icon: '💊', schema: 'pharmacy' },
  { key: 'inventory', label: 'Inventory & Purchase', icon: '📦', schema: 'inventory' },
  { key: 'billing', label: 'Billing & Cashier', icon: '💳', schema: 'billing' },
  { key: 'insurance', label: 'Insurance & Credit', icon: '🛡️', schema: 'insurance' },
  { key: 'finance', label: 'Accounts & Finance', icon: '📒', schema: 'finance' },
  { key: 'hr', label: 'HR & Payroll', icon: '👥', schema: 'hr' },
  { key: 'assets', label: 'Assets & Maintenance', icon: '🛠️', schema: 'assets' },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'admin', label: 'Administration', icon: '⚙️', schema: 'admin' },
  { key: 'portal', label: 'Patient Portal', icon: '🙋' },
];

/* ---------- Custom (non-CRUD) pages that also show in the sidebar ---------- */
const CUSTOM_PAGES = [
  { module: 'dashboard', label: 'Dashboard', to: '/', perm: 'dashboard.view' },
  { module: 'front', label: 'Start Visit (Check-in)', to: '/visit-start', perm: 'visits.start' },
  { module: 'front', label: 'Queue Board', to: '/queue', perm: 'queue.view' },
  { module: 'clinical', label: 'My Consultations', to: '/consult', perm: 'consult.use' },
  { module: 'lab', label: 'Lab Worklist', to: '/lab-worklist', perm: 'lab.work' },
  { module: 'pharmacy', label: 'Dispensing Queue', to: '/pharmacy-queue', perm: 'pharmacy.dispense' },
  { module: 'pharmacy', label: 'OTC Point of Sale', to: '/pharmacy-pos', perm: 'pharmacy.pos' },
  { module: 'pharmacy', label: 'Stock & Expiry', to: '/pharmacy-stock', perm: 'pharmacy.stock' },
  { module: 'billing', label: 'Cashier Desk', to: '/cashier', perm: 'billing.cashier' },
  { module: 'insurance', label: 'Claims Workbench', to: '/claims-workbench', perm: 'claims.work' },
  { module: 'reports', label: 'All Reports', to: '/reports', perm: 'reports.view' },
  { module: 'admin', label: 'Role & Permission Matrix', to: '/admin-roles', perm: 'admin.roles' },
  { module: 'portal', label: 'My Portal', to: '/portal', perm: 'portal.use' },
];

/* Permissions that are not tied to a CRUD resource */
const EXTRA_PERMISSIONS = [
  ['dashboard.view', 'View dashboard'],
  ['visits.start', 'Start / check-in a visit'],
  ['queue.view', 'View queue board'],
  ['consult.use', 'Use doctor consultation screen'],
  ['patients.360', 'Open Patient 360 view'],
  ['lab.work', 'Lab worklist: collect samples and enter results'],
  ['lab.validate', 'Lab: validate and release results'],
  ['radiology.report', 'Radiology: write reports'],
  ['pharmacy.dispense', 'Pharmacy: dispense prescriptions'],
  ['pharmacy.pos', 'Pharmacy: OTC sales'],
  ['pharmacy.stock', 'Pharmacy: stock and expiry view'],
  ['billing.cashier', 'Cashier: invoices, payments, session'],
  ['billing.discount', 'Billing: give discount up to own limit'],
  ['billing.approve_discount', 'Billing: approve any discount'],
  ['claims.work', 'Claims workbench'],
  ['claims.submit', 'Submit claims to payers'],
  ['reports.view', 'View operational reports'],
  ['reports.finance', 'View finance reports'],
  ['admin.roles', 'Manage role permission matrix'],
  ['portal.use', 'Patient portal access'],
];

const resources = {};
const order = [];

function R(key, module, label, fieldSpecs, opts = {}) {
  if (resources[key]) throw new Error(`Duplicate resource ${key}`);
  const mod = MODULES.find((m) => m.key === module);
  if (!mod) throw new Error(`Unknown module ${module} for ${key}`);
  const schema = opts.schema || mod.schema;
  if (!schema) throw new Error(`Module ${module} has no schema; give opts.schema for ${key}`);
  const fields = fieldSpecs.map(parseField);
  const names = new Set();
  for (const f of fields) {
    if (names.has(f.name)) throw new Error(`Duplicate field ${f.name} in ${key}`);
    names.add(f.name);
  }
  const res = {
    key,
    module,
    schema,
    table: opts.table || key,
    label,
    singular: opts.singular || label.replace(/ies$/, 'y').replace(/s$/, ''),
    fields,
    disp: opts.disp || null,
    children: (opts.children || []).map(([res, fk, clabel]) => ({ res, fk, label: clabel || null })),
    actions: (opts.actions || []).map((a) => ({ perm: `${key}.${a.name}`, ...a })),
    noCreate: !!opts.noCreate || !!opts.readonly,
    noEdit: !!opts.noEdit || !!opts.readonly,
    noDelete: !!opts.noDelete || !!opts.readonly,
    menu: opts.menu !== false,
    hooks: opts.hooks || {},
    fromVisit: !!opts.fromVisit,
    orderBy: opts.orderBy || '"id" DESC',
    hardDelete: !!opts.hardDelete,
    alias: opts.alias || null,
    help: opts.help || null,
  };
  resources[key] = res;
  order.push(key);
  return res;
}

/* Alias resources: a lookup-only view of another table (e.g. "doctors" = users with role Doctor) */
function Alias(key, of, where, label) {
  resources[key] = { key, alias: { of, where }, label, isAlias: true };
}

/* ---------- Load definitions ---------- */
require('./defs_admin')(R, Alias);
require('./defs_front_clinical')(R, Alias);
require('./defs_diagnostics')(R, Alias);
require('./defs_pharmacy_inventory')(R, Alias);
require('./defs_billing_insurance')(R, Alias);
require('./defs_finance_hr_assets')(R, Alias);

/* ---------- Post-process / validate ---------- */
const STD = ['id', 'is_deleted', 'created_at', 'updated_at', 'created_by', 'updated_by'];

for (const key of order) {
  const r = resources[key];
  const fieldNames = new Set(r.fields.map((f) => f.name));
  for (const s of STD) if (fieldNames.has(s)) throw new Error(`${key}: reserved field ${s}`);
  for (const f of r.fields) {
    if (f.type === 'ref' && !resources[f.ref]) throw new Error(`${key}.${f.name}: unknown ref "${f.ref}"`);
  }
  if (r.disp) for (const d of r.disp) if (d !== 'id' && !fieldNames.has(d)) throw new Error(`${key}: disp field ${d} missing`);
  if (!r.disp) {
    const guess = ['name', 'full_name', 'title', 'code', 'invoice_no', 'visit_no', 'order_no', 'claim_no', 'generic_name', 'username']
      .find((n) => fieldNames.has(n));
    r.disp = guess ? [guess] : ['id'];
  }
  for (const c of r.children) {
    const cr = resources[c.res];
    if (!cr) throw new Error(`${key}: unknown child ${c.res}`);
    if (!cr.fields.some((f) => f.name === c.fk)) throw new Error(`${key}: child ${c.res} lacks fk ${c.fk}`);
    if (!c.label) c.label = cr.label;
  }
}

/** Resolve a ref target to the real resource (follows aliases). */
function target(refKey) {
  const t = resources[refKey];
  if (!t) return null;
  return t.isAlias ? resources[t.alias.of] : t;
}

/* ---------- Permissions ---------- */
function allPermissions() {
  const out = [];
  for (const key of order) {
    const r = resources[key];
    out.push([`${key}.view`, `${r.label}: view`]);
    out.push([`${key}.create`, `${r.label}: create`]);
    out.push([`${key}.edit`, `${r.label}: edit`]);
    out.push([`${key}.delete`, `${r.label}: delete`]);
    for (const a of r.actions) out.push([a.perm, `${r.label}: ${a.label || a.name}`]);
  }
  for (const p of EXTRA_PERMISSIONS) out.push(p);
  return out;
}

/* ---------- Menu ---------- */
function buildMenu(hasPerm) {
  const groups = [];
  for (const m of MODULES) {
    const items = [];
    for (const p of CUSTOM_PAGES.filter((c) => c.module === m.key)) {
      if (hasPerm(p.perm)) items.push({ label: p.label, to: p.to });
    }
    for (const key of order) {
      const r = resources[key];
      if (r.module !== m.key || !r.menu) continue;
      if (hasPerm(`${key}.view`)) items.push({ label: r.label, to: `/r/${key}` });
    }
    if (items.length) groups.push({ key: m.key, label: m.label, icon: m.icon, items });
  }
  return groups;
}

/* ---------- Public meta (sent to the browser) ---------- */
function publicField(f) {
  return {
    name: f.name, type: f.type, label: f.label, options: f.options, ref: f.ref,
    required: f.required, list: f.list, search: f.search, readonly: f.readonly,
    hidden: f.hidden || f.secret, unique: f.unique, filter: f.filter, def: f.def, auto: !!f.auto,
  };
}
function publicResource(r) {
  return {
    key: r.key, label: r.label, singular: r.singular, module: r.module,
    fields: r.fields.filter((f) => !f.secret).map(publicField),
    children: r.children, actions: r.actions.map(({ name, label, perm, confirm }) => ({ name, label: label || titleCase(name), perm, confirm: !!confirm })),
    noCreate: r.noCreate, noEdit: r.noEdit, noDelete: r.noDelete, help: r.help,
  };
}

module.exports = { MODULES, CUSTOM_PAGES, EXTRA_PERMISSIONS, resources, order, target, allPermissions, buildMenu, publicResource };
