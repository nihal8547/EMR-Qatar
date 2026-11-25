<script setup lang="ts">
definePageMeta({ perm: 'visits.start' })
const { api } = useApi(); const { err, ok } = useUi()
const f = reactive<any>({ patient_id: null, doctor_id: null, visit_type: 'OPD', payer_type: 'Cash', policy_id: null, corporate_id: null, appointment_id: null, complaint: '' })
const policies = ref<any[]>([])
const appts = ref<any[]>([])
const result = ref<any>(null)
const busy = ref(false)
const dupAsk = ref(false)

async function loadAppts() { try { appts.value = (await api('/r/appointments', { query: { appt_date: todayStr(), limit: 100, sort: 'appt_time', dir: 'asc' } })).rows.filter((a: any) => ['Booked', 'Confirmed'].includes(a.status)) } catch { appts.value = [] } }
onMounted(loadAppts)
watch(() => f.patient_id, async (id) => {
  f.policy_id = null; policies.value = []
  if (!id) return
  try { policies.value = (await api('/r/policy_members', { query: { patient_id: id, limit: 50 } })).rows } catch { policies.value = [] }
  if (policies.value.length === 1 && f.payer_type === 'Insurance') f.policy_id = policies.value[0].id
})
watch(() => f.payer_type, () => { if (f.payer_type === 'Insurance' && policies.value.length === 1) f.policy_id = policies.value[0].id })
function fromAppt(a: any) { f.patient_id = a.patient_id; f.doctor_id = a.doctor_id; f.appointment_id = a.id; f.complaint = a.reason || f.complaint }

async function start(allow = false) {
  busy.value = true; dupAsk.value = false
  try {
    result.value = await api('/visits/start', { method: 'POST', body: { ...f, allow_duplicate: allow } })
    ok(`Visit ${result.value.visit_no} started`); loadAppts()
  } catch (e: any) {
    if (e.status === 409 && /already has open visit/.test(e.message)) dupAsk.value = true
    err(e)
  } finally { busy.value = false }
}
function reset() { result.value = null; Object.assign(f, { patient_id: null, doctor_id: null, visit_type: 'OPD', payer_type: 'Cash', policy_id: null, corporate_id: null, appointment_id: null, complaint: '' }) }
const { can } = useAuth()
</script>
<template>
  <div>
    <h1>Start Visit (Check-in)</h1>
    <div v-if="result" class="card">
      <div class="alert ok"><b>Visit {{ result.visit_no }}</b> started. Token <b>#{{ result.token_no }}</b>.</div>
      <p v-if="f.payer_type === 'Insurance'">Eligibility: <span class="badge" :class="badgeClass(result.eligibility)">{{ result.eligibility }}</span> <span class="muted small">(simulated check against the policy dates and status)</span></p>
      <div v-for="w in result.warnings" :key="w" class="alert warn">{{ w }}</div>
      <div class="bar"><NuxtLink v-if="can('vitals.create')" :to="`/r/vitals/new?visit_id=${result.id}`" class="btn p">Record vitals</NuxtLink><NuxtLink to="/queue" class="btn">Queue board</NuxtLink><button @click="reset">Start another visit</button></div>
    </div>
    <div v-else class="grid" style="grid-template-columns:2fr 1fr;align-items:start">
      <div class="card">
        <div class="fgrid">
          <div class="field wide"><label class="f">Patient <span class="req">*</span> <NuxtLink v-if="can('patients.create')" to="/r/patients/new" class="small">+ register new patient</NuxtLink></label><LookupSelect v-model="f.patient_id" resource="patients" placeholder="Name, MRN, QID or phone" /></div>
          <div class="field"><label class="f">Doctor <span class="req">*</span></label><LookupSelect v-model="f.doctor_id" resource="doctors" /></div>
          <div class="field"><label class="f">Visit type</label><select v-model="f.visit_type"><option>OPD</option><option>Follow-up</option><option>Emergency</option><option>Tele</option></select></div>
          <div class="field"><label class="f">Payer</label><select v-model="f.payer_type"><option>Cash</option><option>Insurance</option><option>Corporate</option></select></div>
          <div v-if="f.payer_type === 'Insurance'" class="field"><label class="f">Insurance policy <span class="req">*</span></label>
            <select v-model="f.policy_id"><option :value="null">— select —</option><option v-for="p in policies" :key="p.id" :value="p.id">{{ p.payer_id__label }} · {{ p.policy_no }} · {{ p.status }} (to {{ fdate(p.valid_to) }})</option></select>
            <div v-if="f.patient_id && !policies.length" class="small muted">No policy on file. Add one under Insurance → Policy Members.</div></div>
          <div v-if="f.payer_type === 'Corporate'" class="field"><label class="f">Corporate account <span class="req">*</span></label><LookupSelect v-model="f.corporate_id" resource="corporate_accounts" /></div>
          <div class="field wide"><label class="f">Complaint / reason</label><textarea v-model="f.complaint"></textarea></div>
        </div>
        <div v-if="dupAsk" class="alert warn">This patient already has an open visit with this doctor today. Start a second one anyway? <button class="sm" @click="start(true)">Yes, start another</button></div>
        <button class="p" :disabled="busy || !f.patient_id || !f.doctor_id" @click="start(false)">{{ busy ? 'Starting…' : 'Start visit' }}</button>
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
</template>
