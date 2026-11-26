<script setup lang="ts">
definePageMeta({ perm: 'visits.manage' })
const route = useRoute()
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const q = ref(''); const date = ref(todayStr()); const status = ref(''); const list = ref<any[]>([])
const sel = ref<number | null>(route.query.visit ? Number(route.query.visit) : null)
const d = ref<any>(null); const busy = ref(false)
const doc = reactive<any>({ doctor_id: null, reason: '', keep_department: false })
const ed = reactive<any>({ complaint: '', visit_type: 'OPD', department_id: null, referred_by: '' })
const py = reactive<any>({ payer_type: 'Cash', policy_id: null, corporate_id: null })
const cx = reactive<any>({ reason: '', confirm: false })
async function loadList() { try { list.value = await api('/visits/manage/list', { query: { q: q.value || undefined, date: q.value ? undefined : date.value, status: status.value || undefined } }) } catch (e) { err(e) } }
async function loadOne() {
  if (!sel.value) { d.value = null; return }
  try {
    d.value = await api(`/visits/${sel.value}/manage`)
    const v = d.value.visit
    Object.assign(ed, { complaint: v.complaint || '', visit_type: v.visit_type, department_id: v.department_id, referred_by: v.referred_by || '' })
    Object.assign(py, { payer_type: v.payer_type, policy_id: v.policy_id, corporate_id: v.corporate_id })
    Object.assign(doc, { doctor_id: null, reason: '', keep_department: false }); Object.assign(cx, { reason: '', confirm: false })
  } catch (e) { err(e); d.value = null }
}
onMounted(() => { loadList(); loadOne() })
let t: any; watch([q, date, status], () => { clearTimeout(t); t = setTimeout(loadList, 300) })
watch(sel, loadOne)
const v = computed(() => d.value?.visit)
const isOpen = computed(() => v.value && !['Completed', 'Cancelled'].includes(v.value.status))
const isWalkin = computed(() => v.value?.visit_type === 'Walk-in')
async function run(path: string, body: any, msg: string, after?: () => void) {
  busy.value = true
  try {
    const r: any = await api(`/visits/${sel.value}/${path}`, { method: 'POST', body })
    ok(msg); for (const w of r?.warnings || []) err(new Error(w)); await Promise.all([loadOne(), loadList()]); after?.()
  } catch (e) { err(e) } finally { busy.value = false }
}
const changeDoctor = () => run('change-doctor', { ...doc }, 'Doctor changed')
const saveDetails = () => run('update', { ...ed }, 'Visit updated')
const changePayer = () => run('change-payer', { ...py }, 'Payer changed — pending charges re-priced')
const cancelIt = () => { if (confirm(`Cancel ${v.value.visit_no} for ${v.value.full_name}?`)) run('cancel', { reason: cx.reason }, 'Visit cancelled') }
const reopen = () => run('reopen', {}, 'Visit reopened')
</script>
<template>
  <div>
    <div class="bar"><div><h1>Manage Visits</h1><div class="page-sub">Cancel a visit, change the doctor, correct details or change the payer.</div></div></div>
    <div class="split">
      <div class="card flush" style="max-height:78vh;overflow:auto"><div style="padding:8px"><input v-model="q" placeholder="Search visit no, name, MRN, phone, QID (all dates)" />
        <div v-if="!q" class="bar" style="margin:8px 0 0"><input type="date" v-model="date" style="width:150px" /><select v-model="status" style="width:140px"><option value="">All status</option><option>Registered</option><option>Triage</option><option>With Doctor</option><option>Diagnostics</option><option>Pharmacy</option><option>Billing</option><option>Completed</option><option>Cancelled</option></select></div></div>
        <div v-for="x in list" :key="x.id" class="list-item" :class="{ on: sel === x.id }" @click="sel = x.id"><div><b>{{ x.visit_no }}</b> <span class="badge" :class="badgeClass(x.status)">{{ x.status }}</span> <span v-if="x.visit_type === 'Walk-in'" class="badge grey">Walk-in</span></div>
          <div>{{ x.full_name }} <span class="small muted">{{ x.mrn }}</span></div><div class="small muted">{{ fdate(x.visit_date) }} · {{ x.doctor_name || 'No doctor' }} · token {{ x.token_no }}</div></div>
        <div v-if="!list.length" class="empty">No visits found.</div></div>
      <div v-if="v">
        <div class="card">
          <div class="bar" style="margin:0"><div><h2 style="margin:0">{{ v.full_name }} <span class="muted small">{{ v.mrn }}</span></h2><div class="muted small">{{ v.visit_no }} · {{ fdate(v.visit_date) }}</div></div><div class="sp"></div><span class="badge" :class="badgeClass(v.status)">{{ v.status }}</span></div>
          <div class="dv" style="margin-top:12px"><div class="i"><div class="k">Doctor</div><div class="v">{{ v.doctor_name || '—' }}</div></div><div class="i"><div class="k">Department</div><div class="v">{{ v.department || '—' }}</div></div><div class="i"><div class="k">Type</div><div class="v">{{ v.visit_type }}</div></div><div class="i"><div class="k">Token</div><div class="v">{{ v.token_no }}</div></div><div class="i"><div class="k">Payer</div><div class="v">{{ v.payer_type }}</div></div><div class="i"><div class="k">Paid so far</div><div class="v">{{ money(d.paid) }}</div></div><div class="i wide"><div class="k">Complaint</div><div class="v">{{ v.complaint || '—' }}</div></div></div>
          <div class="bar" style="margin-top:12px"><NuxtLink v-if="can('patients.360')" :to="`/patient/${v.patient_id}`" class="btn sm">Patient 360</NuxtLink><NuxtLink v-if="can('billing.cashier')" :to="`/front-payments?visit=${v.id}`" class="btn sm">Bill / payments</NuxtLink><NuxtLink :to="`/r/visits/${v.id}`" class="btn sm">Visit record</NuxtLink></div>
        </div>
        <div v-if="v.status === 'Cancelled'" class="card"><div class="alert warn" style="margin:0 0 10px"><b>Cancelled</b><span v-if="v.cancelled_by_name"> by {{ v.cancelled_by_name }}</span> — {{ v.cancel_reason || 'no reason recorded' }}</div>
          <button class="p" :disabled="busy" @click="reopen">Reopen this visit</button> <span class="small muted">Only visits of today. Cancelled lab / X-ray orders stay cancelled; the consultation fee is posted again.</span></div>
        <div v-else-if="v.status === 'Completed'" class="alert info">This visit is completed and cannot be changed. Use Patient Payments → "Request bill cancel" for money corrections.</div>
        <template v-else>
          <div v-if="!isWalkin" class="card"><h2>Change doctor</h2>
            <div class="fgrid"><div class="field"><label class="f">New doctor <span class="req">*</span></label><LookupSelect v-model="doc.doctor_id" resource="doctors" /></div><div class="field"><label class="f">Reason</label><input v-model="doc.reason" placeholder="e.g. patient request / doctor on leave" /></div></div>
            <label class="f" style="display:flex;gap:8px;align-items:center"><input v-model="doc.keep_department" type="checkbox" /> Keep the current department</label>
            <div class="small muted" style="margin:4px 0 8px">The patient gets a new token with the new doctor. If the consultation fee differs and is not yet paid, it is replaced automatically.</div>
            <button class="p" :disabled="busy || !doc.doctor_id" @click="changeDoctor">Change doctor</button></div>
          <div class="card"><h2>Edit visit details</h2>
            <div class="fgrid"><div class="field wide"><label class="f">Complaint / reason</label><textarea v-model="ed.complaint"></textarea></div>
              <div v-if="!isWalkin" class="field"><label class="f">Visit type</label><select v-model="ed.visit_type"><option>OPD</option><option>Follow-up</option><option>Emergency</option><option>Tele</option></select></div>
              <div v-if="!isWalkin" class="field"><label class="f">Department</label><select v-model="ed.department_id"><option :value="null">—</option><option v-for="x in d.departments" :key="x.id" :value="x.id">{{ x.name }}</option></select></div>
              <div v-if="isWalkin" class="field"><label class="f">Referred by</label><input v-model="ed.referred_by" /></div></div>
            <button :disabled="busy" @click="saveDetails">Save details</button></div>
          <div class="card"><h2>Change payer</h2>
            <div v-if="d.has_invoice" class="alert warn" style="margin:0">An invoice already exists. Cancel the invoice in Patient Payments first, then change the payer.</div>
            <template v-else>
              <div class="fgrid"><div class="field"><label class="f">Payer</label><select v-model="py.payer_type"><option>Cash</option><option>Insurance</option><option>Corporate</option></select></div>
                <div v-if="py.payer_type === 'Insurance'" class="field"><label class="f">Insurance policy</label><select v-model="py.policy_id"><option :value="null">— select —</option><option v-for="p in d.policies" :key="p.id" :value="p.id">{{ p.payer }} · {{ p.policy_no }} · {{ p.status }} (to {{ fdate(p.valid_to) }})</option></select><div v-if="!d.policies.length" class="small muted">No policy on file for this patient.</div></div>
                <div v-if="py.payer_type === 'Corporate'" class="field"><label class="f">Corporate account</label><LookupSelect v-model="py.corporate_id" resource="corporate_accounts" /></div></div>
              <div class="small muted" style="margin-bottom:8px">Insurance eligibility is checked again and all unbilled charges are re-priced for the new payer.</div>
              <button :disabled="busy || py.payer_type === v.payer_type && (py.policy_id || null) === (v.policy_id || null) && (py.corporate_id || null) === (v.corporate_id || null)" @click="changePayer">Change payer</button></template></div>
          <div class="card" style="border-color:#e5b4b0"><h2>Cancel visit</h2>
            <div v-if="d.paid > 0" class="alert warn">A payment of {{ money(d.paid) }} was received. Refund it first: <NuxtLink to="/r/bill_cancel_requests">Bill Cancel Requests</NuxtLink> (cashier / manager approves), then cancel the visit.</div>
            <div class="field"><label class="f">Reason <span class="req">*</span></label><input v-model="cx.reason" placeholder="e.g. patient left / duplicate registration / wrong patient" /></div>
            <div class="small muted" style="margin:4px 0 8px">Unstarted lab, X-ray, procedure and prescription orders and unbilled charges are cancelled too. Cannot cancel after a sample is collected, a study started or medicines dispensed.</div>
            <button class="danger" :disabled="busy || cx.reason.trim().length < 3" @click="cancelIt">Cancel this visit</button></div>
        </template>
      </div>
      <div v-else class="card empty">Select a visit to manage.</div>
    </div>
  </div>
</template>
