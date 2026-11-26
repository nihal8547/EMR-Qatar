<script setup lang="ts">
definePageMeta({ perm: 'visits.start' })
const { api } = useApi(); const { err, ok } = useUi()
const f = reactive<any>({ patient_id: null, doctor_id: null, visit_type: 'OPD', payer_type: 'Cash', policy_id: null, corporate_id: null, appointment_id: null, complaint: '' })
const policies = ref<any[]>([])
const appts = ref<any[]>([])
const result = ref<any>(null)
const busy = ref(false)
const dupAsk = ref(false)
const payNow = reactive<any>({ method: 'Cash', reference: '', done: null, busy: false, atStart: true })
const pat = ref<any>(null)
const route = useRoute()
async function collectNow() {
  payNow.busy = true
  try {
    const b: any = await api(`/billing/visit/${result.value.id}/invoice`, { method: 'POST', body: {} })
    const due = Number(b.invoice.balance)
    if (due > 0) {
      const r: any = await api(`/billing/invoices/${b.invoice.id}/pay`, { method: 'POST', body: { amount: due, method: payNow.method, reference: payNow.reference } })
      payNow.done = { amount: due, receipt: r.receipt_no, invoice_id: b.invoice.id, payment_id: r.payment_id }
      ok(`Payment received ${money(due)} · ${r.receipt_no}`)
    } else { payNow.done = { amount: 0, receipt: null, invoice_id: b.invoice.id }; ok('Nothing to pay now (covered by the payer)') }
  } catch (e) { err(e) } finally { payNow.busy = false }
}

async function loadAppts() { try { appts.value = (await api('/r/appointments', { query: { appt_date: todayStr(), limit: 100, sort: 'appt_time', dir: 'asc' } })).rows.filter((a: any) => ['Booked', 'Confirmed'].includes(a.status)) } catch { appts.value = [] } }
onMounted(() => { loadAppts(); if (route.query.patient) f.patient_id = Number(route.query.patient) || route.query.patient })
watch(() => f.patient_id, async (id) => {
  f.policy_id = null; policies.value = []; pat.value = null
  if (!id) return
  try { pat.value = await api(`/r/patients/${id}`) } catch { pat.value = null }
  try { policies.value = (await api('/r/policy_members', { query: { patient_id: id, limit: 50 } })).rows } catch { policies.value = [] }
  if (policies.value.length === 1 && f.payer_type === 'Insurance') f.policy_id = policies.value[0].id
})
watch(() => f.payer_type, () => { if (f.payer_type === 'Insurance' && policies.value.length === 1) f.policy_id = policies.value[0].id })
function fromAppt(a: any) { f.patient_id = a.patient_id; f.doctor_id = a.doctor_id; f.appointment_id = a.id; f.complaint = a.reason || f.complaint }

async function start(allow = false) {
  busy.value = true; dupAsk.value = false
  try {
    result.value = await api('/visits/start', { method: 'POST', body: { ...f, allow_duplicate: allow, discount: disc.on && Number(disc.value) > 0 ? { type: disc.type, value: Number(disc.value), reason: disc.reason } : undefined } })
    ok(`Visit ${result.value.visit_no} started`); loadAppts()
    if (payNow.atStart && can('billing.cashier')) await collectNow()
  } catch (e: any) {
    if (e.status === 409 && /already has open visit/.test(e.message)) dupAsk.value = true
    err(e)
  } finally { busy.value = false }
}
function reset() { pat.value = null; payNow.done = null; payNow.reference = ''; disc.on = false; disc.value = ''; disc.reason = ''; disc.preset = ''; est.value = null; loadPending(); result.value = null; Object.assign(f, { patient_id: null, doctor_id: null, visit_type: 'OPD', payer_type: 'Cash', policy_id: null, corporate_id: null, appointment_id: null, complaint: '' }) }
const { can } = useAuth()

