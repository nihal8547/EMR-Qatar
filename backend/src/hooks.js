'use strict';
const bcrypt = require('bcryptjs');
const { bad, conflict, forbidden, round2, getVisit, priceFor, addCharge } = require('./lib');


const FDI_PERM = new Set(['11','12','13','14','15','16','17','18','21','22','23','24','25','26','27','28','31','32','33','34','35','36','37','38','41','42','43','44','45','46','47','48']);
const FDI_PRIM = new Set(['51','52','53','54','55','61','62','63','64','65','71','72','73','74','75','81','82','83','84','85']);
function checkTooth(dentition, tooth, required) {
  const t = tooth === undefined || tooth === null ? '' : String(tooth).trim();
  if (!t) { if (required) throw bad('Tooth number is required'); return; }
  const set = dentition === 'Primary' ? FDI_PRIM : FDI_PERM;
  if (!set.has(t)) throw bad(`Tooth ${t} is not a valid ${dentition === 'Primary' ? 'primary' : 'permanent'} FDI tooth number`);
}
async function recalcPlan(client, planId) {
  await client.query(
    `UPDATE "dental"."dental_treatment_plans" SET total = COALESCE((SELECT SUM(fee) FROM "dental"."dental_plan_items" WHERE plan_id=$1 AND is_deleted=false AND status <> 'Cancelled'),0), updated_at=now() WHERE id=$1`, [planId]);
}

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


  /* ----- dental ----- */
  async dentalEntryBefore(ctx) {
    const d = ctx.data; const m = { ...(ctx.existing || {}), ...d };
    checkTooth(m.dentition, m.tooth_no, true);
    d.tooth_no = String(m.tooth_no).trim();
    if (ctx.mode === 'create') d.recorded_by = ctx.user.id;
    if (d.visit_id) {
      const v = (await ctx.client.query(`SELECT patient_id FROM "scheduling"."visits" WHERE id=$1 AND is_deleted=false`, [d.visit_id])).rows[0];
      if (!v) throw bad('Visit not found');
      if (String(v.patient_id) !== String(m.patient_id)) throw bad('That visit belongs to a different patient');
    }
  },
  async dentalPlanBefore(ctx) {
    if (ctx.mode === 'update' && ctx.data.patient_id !== undefined && String(ctx.data.patient_id) !== String(ctx.existing.patient_id)) throw bad('Plan patient cannot be changed');
    delete ctx.data.total;
  },
  async dentalItemBefore(ctx) {
    const d = ctx.data; const m = { ...(ctx.existing || {}), ...d };
    if (ctx.mode === 'update' && ctx.existing.status !== 'Planned') throw conflict('Only planned items can be edited');
    delete d.status; delete d.done_on; delete d.done_visit_id;   // status changes only through the complete / cancel actions
    if (ctx.mode === 'create') d.status = 'Planned';
    checkTooth(m.dentition, m.tooth_no, false);
    if (d.tooth_no === '') d.tooth_no = null;
    if (d.service_id && (d.fee === undefined || d.fee === null || d.fee === '')) {
      d.fee = (await ctx.client.query(`SELECT price FROM "billing"."services" WHERE id=$1`, [d.service_id])).rows[0]?.price ?? 0;
    }
    if (d.fee !== undefined && Number(d.fee) < 0) throw bad('Fee cannot be negative');
  },
  async dentalItemAfter(ctx) {
    const planId = ctx.row ? ctx.row.plan_id : null;
    if (planId) await recalcPlan(ctx.client, planId);
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
    const o = (await ctx.client.query(`SELECT visit_id FROM "radiology"."imaging_orders" WHERE id=$1`, [ctx.row.order_id])).rows[0];
    if (o && o.visit_id) await require('./billingCore').settleVisit(ctx.client, o.visit_id);
    if (ctx.row.status === 'Final') require('./notify').auto('result.ready', { imaging_order_id: ctx.row.order_id });
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
  async billCancelBefore(ctx) {
    if (ctx.mode === 'update') throw conflict('A cancel request cannot be edited; reject it and raise a new one');
    const d = ctx.data;
    const inv = (await ctx.client.query(`SELECT id, invoice_no, status FROM "billing"."invoices" WHERE id=$1 AND is_deleted=false`, [d.invoice_id])).rows[0];
    if (!inv) throw bad('Invoice not found');
    if (inv.status === 'Cancelled') throw conflict('This bill is already cancelled');
    const dup = (await ctx.client.query(`SELECT request_no FROM "billing"."bill_cancel_requests" WHERE invoice_id=$1 AND status='Requested' AND is_deleted=false`, [d.invoice_id])).rows[0];
    if (dup) throw conflict(`A cancel request (${dup.request_no}) is already waiting for approval`);
    if (String(d.reason || '').trim().length < 5) throw bad('Enter a reason (at least 5 characters)');
    d.status = 'Requested'; d.requested_by = ctx.user.id; d.requested_at = new Date().toISOString();
    delete d.decided_by; delete d.decided_at; delete d.decision_note; delete d.refund_amount;
  },
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

module.exports = { run, validate, H, recalcPlan };
