'use strict';
/** Dashboard + reports */
const express = require('express');
const db = require('../db');
const { wrap, bad, notFound, need, can, today } = require('../lib');

const router = express.Router();

/* ---------------------------------------------------------------- Dashboard */
router.get('/dashboard', need('dashboard.view'), wrap(async (req, res) => {
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const out = { cards: [], lists: {} };
  const add = (key, label, value, perm, fmt) => { if (!perm || can(req, perm)) out.cards.push({ key, label, value, fmt: fmt || 'int' }); };

  const v = await one(
    `SELECT count(*) FILTER (WHERE visit_date=CURRENT_DATE AND status<>'Cancelled')::int today,
            count(*) FILTER (WHERE status IN ('Registered','Triage'))::int waiting,
            count(*) FILTER (WHERE status='With Doctor')::int with_doctor
       FROM "scheduling"."visits" WHERE is_deleted=false`);
  add('visits_today', 'Visits today', v.today, 'visits.view');
  add('waiting', 'Waiting (reg / triage)', v.waiting, 'queue.view');
  add('with_doctor', 'With doctor', v.with_doctor, 'queue.view');

  const a = await one(`SELECT count(*)::int n FROM "scheduling"."appointments" WHERE appt_date=CURRENT_DATE AND status IN ('Booked','Confirmed') AND is_deleted=false`);
  add('appts_today', 'Appointments today', a.n, 'appointments.view');

  const c = await one(
    `SELECT COALESCE(SUM(CASE WHEN kind='Payment' THEN amount ELSE -amount END),0) AS net
       FROM "billing"."payments" WHERE paid_at::date=CURRENT_DATE AND is_deleted=false`);
  add('collected_today', 'Collected today (QAR)', Number(c.net), 'invoices.view', 'money');

  const o = await one(`SELECT COALESCE(SUM(balance),0) bal, count(*)::int n FROM "billing"."invoices" WHERE status IN ('Unpaid','Partially Paid') AND is_deleted=false`);
  add('patient_due', 'Patient dues (QAR)', Number(o.bal), 'invoices.view', 'money');

  const l = await one(`SELECT count(*) FILTER (WHERE status IN ('Ordered','Collected','In Progress'))::int pending FROM "lab"."lab_orders" WHERE is_deleted=false`);
  add('lab_pending', 'Lab orders pending', l.pending, 'lab.work');
  const crit = await one(`SELECT count(*)::int n FROM "lab"."lab_order_items" WHERE flag IN ('Critical High','Critical Low') AND status='Resulted' AND is_deleted=false`);
  add('lab_critical', 'Critical results awaiting action', crit.n, 'lab.work');

  const r = await one(`SELECT count(*)::int n FROM "radiology"."imaging_orders" WHERE status IN ('Ordered','Scheduled','In Progress') AND is_deleted=false`);
  add('imaging_pending', 'Imaging pending', r.n, 'imaging_orders.view');

  const ph = await one(`SELECT count(*)::int n FROM "clinical"."prescriptions" WHERE status IN ('Pending','Partially Dispensed') AND is_deleted=false`);
  add('rx_pending', 'Prescriptions to dispense', ph.n, 'pharmacy.dispense');

  const exp = await one(`SELECT count(*)::int n FROM "inventory"."stock_batches" WHERE qty_on_hand>0 AND expiry_date <= CURRENT_DATE + 90 AND is_deleted=false`);
  add('expiring', 'Batches expiring within 90 days', exp.n, 'pharmacy.stock');
  const low = await one(
    `SELECT count(*)::int n FROM "pharmacy"."drugs" d WHERE d.active AND d.is_deleted=false AND d.reorder_level IS NOT NULL
        AND COALESCE((SELECT SUM(b.qty_on_hand) FROM "inventory"."stock_batches" b WHERE b.drug_id=d.id AND b.is_deleted=false AND b.expiry_date >= CURRENT_DATE),0) <= d.reorder_level`);
  add('low_stock', 'Drugs at / below reorder level', low.n, 'pharmacy.stock');

  const cl = await one(
    `SELECT count(*) FILTER (WHERE status IN ('Draft','Scrub Failed','Ready'))::int to_do,
            count(*) FILTER (WHERE status IN ('Submitted','Accepted','Partially Paid'))::int in_flight,
            COALESCE(SUM(amount-paid_amount) FILTER (WHERE status IN ('Submitted','Accepted','Partially Paid')),0) AS outstanding,
            count(*) FILTER (WHERE status='Rejected')::int rejected
       FROM "insurance"."claims" WHERE is_deleted=false`);
  add('claims_todo', 'Claims to prepare', cl.to_do, 'claims.work');
  add('claims_out', 'Claims outstanding (QAR)', Number(cl.outstanding), 'claims.work', 'money');
  add('claims_rej', 'Rejected claims', cl.rejected, 'claims.work');

  if (can(req, 'visits.view')) {
    out.lists.recent_visits = (await db.query(
      `SELECT v.id, v.visit_no, v.status, p.full_name, p.mrn, d.full_name AS doctor
         FROM "scheduling"."visits" v JOIN "mpi"."patients" p ON p.id=v.patient_id LEFT JOIN "auth"."users" d ON d.id=v.doctor_id
        WHERE v.is_deleted=false ORDER BY v.id DESC LIMIT 8`)).rows;
  }
  if (can(req, 'invoices.view')) {
    out.lists.revenue_7d = (await db.query(
      `SELECT to_char(d::date,'YYYY-MM-DD') AS day, COALESCE(SUM(CASE WHEN p.kind='Payment' THEN p.amount ELSE -p.amount END),0) AS amount
         FROM generate_series(CURRENT_DATE-6, CURRENT_DATE, '1 day') d
         LEFT JOIN "billing"."payments" p ON p.paid_at::date=d::date AND p.is_deleted=false
        GROUP BY d ORDER BY d`)).rows;
  }
  res.json(out);
}));

