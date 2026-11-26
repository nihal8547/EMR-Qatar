<script setup lang="ts">
definePageMeta({ perm: 'consult.use' })
const route = useRoute()
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const vid = computed(() => Number(route.params.id))
const d = ref<any>(null)
const tab = ref('notes')
const busy = ref(false)
const enc = reactive<any>({ chief_complaint: '', history: '', examination: '', assessment: '', plan: '', follow_up_date: '' })
const dxPick = ref<any>(null)
const tests = ref<any[]>([]); const panels = ref<any[]>([]); const radSvc = ref<any[]>([]); const modalities = ref<any[]>([]); const procSvc = ref<any[]>([])
const labSel = reactive<{ ids: number[]; panel: number | null; priority: string }>({ ids: [], panel: null, priority: 'Routine' })
const img = reactive<any>({ service_id: null, modality_id: null, clinical_info: '', priority: 'Routine' })
const proc = reactive<any>({ service_id: null, notes: '' })
const rx = ref<any[]>([{ drug_id: null, dose: '', frequency: '', duration_days: null, qty: null, instructions: '' }])
const warnings = ref<any[]>([]); const blocked = ref(false)
const followUp = ref('')
const testItems = computed(() => tests.value.map((t: any) => ({ id: t.id, name: t.name, sub: t.code, group: t.sample_type, price: undefined })))
const testGroups = computed(() => [...new Set(tests.value.map((t: any) => t.sample_type).filter(Boolean))] as string[])
const radItems = computed(() => radSvc.value.map((x: any) => ({ id: x.id, name: x.name, sub: x.code, price: x.price })))
const procItems = computed(() => procSvc.value.map((x: any) => ({ id: x.id, name: x.name, sub: x.code, price: x.price })))
const panelItems = computed(() => panels.value.map((x: any) => ({ id: x.id, name: x.name })))
const modName = (id: number) => modalities.value.find((m: any) => m.id === id)?.name

async function load() {
  try {
    d.value = await api(`/consult/${vid.value}`)
    if (d.value.encounter) Object.assign(enc, { chief_complaint: '', history: '', examination: '', assessment: '', plan: '', follow_up_date: '' }, d.value.encounter, { follow_up_date: d.value.encounter.follow_up_date ? fdate(d.value.encounter.follow_up_date) : '' })
    else if (!enc.chief_complaint) enc.chief_complaint = d.value.visit.complaint || ''
  } catch (e) { err(e) }
}
async function loadCatalogs() {
  const get = async (p: string, q: any = {}) => { if (!can(p.replace('/r/', '') + '.view')) return []; try { return (await api(p, { query: { limit: 200, ...q } })).rows } catch { return [] } }
  ;[tests.value, panels.value, radSvc.value, modalities.value, procSvc.value] = await Promise.all([
    get('/r/lab_tests', { active: 'true', sort: 'name', dir: 'asc' }), get('/r/lab_panels'), get('/r/services', { category: 'Radiology' }), get('/r/imaging_modalities'), get('/r/services', { category: 'Procedure' })])
}
onMounted(() => { load(); loadCatalogs() })
const done = computed(() => d.value?.visit.status === 'Completed' || d.value?.encounter?.status === 'Completed')

async function run(fn: () => Promise<any>, msg?: string) { busy.value = true; try { const r = await fn(); if (msg) ok(msg); await load(); return r } catch (e) { err(e); return null } finally { busy.value = false } }
const saveNotes = () => run(() => api(`/consult/${vid.value}/encounter`, { method: 'PUT', body: enc }), 'Notes saved')
const addDx = () => run(async () => { await api(`/consult/${vid.value}/diagnoses`, { method: 'POST', body: { code_id: dxPick.value } }); dxPick.value = null }, 'Diagnosis added')
const delDx = (id: number) => run(() => api(`/consult/${vid.value}/diagnoses/${id}`, { method: 'DELETE' }))
const orderLab = () => run(async () => { await api(`/consult/${vid.value}/lab-orders`, { method: 'POST', body: { test_ids: labSel.ids, panel_id: labSel.panel, priority: labSel.priority } }); labSel.ids = []; labSel.panel = null }, 'Lab order placed')
const orderImg = () => run(async () => { await api(`/consult/${vid.value}/imaging-orders`, { method: 'POST', body: img }); Object.assign(img, { service_id: null, modality_id: null, clinical_info: '' }) }, 'Imaging ordered')
const orderProc = () => run(async () => { await api(`/consult/${vid.value}/procedures`, { method: 'POST', body: proc }); Object.assign(proc, { service_id: null, notes: '' }) }, 'Procedure ordered')
const cancelOrder = (type: string, id: number) => { if (confirm('Cancel this order?')) run(() => api(`/consult/${vid.value}/cancel-order`, { method: 'POST', body: { type, id } }), 'Cancelled') }
const toggleTest = (id: number) => { const i = labSel.ids.indexOf(id); if (i >= 0) labSel.ids.splice(i, 1); else labSel.ids.push(id) }