/* ---- price estimate + discount ---- */
const disc = reactive<any>({ on: false, type: 'percent', value: '', reason: '', preset: '' })
const REASONS = ['Staff / staff family', 'Senior citizen', 'Repeat patient / loyalty', 'Promotion / campaign', 'Charity / needy', 'Referral', 'Manager approval', 'Other']
const est = ref<any>(null); const estBusy = ref(false)
let seq = 0; let et: any
const discQuery = () => (disc.on && Number(disc.value) > 0 ? { discount_type: disc.type, discount_value: Number(disc.value) } : {})
async function loadEstimate() {
  if (!f.doctor_id) { est.value = null; return }
  const my = ++seq; estBusy.value = true
  try {
    const r = await api('/visits/price-preview', { query: { doctor_id: f.doctor_id, visit_type: f.visit_type, payer_type: f.payer_type, policy_id: f.policy_id || undefined, corporate_id: f.corporate_id || undefined, ...discQuery() } })
    if (my === seq) est.value = r
  } catch (e) { if (my === seq) { est.value = null; err(e) } } finally { if (my === seq) estBusy.value = false }
}
watch(() => [f.doctor_id, f.visit_type, f.payer_type, f.policy_id, f.corporate_id, disc.on, disc.type, disc.value], () => { clearTimeout(et); et = setTimeout(loadEstimate, 250) })
watch(() => disc.preset, (v) => { if (v) disc.reason = v === 'Other' ? '' : v })
const discValid = computed(() => !disc.on || (Number(disc.value) > 0 && String(disc.reason).trim().length >= 3 && (disc.type !== 'percent' || Number(disc.value) <= 100)))
const authMsg = computed(() => {
  const a = est.value?.discount?.authority; if (!disc.on || !a) return ''
  return a.mode === 'direct' ? 'Within your authority: applied immediately.' : `Above your limit (${a.limit}%): a manager must approve before it applies. Until then the bill is at full price.`
})
function setPct(v: number) { disc.type = 'percent'; disc.value = String(v) }