/* ---------------------------------------------------------------- Reports */
// Each report: perm, params (from/to), SQL using $1=from, $2=to. Columns [key,label,type]
const REPORTS = {
  revenue_by_category: {
    title: 'Revenue by service category', perm: 'reports.finance', dated: true,
    cols: [['category', 'Category'], ['lines', 'Lines', 'int'], ['gross', 'Gross (QAR)', 'money']],
    sql: `SELECT s.category, count(*)::int lines, COALESCE(SUM(c.amount),0) gross
            FROM "billing"."charges" c JOIN "billing"."services" s ON s.id=c.service_id JOIN "billing"."invoices" i ON i.id=c.invoice_id
           WHERE c.is_deleted=false AND c.status <> 'Cancelled' AND i.status <> 'Cancelled' AND i.invoice_date BETWEEN $1 AND $2
           GROUP BY s.category ORDER BY gross DESC`,
  },
  collections_by_method: {
    title: 'Collections by payment method', perm: 'reports.finance', dated: true,
    cols: [['method', 'Method'], ['payments', 'Receipts', 'int'], ['received', 'Received (QAR)', 'money'], ['refunded', 'Refunded (QAR)', 'money'], ['net', 'Net (QAR)', 'money']],
    sql: `SELECT method, count(*) FILTER (WHERE kind='Payment')::int payments,
                 COALESCE(SUM(amount) FILTER (WHERE kind='Payment'),0) received,
                 COALESCE(SUM(amount) FILTER (WHERE kind='Refund'),0) refunded,
                 COALESCE(SUM(CASE WHEN kind='Payment' THEN amount ELSE -amount END),0) net
            FROM "billing"."payments" WHERE is_deleted=false AND paid_at::date BETWEEN $1 AND $2 GROUP BY method ORDER BY net DESC`,
  },
  patient_receivables: {
    title: 'Patient receivables (unpaid balances)', perm: 'reports.finance', dated: false,
    cols: [['invoice_no', 'Invoice'], ['invoice_date', 'Date', 'date'], ['full_name', 'Patient'], ['mrn', 'MRN'], ['balance', 'Balance (QAR)', 'money'], ['age_days', 'Age (days)', 'int']],
    sql: `SELECT i.invoice_no, i.invoice_date, p.full_name, p.mrn, i.balance, (CURRENT_DATE - i.invoice_date)::int age_days
            FROM "billing"."invoices" i JOIN "mpi"."patients" p ON p.id=i.patient_id
           WHERE i.is_deleted=false AND i.status IN ('Unpaid','Partially Paid') AND i.balance > 0 ORDER BY i.invoice_date`,
  },
  claims_aging: {
    title: 'Insurance claims ageing (outstanding by payer)', perm: 'reports.finance', dated: false,
    cols: [['payer', 'Payer'], ['b0', '0-30 days (QAR)', 'money'], ['b1', '31-60 (QAR)', 'money'], ['b2', '61-90 (QAR)', 'money'], ['b3', '90+ (QAR)', 'money'], ['total', 'Total (QAR)', 'money']],
    sql: `SELECT COALESCE(py.name,'-') payer,
                 COALESCE(SUM(c.amount-c.paid_amount) FILTER (WHERE age<=30),0) b0,
                 COALESCE(SUM(c.amount-c.paid_amount) FILTER (WHERE age BETWEEN 31 AND 60),0) b1,
                 COALESCE(SUM(c.amount-c.paid_amount) FILTER (WHERE age BETWEEN 61 AND 90),0) b2,
                 COALESCE(SUM(c.amount-c.paid_amount) FILTER (WHERE age>90),0) b3,
                 COALESCE(SUM(c.amount-c.paid_amount),0) total
            FROM (SELECT c.*, (CURRENT_DATE - COALESCE(c.submitted_at, c.created_at)::date) AS age FROM "insurance"."claims" c
                   WHERE c.is_deleted=false AND c.status IN ('Submitted','Accepted','Partially Paid','Appealed')) c
            LEFT JOIN "insurance"."payers" py ON py.id=c.payer_id GROUP BY py.name ORDER BY total DESC`,
  },
  claim_status: {
    title: 'Claims by status', perm: 'reports.finance', dated: true,
    cols: [['status', 'Status'], ['n', 'Claims', 'int'], ['amount', 'Claimed (QAR)', 'money'], ['paid', 'Paid (QAR)', 'money']],
    sql: `SELECT status, count(*)::int n, COALESCE(SUM(amount),0) amount, COALESCE(SUM(paid_amount),0) paid
            FROM "insurance"."claims" WHERE is_deleted=false AND created_at::date BETWEEN $1 AND $2 GROUP BY status ORDER BY n DESC`,
  },
  rejection_reasons: {
    title: 'Claim rejection reasons', perm: 'reports.finance', dated: true,
    cols: [['code', 'Code'], ['description', 'Reason'], ['n', 'Count', 'int']],
    sql: `SELECT COALESCE(rc.code,'-') code, COALESCE(rc.description, r.reason, '-') description, count(*)::int n
            FROM "insurance"."rejections" r LEFT JOIN "insurance"."rejection_codes" rc ON rc.id=r.code_id
           WHERE r.is_deleted=false AND r.created_at::date BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY n DESC`,
  },
  visits_by_doctor: {
    title: 'Visits and billing by doctor', perm: 'reports.view', dated: true,
    cols: [['doctor', 'Doctor'], ['visits', 'Visits', 'int'], ['billed', 'Billed (QAR)', 'money']],
    sql: `SELECT COALESCE(u.full_name,'-') doctor, count(DISTINCT v.id)::int visits, COALESCE(SUM(i.net),0) billed
            FROM "scheduling"."visits" v LEFT JOIN "auth"."users" u ON u.id=v.doctor_id
            LEFT JOIN "billing"."invoices" i ON i.visit_id=v.id AND i.status <> 'Cancelled' AND i.is_deleted=false
           WHERE v.is_deleted=false AND v.status <> 'Cancelled' AND v.visit_date BETWEEN $1 AND $2 GROUP BY u.full_name ORDER BY visits DESC`,
  },
  visits_by_department: {
    title: 'Visits by department', perm: 'reports.view', dated: true,
    cols: [['department', 'Department'], ['visits', 'Visits', 'int']],
    sql: `SELECT COALESCE(d.name,'-') department, count(*)::int visits FROM "scheduling"."visits" v LEFT JOIN "admin"."departments" d ON d.id=v.department_id
           WHERE v.is_deleted=false AND v.status <> 'Cancelled' AND v.visit_date BETWEEN $1 AND $2 GROUP BY d.name ORDER BY visits DESC`,
  },
  top_diagnoses: {
    title: 'Top diagnoses', perm: 'reports.view', dated: true,
    cols: [['code', 'ICD-10'], ['description', 'Description'], ['n', 'Cases', 'int']],
    sql: `SELECT dc.code, dc.description, count(*)::int n FROM "clinical"."diagnoses" d JOIN "clinical"."diagnosis_codes" dc ON dc.id=d.code_id
           WHERE d.is_deleted=false AND d.created_at::date BETWEEN $1 AND $2 GROUP BY dc.code, dc.description ORDER BY n DESC LIMIT 25`,
  },
  lab_tat: {
    title: 'Lab turnaround time by test', perm: 'reports.view', dated: true,
    cols: [['test', 'Test'], ['n', 'Results', 'int'], ['avg_min', 'Avg order→validated (min)', 'int'], ['abnormal', 'Abnormal', 'int']],
    sql: `SELECT t.name test, count(*)::int n,
                 COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (i.validated_at - o.ordered_at))/60))::int,0) avg_min,
                 count(*) FILTER (WHERE i.flag IS NOT NULL AND i.flag <> 'Normal')::int abnormal
            FROM "lab"."lab_order_items" i JOIN "lab"."lab_orders" o ON o.id=i.order_id JOIN "lab"."lab_tests" t ON t.id=i.test_id
           WHERE i.is_deleted=false AND i.status='Validated' AND o.ordered_at::date BETWEEN $1 AND $2 GROUP BY t.name ORDER BY n DESC`,
  },
  pharmacy_sales: {
    title: 'Pharmacy dispensing and OTC sales', perm: 'reports.view', dated: true,
    cols: [['drug', 'Drug'], ['qty', 'Qty', 'int'], ['value', 'Value (QAR)', 'money']],
    sql: `SELECT COALESCE(d.brand_name, d.generic_name) drug, SUM(q.qty)::int qty, SUM(q.value) value FROM (
            SELECT di.drug_id, di.qty, di.qty*di.unit_price AS value FROM "pharmacy"."dispense_items" di JOIN "pharmacy"."pharmacy_dispenses" x ON x.id=di.dispense_id
             WHERE di.is_deleted=false AND x.is_deleted=false AND x.dispensed_at::date BETWEEN $1 AND $2
            UNION ALL
            SELECT oi.drug_id, oi.qty, oi.qty*oi.unit_price FROM "pharmacy"."otc_sale_items" oi JOIN "pharmacy"."otc_sales" s ON s.id=oi.sale_id
             WHERE oi.is_deleted=false AND s.is_deleted=false AND s.sold_at::date BETWEEN $1 AND $2) q
            JOIN "pharmacy"."drugs" d ON d.id=q.drug_id GROUP BY d.brand_name, d.generic_name ORDER BY value DESC`,
  },
  stock_expiry: {
    title: 'Stock expiring within 180 days', perm: 'reports.view', dated: false,
    cols: [['drug', 'Drug / item'], ['batch_no', 'Batch'], ['expiry_date', 'Expiry', 'date'], ['qty_on_hand', 'Qty', 'int'], ['store', 'Store']],
    sql: `SELECT COALESCE(d.brand_name, d.generic_name, it.name) drug, b.batch_no, b.expiry_date, b.qty_on_hand, s.name store
            FROM "inventory"."stock_batches" b LEFT JOIN "pharmacy"."drugs" d ON d.id=b.drug_id LEFT JOIN "inventory"."items" it ON it.id=b.item_id LEFT JOIN "inventory"."stores" s ON s.id=b.store_id
           WHERE b.is_deleted=false AND b.qty_on_hand>0 AND b.expiry_date <= CURRENT_DATE+180 ORDER BY b.expiry_date`,
  },
  stock_reorder: {
    title: 'Drugs at or below reorder level', perm: 'reports.view', dated: false,
    cols: [['drug', 'Drug'], ['on_hand', 'On hand (not expired)', 'int'], ['reorder_level', 'Reorder level', 'int']],
    sql: `SELECT COALESCE(d.brand_name, d.generic_name) drug, x.on_hand::int on_hand, d.reorder_level FROM "pharmacy"."drugs" d
            CROSS JOIN LATERAL (SELECT COALESCE(SUM(b.qty_on_hand),0) on_hand FROM "inventory"."stock_batches" b WHERE b.drug_id=d.id AND b.is_deleted=false AND b.expiry_date >= CURRENT_DATE) x
           WHERE d.is_deleted=false AND d.active AND d.reorder_level IS NOT NULL AND x.on_hand <= d.reorder_level ORDER BY x.on_hand`,
  },
  controlled_drugs: {
    title: 'Controlled drug register', perm: 'reports.view', dated: true,
    cols: [['entry_at', 'When', 'datetime'], ['drug', 'Drug'], ['movement', 'Movement'], ['qty', 'Qty', 'int'], ['balance', 'Balance', 'int'], ['patient', 'Patient'], ['by', 'By']],
    sql: `SELECT cr.entry_at, COALESCE(d.brand_name, d.generic_name) drug, cr.movement, cr.qty, cr.balance, p.full_name patient, u.full_name "by"
            FROM "pharmacy"."controlled_register" cr JOIN "pharmacy"."drugs" d ON d.id=cr.drug_id LEFT JOIN "mpi"."patients" p ON p.id=cr.patient_id LEFT JOIN "auth"."users" u ON u.id=cr.performed_by
           WHERE cr.is_deleted=false AND cr.entry_at::date BETWEEN $1 AND $2 ORDER BY cr.id DESC`,
  },
  cashier_sessions: {
    title: 'Cashier sessions and variances', perm: 'reports.finance', dated: true,
    cols: [['cashier', 'Cashier'], ['opened_at', 'Opened', 'datetime'], ['closed_at', 'Closed', 'datetime'], ['expected_cash', 'Expected', 'money'], ['closing_cash', 'Counted', 'money'], ['variance', 'Variance', 'money']],
    sql: `SELECT u.full_name cashier, s.opened_at, s.closed_at, s.expected_cash, s.closing_cash, s.variance
            FROM "billing"."cashier_sessions" s JOIN "auth"."users" u ON u.id=s.user_id WHERE s.is_deleted=false AND s.opened_at::date BETWEEN $1 AND $2 ORDER BY s.id DESC`,
  },
  audit_trail: {
    title: 'Audit trail', perm: 'audit_log.view', dated: true,
    cols: [['created_at', 'When', 'datetime'], ['username', 'User'], ['action', 'Action'], ['resource', 'Resource'], ['record_id', 'Record']],
    sql: `SELECT created_at, username, action, resource, record_id FROM "admin"."audit_log" WHERE created_at::date BETWEEN $1 AND $2 ORDER BY id DESC LIMIT 1000`,
  },
};

