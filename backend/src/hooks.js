'use strict';
const bcrypt = require('bcryptjs');
const { bad, conflict, forbidden, round2, getVisit, priceFor, addCharge } = require('./lib');

const H = {
  /* ----- admin ----- */
  async userBefore(ctx) {
    const d = ctx.data;
    const m = { ...(ctx.existing || {}), ...d };
    if (d.username) d.username = String(d.username).toLowerCase().replace(/\s+/g, '');
    if (d.password) {
      if (String(d.password).length < 8) throw bad('Password must be at least 8 characters');
      d.password_hash = await bcrypt.hash(String(d.password), 10);
    }
    delete d.password;
    // privilege-escalation guards
    const isAdminRole = async (rid) => rid && (await ctx.client.query(`SELECT 1 FROM "auth"."roles" WHERE id=$1 AND name='Super Admin'`, [rid])).rows.length > 0;
    const caller = ctx.user;
    if (!caller.perms.has('admin.roles')) {
      if (d.role_id !== undefined && (ctx.mode === 'create' || String(d.role_id) !== String(ctx.existing.role_id))) throw forbidden('Only a role administrator can assign or change a role');
    }
    if (caller.role_name !== 'Super Admin') {
      if ((ctx.existing && (await isAdminRole(ctx.existing.role_id))) || (d.role_id && (await isAdminRole(d.role_id)))) throw forbidden('Only a Super Admin can manage Super Admin accounts');
    }
    if (ctx.existing && ctx.existing.id === caller.id) {
      if (d.active === false) throw bad('You cannot deactivate your own account');
      if (d.role_id !== undefined && String(d.role_id) !== String(ctx.existing.role_id)) throw bad('You cannot change your own role');
    }
    if (ctx.mode === 'create' && !d.password_hash) throw bad('Password is required for a new user');
    if (m.role_id) {
      const role = (await ctx.client.query(`SELECT name FROM "auth"."roles" WHERE id=$1`, [m.role_id])).rows[0];
      if (role && role.name === 'Patient' && !m.patient_id) throw bad('Link a patient record for portal (Patient role) users');
      if (role && role.name !== 'Patient' && m.patient_id) d.patient_id = null;
    }
  },

  /* ----- front office ----- */
  async patientBefore(ctx) {
    const m = { ...(ctx.existing || {}), ...ctx.data };
    if (ctx.data.qid && !/^\d{11}$/.test(ctx.data.qid)) throw bad('QID must be 11 digits');
    if (ctx.query && ctx.query.force === '1') return;
    const { rows } = await ctx.client.query(
      `SELECT mrn, full_name FROM "mpi"."patients"
        WHERE is_deleted=false AND id <> COALESCE($1,0)
          AND (($2::text IS NOT NULL AND qid=$2) OR ($3::text IS NOT NULL AND passport_no=$3) OR (phone=$4 AND dob=$5))
        LIMIT 1`, [ctx.id || null, m.qid || null, m.passport_no || null, m.phone || null, m.dob || null]);
    if (rows.length) throw conflict(`Possible duplicate patient: ${rows[0].mrn} - ${rows[0].full_name}. Open that record, or save again with "force" if this is a different person.`);
  },

  async appointmentBefore(ctx) {
    const m = { ...(ctx.existing || {}), ...ctx.data };
    if (['Cancelled', 'No-show'].includes(m.status)) return;
    const { rows } = await ctx.client.query(
      `SELECT appt_no FROM "scheduling"."appointments"
        WHERE is_deleted=false AND doctor_id=$1 AND appt_date=$2 AND appt_time=$3
          AND status NOT IN ('Cancelled','No-show') AND id <> COALESCE($4,0) LIMIT 1`,
      [m.doctor_id, m.appt_date, m.appt_time, ctx.id || null]);
    if (rows.length) throw conflict(`This doctor already has appointment ${rows[0].appt_no} at that time`);
  },

  /* ----- clinical ----- */
  async vitalsAfter(ctx) {
    if (ctx.action !== 'create') return;
    await ctx.client.query(
      `UPDATE "scheduling"."visits" SET status='With Doctor', updated_at=now() WHERE id=$1 AND status IN ('Registered','Triage')`, [ctx.row.visit_id]);
  },

  /* ----- lab / radiology ----- */
  async qcBefore(ctx) {
    const m = { ...(ctx.existing || {}), ...ctx.data };
    const sd = Number(m.sd_value);
    if (!(sd > 0)) throw bad('Target SD must be greater than zero');
    const z = (Number(m.measured) - Number(m.mean_value)) / sd;
    ctx.data.z_score = Math.round(z * 1000) / 1000;
    const a = Math.abs(z);
    ctx.data.status = a <= 2 ? 'Pass' : a <= 3 ? 'Warning' : 'Fail';
  },

  async labItemAfter(ctx) {
    if (ctx.action !== 'create') return;
    const t = (await ctx.client.query(`SELECT service_id FROM "lab"."lab_tests" WHERE id=$1`, [ctx.row.test_id])).rows[0];
    const o = (await ctx.client.query(`SELECT visit_id FROM "lab"."lab_orders" WHERE id=$1`, [ctx.row.order_id])).rows[0];
    if (t && t.service_id && o) {
      const visit = await getVisit(ctx.client, o.visit_id);
      await addCharge(ctx.client, { visit, service_id: t.service_id, source: 'Lab', source_id: ctx.row.id, user: ctx.user });
    }
  },

  async imagingOrderAfter(ctx) {
    if (ctx.action !== 'create') return;
    const visit = await getVisit(ctx.client, ctx.row.visit_id);
    await addCharge(ctx.client, { visit, service_id: ctx.row.service_id, source: 'Radiology', source_id: ctx.row.id, user: ctx.user });
  },

  async imagingReportAfter(ctx) {
    if (ctx.action === 'delete') return;
    await ctx.client.query(
      `UPDATE "radiology"."imaging_reports" SET reported_by = COALESCE(reported_by, $1) WHERE id=$2`, [ctx.user.id, ctx.row.id]);
    const st = ctx.row.status === 'Final' ? 'Reported' : 'In Progress';
    await ctx.client.query(`UPDATE "radiology"."imaging_orders" SET status=$1, updated_at=now() WHERE id=$2`, [st, ctx.row.order_id]);
  },

  /* ----- billing ----- */
  async chargeBefore(ctx) {
    const m = { ...(ctx.existing || {}), ...ctx.data };
    if (ctx.mode === 'update' && ctx.existing.status !== 'Pending') throw conflict('Invoiced or cancelled charges cannot be edited');
    const visit = await getVisit(ctx.client, m.visit_id);
    if (ctx.mode === 'create' && (ctx.data.unit_price === undefined || ctx.data.unit_price === null)) {
      const { price, service } = await priceFor(ctx.client, m.service_id, visit);
      ctx.data.unit_price = price;
      if (!ctx.data.description) ctx.data.description = service.name;
    }
    const qty = m.qty === undefined || m.qty === null ? 1 : Number(m.qty);
    const unit = ctx.data.unit_price !== undefined ? Number(ctx.data.unit_price) : Number(m.unit_price);
    ctx.data.qty = qty;
    ctx.data.amount = round2(qty * unit);
  },

  async requestedByBefore(ctx) { if (ctx.mode === 'create') ctx.data.requested_by = ctx.user.id; },
  async reportedByBefore(ctx) { if (ctx.mode === 'create') ctx.data.reported_by = ctx.user.id; },

  /* ----- inventory / finance / hr ----- */
  async poItemAfter(ctx) {
    await ctx.client.query(
      `UPDATE "inventory"."purchase_orders" SET total = (SELECT COALESCE(SUM(qty*unit_cost),0) FROM "inventory"."po_items" WHERE po_id=$1 AND is_deleted=false), updated_at=now() WHERE id=$1`,
      [ctx.row.po_id]);
  },

  async vendorPaymentAfter(ctx) {
    await ctx.client.query(
      `UPDATE "finance"."vendor_bills" b SET
         paid = COALESCE((SELECT SUM(amount) FROM "finance"."vendor_payments" WHERE bill_id=b.id AND is_deleted=false),0),
         updated_at = now()
       WHERE id=$1`, [ctx.row.bill_id]);
    await ctx.client.query(
      `UPDATE "finance"."vendor_bills" SET status = CASE WHEN paid >= amount - 0.005 THEN 'Paid' WHEN paid > 0 THEN 'Partially Paid' ELSE 'Unpaid' END WHERE id=$1`,
      [ctx.row.bill_id]);
  },

  async payslipBefore(ctx) {
    const m = { ...(ctx.existing || {}), ...ctx.data };
    ctx.data.net = round2(Number(m.basic || 0) + Number(m.allowance || 0) - Number(m.deductions || 0));
  },
};

async function run(name, ctx) {
  if (!name) return;
  if (!H[name]) throw new Error(`Unknown hook "${name}"`);
  await H[name](ctx);
}

/** Fail fast at start-up if the registry names a hook that does not exist. */
function validate(reg) {
  for (const k of reg.order) {
    const r = reg.resources[k];
    for (const n of Object.values(r.hooks)) if (!H[n]) throw new Error(`Resource ${k} uses unknown hook ${n}`);
  }
}

H.userDeleteGuard = async (ctx) => {
  const r = (await ctx.client.query(`SELECT name FROM "auth"."roles" WHERE id=$1`, [ctx.row.role_id])).rows[0];
  if (r && r.name === 'Super Admin') {
    if (ctx.user.role_name !== 'Super Admin') throw forbidden('Only a Super Admin can delete Super Admin accounts');
    const n = (await ctx.client.query(`SELECT count(*)::int n FROM "auth"."users" u JOIN "auth"."roles" r ON r.id=u.role_id WHERE r.name='Super Admin' AND u.is_deleted=false AND u.active`)).rows[0].n;
    if (n <= 1) throw conflict('This is the last active Super Admin');
  }
};

module.exports = { run, validate, H };