/* ---- discounts waiting for approval (managers) ---- */
const pending = ref<any[]>([])
async function loadPending() { if (!can('billing.approve_discount')) return; try { pending.value = await api('/visits/discounts/pending') } catch { pending.value = [] } }
onMounted(loadPending)
async function decide(v: any, approve: boolean) { try { await api(`/visits/${v.id}/discount/decision`, { method: 'POST', body: { approve } }); ok(approve ? 'Discount approved' : 'Discount rejected'); loadPending() } catch (e) { err(e) } }
</script>
<template>
  <div>
    <h1>Start Visit (Check-in)</h1>
    <div v-if="result" class="card">
      <div class="alert ok"><b>Visit {{ result.visit_no }}</b> started. Token <b>#{{ result.token_no }}</b>.</div>
      <p v-if="f.payer_type === 'Insurance'">Eligibility: <span class="badge" :class="badgeClass(result.eligibility)">{{ result.eligibility }}</span> <span class="muted small">(simulated check against the policy dates and status)</span></p>
      <p v-if="result.discount_status">Discount: <span class="badge" :class="badgeClass(result.discount_status === 'Applied' ? 'approved' : 'pending')">{{ result.discount_status }}</span></p>
      <div v-for="w in result.warnings" :key="w" class="alert warn">{{ w }}</div>
      <div v-if="can('billing.cashier')" class="card" style="background:#fafbfc"><h3 style="margin-top:0">Payment</h3>
        <div v-if="payNow.done" class="alert ok">{{ payNow.done.amount > 0 ? `Received ${money(payNow.done.amount)} · receipt ${payNow.done.receipt}` : 'Nothing to pay now — covered by the payer.' }} <NuxtLink :to="`/print/invoice/${payNow.done.invoice_id}`" class="btn sm">🖨 Print bill</NuxtLink><NuxtLink v-if="payNow.done.payment_id" :to="`/print/receipt/${payNow.done.payment_id}`" class="btn sm">🖨 Receipt</NuxtLink></div>
        <div v-else class="bar"><select v-model="payNow.method" style="width:140px"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Online</option></select><input v-model="payNow.reference" placeholder="Reference (card slip)" style="width:180px" /><button class="ok" :disabled="payNow.busy" @click="collectNow">Collect payment now</button><span class="small muted">Creates the invoice for this check-in and receives the patient's share (after discount / insurance). Cash needs your cashier session open.</span></div></div>
      <div class="bar"><NuxtLink :to="`/print/token/${result.id}?auto=1`" class="btn p">🖨 Print token slip</NuxtLink><NuxtLink v-if="can('vitals.create')" :to="`/r/vitals/new?visit_id=${result.id}`" class="btn">Record vitals</NuxtLink><NuxtLink to="/queue" class="btn">Queue board</NuxtLink><button @click="reset">Start another visit</button></div>
    </div>
    <div v-else class="grid" style="grid-template-columns:2fr 1fr;align-items:start">
      <div class="card">
        <div class="fgrid">
          <div class="field wide">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
              <label class="f" style="margin:0">Patient <span class="req">*</span></label>
              <NuxtLink v-if="can('patients.create')" to="/r/patients/new" class="btn sm p" style="text-decoration:none; display:inline-flex; align-items:center; gap:5px; font-weight:600">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                <span>Register New Patient</span>
              </NuxtLink>
            </div>
            <div>
              <div>
                <LookupSelect v-model="f.patient_id" resource="patients" placeholder="Name, MRN, QID or phone" />
              </div>
            </div>
          </div>
          <div v-if="pat" class="field wide"><div class="pcard">
            <div class="bar" style="align-items:flex-start"><div class="pav sm">{{ (pat.full_name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() }}</div>
              <div style="flex:1;min-width:0"><b>{{ pat.full_name }}</b><div class="pchips"><span class="badge">{{ pat.mrn }}</span><span v-if="pat.qid" class="badge grey">QID {{ pat.qid }}</span><span class="badge grey">{{ pat.gender }} · DOB {{ fdate(pat.dob) }}</span><span v-if="pat.phone" class="badge grey">{{ pat.phone }}</span><span v-if="pat.nationality_id__label" class="badge grey">{{ pat.nationality_id__label }}</span></div></div>
              <NuxtLink :to="`/r/patients/${pat.id}?edit=1&back=${encodeURIComponent('/visit-start?patient=' + pat.id)}`" class="btn sm">✎ Edit patient</NuxtLink>
              <NuxtLink v-if="can('patients.360')" :to="`/patient/${pat.id}`" class="btn sm">360</NuxtLink></div>
            <div class="sect" style="margin:12px 0 6px">Insurance</div>
            <div v-if="!policies.length" class="none-txt">No insurance policy on file. <NuxtLink v-if="can('policy_members.create')" :to="`/r/policy_members/new?patient_id=${pat.id}`">+ Add policy</NuxtLink></div>
            <div v-for="p in policies" :key="p.id" class="pol" :class="{ on: f.payer_type === 'Insurance' && f.policy_id === p.id }">
              <div><b>{{ p.payer_id__label }}</b> <span v-if="p.plan_id__label" class="muted">· {{ p.plan_id__label }}</span> <span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span></div>
              <div class="small muted">Policy {{ p.policy_no }} · Member {{ p.member_id }} · {{ p.relation }} · valid {{ fdate(p.valid_from) || '…' }} → {{ fdate(p.valid_to) }}</div>
              <div v-if="p.valid_to && String(p.valid_to).slice(0, 10) < todayStr()" class="small warn-text">Policy has expired.</div>
            </div>
          </div></div>
          <div class="field"><label class="f">Doctor <span class="req">*</span></label><LookupSelect v-model="f.doctor_id" resource="doctors" /></div>
          <div class="field"><label class="f">Visit type</label><select v-model="f.visit_type"><option>OPD</option><option>Follow-up</option><option>Emergency</option><option>Tele</option></select></div>
          <div class="field"><label class="f">Payer</label><select v-model="f.payer_type"><option>Cash</option><option>Insurance</option><option>Corporate</option></select></div>
          <div v-if="f.payer_type === 'Insurance'" class="field"><label class="f">Insurance policy <span class="req">*</span></label>
            <select v-model="f.policy_id"><option :value="null">— select —</option><option v-for="p in policies" :key="p.id" :value="p.id">{{ p.payer_id__label }} · {{ p.policy_no }} · {{ p.status }} (to {{ fdate(p.valid_to) }})</option></select>
            <div v-if="f.patient_id && !policies.length" class="small muted">No policy on file. Add one under Insurance → Policy Members.</div></div>
          <div v-if="f.payer_type === 'Corporate'" class="field"><label class="f">Corporate account <span class="req">*</span></label><LookupSelect v-model="f.corporate_id" resource="corporate_accounts" /></div>
          <div class="field wide"><label class="f">Complaint / reason</label><textarea v-model="f.complaint"></textarea></div>
        </div>
        <div class="field wide" style="margin-top:6px">
          <label class="f" style="display:flex;gap:8px;align-items:center"><input v-model="disc.on" type="checkbox" style="width:auto" /> Give a discount</label>
          <div v-if="disc.on" class="card" style="margin:8px 0;background:#fafafa">
            <div class="bar">
              <select v-model="disc.type" style="max-width:140px"><option value="percent">Percent (%)</option><option value="amount">Amount (QAR)</option></select>
              <input v-model="disc.value" type="number" min="0" step="any" :max="disc.type === 'percent' ? 100 : undefined" style="max-width:110px" placeholder="Value" />
              <template v-if="disc.type === 'percent'"><button v-for="n in [5, 10, 15, 20, 50, 100]" :key="n" class="sm" type="button" @click="setPct(n)">{{ n }}%</button></template>
            </div>
            <div class="bar" style="margin-top:8px">
              <select v-model="disc.preset" style="max-width:230px"><option value="">Reason…</option><option v-for="r in REASONS" :key="r">{{ r }}</option></select>
              <input v-model="disc.reason" maxlength="200" placeholder="Reason (required)" style="flex:1;min-width:180px" />
            </div>
            <div v-if="authMsg" class="small" :class="est?.discount?.authority.mode === 'direct' ? 'muted' : 'warn-text'" style="margin-top:6px">{{ authMsg }}</div>
            <div class="small muted" style="margin-top:4px">Applies to the whole bill (consultation, tests, medicines) when it is invoiced. An amount is converted to a % of the bill at that time.</div>
          </div>
        </div>
        <div v-if="can('billing.cashier')" class="field wide" style="margin-top:6px">
          <label class="f" style="display:flex;gap:8px;align-items:center"><input v-model="payNow.atStart" type="checkbox" style="width:auto" /> Collect payment at check-in <span v-if="est && est.service" class="badge ok">Patient pays {{ money(est.patient_share) }}</span></label>
          <div v-if="payNow.atStart" class="bar" style="margin:6px 0"><select v-model="payNow.method" style="width:150px"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Online</option></select><input v-model="payNow.reference" placeholder="Reference (card slip, optional)" style="width:220px" /><span class="small muted">Received when you press Start visit; shows in Cashier, Invoices and Payments. Cash needs your cashier session open.</span></div>
        </div>
        <div v-if="dupAsk" class="alert warn">This patient already has an open visit with this doctor today. Start a second one anyway? <button class="sm" @click="start(true)">Yes, start another</button></div>
        <button class="p" :disabled="busy || !f.patient_id || !f.doctor_id || !discValid" @click="start(false)">{{ busy ? 'Working…' : (payNow.atStart && can('billing.cashier') ? 'Start visit & collect payment' : 'Start visit') }}</button>
      </div>
      <div>
      <div class="card">
        <h2 style="margin-top:0">Estimated bill</h2>
        <div v-if="!f.doctor_id" class="muted small">Choose a doctor to see the consultation price.</div>
        <div v-else-if="est && !est.service" class="alert warn">{{ est.warnings[0] }}</div>
        <template v-else-if="est">
          <div><b>{{ est.service.name }}</b></div>
          <div class="muted small">{{ est.price_basis }}<span v-if="est.price !== est.cash_price"> · cash price {{ money(est.cash_price) }}</span></div>
          <dl class="kv" style="margin-top:10px">
            <dt>Consultation fee</dt><dd>{{ money(est.price) }}</dd>
            <template v-if="est.discount_amount > 0"><dt>Discount ({{ est.discount.type === 'percent' ? est.discount.value + '%' : 'QAR ' + est.discount.value }})</dt><dd>− {{ money(est.discount_amount) }}</dd></template>
            <dt>Net</dt><dd><b>{{ money(est.net) }}</b></dd>
            <template v-if="f.payer_type !== 'Cash'"><dt>Insurer / company pays</dt><dd>{{ money(est.payer_share) }}</dd></template>
            <dt>Patient pays</dt><dd><b>{{ money(est.patient_share) }}</b></dd>
          </dl>
          <div v-if="est.plan" class="small muted">Plan {{ est.plan.name }}: {{ est.plan.copay_pct }}% co-pay<span v-if="est.plan.copay_max"> (max {{ money(est.plan.copay_max) }})</span><span v-if="est.plan.annual_limit"> · annual limit {{ money(est.plan.annual_limit) }}</span></div>
          <div v-for="w in est.warnings" :key="w" class="alert warn" style="margin-top:8px">{{ w }}</div>
          <div class="small muted" style="margin-top:8px">Lab tests, radiology, procedures and medicines are added during the visit at their configured prices (Price Configuration).</div>
        </template>
        <div v-if="estBusy" class="small muted">Updating…</div>
      </div>
      <div v-if="pending.length" class="card">
        <h2 style="margin-top:0">Discounts waiting for approval</h2>
        <div v-for="v in pending" :key="v.id" class="list-item" style="cursor:default">
          <b>{{ v.full_name }}</b> <span class="muted small">{{ v.visit_no }}</span>
          <div class="small">{{ v.discount_type === 'percent' ? v.discount_value + '%' : 'QAR ' + v.discount_value }} · {{ v.discount_reason }} <span class="muted">(by {{ v.requested_by }})</span></div>
          <div class="bar" style="margin-top:4px"><button class="sm ok" @click="decide(v, true)">Approve</button><button class="sm danger" @click="decide(v, false)">Reject</button></div>
        </div>
      </div>
      <div class="card">
        <h2>Today's appointments</h2>
        <div v-if="!appts.length" class="muted small">No booked appointments left for today.</div>
        <div v-for="a in appts" :key="a.id" class="list-item" :class="{ on: f.appointment_id === a.id }" @click="fromAppt(a)">
          <b>{{ String(a.appt_time).slice(0, 5) }}</b> {{ a.patient_id__label }}<div class="small muted">{{ a.doctor_id__label }} · {{ a.status }}</div>
        </div>
        <div class="small muted" style="margin-top:6px">Click one to fill the form and mark it arrived.</div>
      </div>
      </div>
    </div>
  </div>
</template>