router.get('/reports', need('reports.view'), (req, res) => {
  res.json(Object.entries(REPORTS).filter(([, r]) => can(req, r.perm)).map(([key, r]) => ({ key, title: r.title, dated: r.dated })));
});

router.get('/reports/:key', need('reports.view'), wrap(async (req, res) => {
  const r = REPORTS[req.params.key];
  if (!r) throw notFound('Unknown report');
  if (!can(req, r.perm)) throw bad(`Missing permission: ${r.perm}`);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : today().slice(0, 8) + '01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : today();
  const { rows } = await db.query(r.sql, r.dated ? [from, to] : []);
  const cols = r.cols.map(([key, label, type]) => ({ key, label, type: type || 'text' }));
  if (req.query.format === 'csv') {
    const esc = (v) => { if (v == null) return ''; const s = v instanceof Date ? v.toISOString() : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.map((c) => esc(c.label)).join(','), ...rows.map((row) => cols.map((c) => esc(row[c.key])).join(','))].join('\n');
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${req.params.key}.csv"`).send('﻿' + csv);
    return;
  }
  const totals = {};
  for (const c of cols) if (c.type === 'money' || c.type === 'int') totals[c.key] = rows.reduce((s, x) => s + (Number(x[c.key]) || 0), 0);
  res.json({ key: req.params.key, title: r.title, dated: r.dated, from, to, cols, rows, totals });
}));

module.exports = router;