async function prescribe(ack = false) {
  const items = rx.value.filter((r) => r.drug_id)
  busy.value = true
  try {
    await api(`/consult/${vid.value}/prescriptions`, { method: 'POST', body: { items, ack_warnings: ack } })
    ok('Prescription saved'); warnings.value = []; blocked.value = false
    rx.value = [{ drug_id: null, dose: '', frequency: '', duration_days: null, qty: null, instructions: '' }]; await load()
  } catch (e: any) {
    if (e.status === 409 && e.extra?.warnings) { warnings.value = e.extra.warnings; blocked.value = !e.extra.needs_ack } else err(e)
  } finally { busy.value = false }
}
async function complete() {
  if (!confirm('Complete this consultation and send the patient onward?')) return
  const r = await run(() => api(`/consult/${vid.value}/complete`, { method: 'POST', body: { follow_up_date: followUp.value || enc.follow_up_date || null } }))
  if (r) { ok(`Done. Patient moved to: ${r.next_status}`); navigateTo('/consult') }
}
const flagCls = (f: string) => (f?.startsWith('Critical') ? 'flag-C' : f === 'High' || f === 'Low' ? 'flag-H' : '')
const tabs = computed(() => [['notes', 'Consultation', d.value?.diagnoses?.length || 0], ['orders', 'Lab / Imaging / Procedures', (d.value?.lab_orders?.length || 0) + (d.value?.imaging_orders?.length || 0) + (d.value?.procedures?.length || 0)], ['rx', 'Prescription', d.value?.prescriptions?.length || 0], ['history', 'History', d.value?.past_visits?.length || 0]] as [string, string, number][])
</script>
<template>
  <div v-if="d">
    <div class="bar"><NuxtLink to="/consult">‹ My consultations</NuxtLink><div class="sp"></div><NuxtLink v-if="d?.visit?.patient_id && can('immunizations.view')" :to="`/vaccinations?patient=${d.visit.patient_id}`" class="btn sm">💉 Vaccines</NuxtLink><NuxtLink v-if="d?.visit?.patient_id && can('growth_measurements.view')" :to="`/growth?patient=${d.visit.patient_id}`" class="btn sm">📈 Growth</NuxtLink><NuxtLink :to="`/print/visit-summary/${d?.visit?.id || route.params.id}`" class="btn sm">🖨 Visit summary</NuxtLink><NuxtLink v-if="d?.lab_orders?.length || d?.imaging_orders?.length" :to="`/print/results/${d?.visit?.id || route.params.id}`" class="btn sm">🖨 All results</NuxtLink>
      <NuxtLink v-if="can('patients.360')" :to="`/patient/${d.patient.id}`" class="btn">Patient 360</NuxtLink>
      <NuxtLink :to="`/r/certificates/new?visit_id=${vid}`" class="btn">Medical certificate</NuxtLink><NuxtLink :to="`/r/referrals/new?visit_id=${vid}`" class="btn">Referral</NuxtLink>
    </div>
    <div class="card sticky-hdr">
      <div class="bar" style="margin:0"><h1 style="margin:0">{{ d.patient.full_name }}</h1><span class="muted">{{ d.patient.mrn }} · {{ d.patient.age }} y · {{ d.patient.gender }} · {{ d.patient.blood_group || 'blood group n/a' }}</span><div class="sp"></div><span class="badge" :class="badgeClass(d.visit.status)">{{ d.visit.status }}</span><span class="badge">{{ d.visit.visit_no }} · {{ d.visit.payer_type }}</span></div>
      <div v-if="d.allergies.length" class="alert err" style="margin:10px 0 0"><b>Allergies:</b> <span v-for="a in d.allergies" :key="a.allergen" class="badge red" style="margin-right:4px">{{ a.allergen }}{{ a.reaction ? ' – ' + a.reaction : '' }}{{ a.severity ? ' (' + a.severity + ')' : '' }}</span></div>
      <div v-else class="muted small" style="margin-top:8px">No known allergies recorded.</div>
      <div v-if="d.vitals" class="vt"><div class="vt-i"><b>{{ d.vitals.temperature ?? '–' }}</b><span>Temp °C</span></div><div class="vt-i"><b>{{ d.vitals.pulse ?? '–' }}</b><span>Pulse</span></div><div class="vt-i"><b>{{ d.vitals.bp_systolic ?? '–' }}/{{ d.vitals.bp_diastolic ?? '–' }}</b><span>BP</span></div><div class="vt-i"><b>{{ d.vitals.spo2 ?? '–' }}</b><span>SpO₂ %</span></div><div class="vt-i"><b>{{ d.vitals.weight_kg ?? '–' }}</b><span>Weight kg</span></div><div v-if="d.vitals.triage_level" class="vt-i"><b>{{ d.vitals.triage_level }}</b><span>Triage</span></div></div>
      <div v-else class="muted small" style="margin-top:8px">No vitals recorded yet for this visit.</div>
      <div v-if="d.preauths.length" class="small" style="margin-top:6px"><b>Pre-authorisations:</b> <span v-for="p in d.preauths" :key="p.auth_no" class="badge" :class="badgeClass(p.status)" style="margin-right:4px">{{ p.name }}: {{ p.status }}</span></div>
    </div>
    <div v-if="done" class="alert info">This consultation is completed. Notes are locked; use the History tab or ask the doctor in charge for changes.</div>
    <div class="tabs"><button v-for="t in tabs" :key="t[0]" :class="{ on: tab === t[0] }" @click="tab = t[0]">{{ t[1] }}<span v-if="t[2]" class="badge" style="margin-left:6px">{{ t[2] }}</span></button></div>

    <div v-show="tab === 'notes'">
      <div class="card"><h2>Notes</h2>
        <div class="fgrid">
          <div class="field wide"><label class="f">Chief complaint</label><textarea v-model="enc.chief_complaint" :disabled="done"></textarea></div>
          <div class="field wide"><label class="f">History of present illness</label><textarea v-model="enc.history" :disabled="done"></textarea></div>
          <div class="field wide"><label class="f">Examination</label><textarea v-model="enc.examination" :disabled="done"></textarea></div>
          <div class="field"><label class="f">Assessment</label><textarea v-model="enc.assessment" :disabled="done"></textarea></div>
          <div class="field"><label class="f">Plan</label><textarea v-model="enc.plan" :disabled="done"></textarea></div>
          <div class="field"><label class="f">Follow-up date</label><input type="date" v-model="enc.follow_up_date" :disabled="done" /></div>
        </div>
        <button v-if="!done" class="p" :disabled="busy" @click="saveNotes">Save notes</button>
      </div>
      <div class="card"><h2>Diagnoses (ICD-10)</h2>
        <div v-for="x in d.diagnoses" :key="x.id" class="bar" style="margin-bottom:4px"><span class="badge" :class="x.dx_type === 'Primary' ? 'blue' : 'grey'">{{ x.dx_type }}</span><b>{{ x.code }}</b> {{ x.description }}<div class="sp"></div><button v-if="!done" class="sm danger" @click="delDx(x.id)">Remove</button></div>
        <div v-if="!d.diagnoses.length" class="muted small">No diagnosis yet. One is mandatory before completing (and for insurance claims).</div>
        <div v-if="!done" class="bar" style="margin-top:8px"><div style="width:380px"><LookupSelect v-model="dxPick" resource="diagnosis_codes" placeholder="Search ICD-10 code or description" /></div><button :disabled="!dxPick || busy" @click="addDx">Add diagnosis</button></div>
      </div>
      <div class="card" v-if="!done"><h2>Finish</h2><div class="bar"><span class="muted small">Follow-up (optional)</span><input type="date" v-model="followUp" style="width:160px" /><button class="ok" :disabled="busy" @click="complete">✔ Complete consultation</button></div>
        <div class="muted small">Moves the patient to Diagnostics, Pharmacy or Billing depending on what is pending.</div></div>
    </div>

    <div v-show="tab === 'orders'">
      <div class="card"><h2>Laboratory</h2>
        <div v-for="o in d.lab_orders" :key="o.id" class="card" style="padding:10px;background:#fafbfc"><div class="bar" style="margin:0"><b>{{ o.order_no }}</b><span class="badge" :class="badgeClass(o.status)">{{ o.status }}</span><span class="badge grey">{{ o.priority }}</span><div class="sp"></div><NuxtLink :to="`/print/lab-slip/${o.id}`" class="btn sm">🖨 Request</NuxtLink><NuxtLink v-if="['Resulted', 'Validated', 'Completed', 'Reported'].includes(o.status)" :to="`/print/lab/${o.id}`" class="btn sm">🖨 Results</NuxtLink><button v-if="o.status === 'Ordered' && !done" class="sm danger" @click="cancelOrder('lab', o.id)">Cancel</button></div>
          <table><tbody><tr v-for="i in o.items" :key="i.id"><td>{{ i.test }}</td><td><span v-if="i.result" :class="flagCls(i.flag)">{{ i.result }} {{ i.unit }}</span><span v-else class="muted">pending</span></td><td><span v-if="i.flag" class="small" :class="flagCls(i.flag)">{{ i.flag }}</span></td><td><span class="badge" :class="badgeClass(i.status)">{{ i.status }}</span></td></tr></tbody></table></div>
        <div v-if="!done" class="grid g2"><div><label class="f">Search &amp; pick tests</label><SearchPick v-model="labSel.ids" :items="testItems" :groups="testGroups" multiple placeholder="Search test name or code (e.g. CBC, glucose, HbA1c)" /></div>
          <div><label class="f">…or a panel</label><select v-model="labSel.panel"><option :value="null">—</option><option v-for="p in panels" :key="p.id" :value="p.id">{{ p.name }}</option></select><label class="f" style="margin-top:8px">Priority</label><select v-model="labSel.priority"><option>Routine</option><option>Urgent</option><option>STAT</option></select><button class="p" style="margin-top:10px" :disabled="busy || (!labSel.ids.length && !labSel.panel)" @click="orderLab">Order {{ labSel.ids.length ? labSel.ids.length + ' test(s)' : 'lab tests' }}</button></div></div>
      </div>
      <div class="card"><h2>Imaging</h2>
        <table v-if="d.imaging_orders.length"><tbody><tr v-for="o in d.imaging_orders" :key="o.id"><td>{{ o.order_no }}</td><td><b>{{ o.study }}</b></td><td><span class="badge" :class="badgeClass(o.status)">{{ o.status }}</span></td><td>{{ o.impression }}</td><td><NuxtLink v-if="o.status === 'Reported'" :to="`/print/imaging/${o.id}`" class="btn sm">🖨 Report</NuxtLink> <button v-if="o.status === 'Ordered' && !done" class="sm danger" @click="cancelOrder('imaging', o.id)">Cancel</button></td></tr></tbody></table>
        <div v-if="!done" class="grid g2" style="margin-top:8px"><div><label class="f">Search imaging study</label><SearchPick v-model="img.service_id" :items="radItems" placeholder="Search X-ray, CT, MRI, ultrasound… (e.g. chest, knee, abdomen)" /></div>
          <div><label class="f">Modality</label><select v-model="img.modality_id"><option :value="null">—</option><option v-for="m in modalities" :key="m.id" :value="m.id">{{ m.name }}</option></select><label class="f" style="margin-top:8px">Priority</label><select v-model="img.priority"><option>Routine</option><option>Urgent</option><option>STAT</option></select><label class="f" style="margin-top:8px">Clinical information</label><input v-model="img.clinical_info" /></div></div>
        <button v-if="!done" :disabled="busy || !img.service_id" @click="orderImg">Order imaging</button>
      </div>
      <div class="card"><h2>Procedures</h2>
        <table v-if="d.procedures.length"><tbody><tr v-for="p in d.procedures" :key="p.id"><td>{{ p.name }}</td><td><span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span></td><td><button v-if="p.status === 'Ordered' && !done" class="sm danger" @click="cancelOrder('procedure', p.id)">Cancel</button></td></tr></tbody></table>
        <div v-if="!done" class="grid g2" style="margin-top:8px"><div><label class="f">Search procedure</label><SearchPick v-model="proc.service_id" :items="procItems" placeholder="Search procedure (e.g. dressing, suturing, ECG)" /></div><div><label class="f">Notes</label><input v-model="proc.notes" /><button class="p" style="margin-top:10px" :disabled="busy || !proc.service_id" @click="orderProc">Order procedure</button></div></div>
      </div>
      <p class="muted small">Every order adds its charge to the visit bill automatically. Insurance visits request pre-authorisation where the service needs it.</p>
    </div>

    <div v-show="tab === 'rx'">
      <div v-for="p in d.prescriptions" :key="p.id" class="card"><div class="bar" style="margin:0"><b>{{ p.rx_no }}</b><span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span><div class="sp"></div><NuxtLink :to="`/print/rx/${p.id}`" class="btn sm">🖨 Print</NuxtLink></div>
        <table><thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Days</th><th class="num">Qty</th><th class="num">Dispensed</th></tr></thead><tbody><tr v-for="i in p.items" :key="i.id"><td>{{ i.drug }}</td><td>{{ i.dose }}</td><td>{{ i.frequency }}</td><td>{{ i.days }}</td><td class="num">{{ i.qty }}</td><td class="num">{{ i.dispensed }}</td></tr></tbody></table></div>
      <div v-if="!done" class="card"><h2>New prescription</h2>
        <div v-if="warnings.length" class="alert" :class="blocked ? 'err' : 'warn'"><b>{{ blocked ? 'Blocked – contraindicated combination' : 'Safety warnings' }}</b>
          <ul style="margin:6px 0 6px 18px;padding:0"><li v-for="w in warnings" :key="w.text">{{ w.text }}</li></ul>
          <div v-if="!blocked"><button class="danger" @click="prescribe(true)">I have reviewed – prescribe anyway</button> <button @click="warnings = []">Change prescription</button></div></div>
        <table><thead><tr><th style="width:26%">Medicine</th><th>Dose</th><th>Frequency</th><th style="width:80px">Days</th><th style="width:80px">Qty</th><th>Instructions</th><th></th></tr></thead>
          <tbody><tr v-for="(r, i) in rx" :key="i"><td><LookupSelect v-model="r.drug_id" resource="drugs" /></td><td><input v-model="r.dose" placeholder="500 mg" /></td><td><input v-model="r.frequency" placeholder="TID" /></td><td><input type="number" v-model.number="r.duration_days" /></td><td><input type="number" v-model.number="r.qty" /></td><td><input v-model="r.instructions" /></td><td><button class="sm" @click="rx.splice(i, 1)" :disabled="rx.length === 1">✕</button></td></tr></tbody></table>
        <div class="bar" style="margin-top:8px"><button @click="rx.push({ drug_id: null, dose: '', frequency: '', duration_days: null, qty: null, instructions: '' })">+ Add medicine</button><button class="p" :disabled="busy || !rx.some((r) => r.drug_id)" @click="prescribe(false)">Save prescription</button></div>
        <div class="muted small">Checks run automatically: patient allergies (including drug classes) and interactions with current medicines.</div></div>
    </div>

    <div v-show="tab === 'history'">
      <div class="card"><h2>Previous visits</h2><div v-if="!d.past_visits.length" class="muted">No earlier visits.</div>
        <table v-else><thead><tr><th>Date</th><th>Visit</th><th>Complaint</th><th>Assessment</th><th>Diagnoses</th></tr></thead><tbody><tr v-for="v in d.past_visits" :key="v.visit_no"><td>{{ fdate(v.visit_date) }}</td><td>{{ v.visit_no }}</td><td>{{ v.chief_complaint }}</td><td>{{ v.assessment }}</td><td>{{ v.diagnoses }}</td></tr></tbody></table></div>
      <div class="card"><h2>Charges so far</h2><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody><tr v-for="(c, i) in d.charges" :key="i"><td>{{ c.description }}</td><td class="num">{{ c.qty }}</td><td class="num">{{ money(c.amount) }}</td><td>{{ c.status }}</td></tr></tbody></table></div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
<style scoped>
.sticky-hdr{position:sticky;top:0;z-index:5}
.vt{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.vt-i{background:#f6f7f9;border-radius:8px;padding:6px 12px;display:flex;flex-direction:column;min-width:78px}.vt-i b{font-size:16px}.vt-i span{font-size:11px;color:#6b7280}
</style>
