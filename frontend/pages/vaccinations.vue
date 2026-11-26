<script setup lang="ts">
definePageMeta({ perm: 'immunizations.view' })
const route = useRoute()
const { api } = useApi(); const { err, ok } = useUi(); const { can } = useAuth()
const patientId = ref<number | null>(route.query.patient ? Number(route.query.patient) : null)
const d = ref<any>(null); const loading = ref(false)
const needReason = ref(false); const reason = ref('')

/* ---- due list (no patient selected) ---- */
const due = ref<any>({ rows: [], total: 0, no_record: 0 }); const dueQ = ref(''); const hideNo = ref(false); const dueLoading = ref(false)
async function loadDue() {
  dueLoading.value = true
  try { due.value = await api('/vaccination-due', { query: { q: dueQ.value || undefined, hide_no_record: hideNo.value ? 1 : undefined } }) } catch (e) { err(e) } finally { dueLoading.value = false }
}
let t: any
watch([dueQ, hideNo], () => { clearTimeout(t); t = setTimeout(loadDue, 300) })

async function load(bg = '') {
  if (!patientId.value) { d.value = null; loadDue(); return }
  loading.value = true
  try { d.value = await api(`/vaccination/${patientId.value}`, { query: bg ? { breakglass: bg } : {} }); needReason.value = false }
  catch (e: any) { d.value = null; if (e.extra?.breakglass) needReason.value = true; else err(e) }
  finally { loading.value = false }
}
watch(patientId, () => { reason.value = ''; load() }, { immediate: true })

const groups = computed(() => {
  const g: Record<string, any[]> = {}
  for (const r of d.value?.rows || []) {
    const m = r.due_age_months
    const k = m === 0 ? 'At birth' : m < 24 ? `${m} months` : m % 12 === 0 ? `${m / 12} years` : `${m} months`
    ;(g[k] ||= []).push(r)
  }
  return Object.entries(g)
})
const stClass = (s: string) => ({ Given: 'green', Overdue: 'red', Due: 'amber', Upcoming: '', Optional: 'blue', Refused: 'red', Deferred: 'amber' } as any)[s] || ''

/* ---- record a dose ---- */
const form = ref<any>(null)
const today = new Date().toISOString().slice(0, 10)
function openDose(r: any, status = 'Given') {
  form.value = { vaccine_id: r.vaccine_id, vaccine: r.vaccine, dose_no: r.dose_no, status, given_on: today, source: 'This centre', batch_no: '', expiry_date: '', site: '', notes: '' }
}
const busy = ref(false)
async function saveDose() {
  const f = form.value; busy.value = true
  try {
    await api('/r/immunizations', { method: 'POST', body: { patient_id: patientId.value, vaccine_id: f.vaccine_id, dose_no: Number(f.dose_no), status: f.status, given_on: f.given_on, source: f.source, batch_no: f.batch_no || null, expiry_date: f.expiry_date || null, site: f.site || null, notes: f.notes || null } })
    ok(`${f.vaccine} dose ${f.dose_no}: ${f.status}`); form.value = null; await load(reason.value)
  } catch (e) { err(e) } finally { busy.value = false }
}
async function undo(g: any) {
  if (!confirm(`Remove this ${g.vaccine} record? (kept in the audit log)`)) return
  try { await api(`/r/immunizations/${g.id}`, { method: 'DELETE' }); ok('Removed'); await load(reason.value) } catch (e) { err(e) }
}
const vaccines = ref<any[]>([])
onMounted(async () => { try { vaccines.value = (await api('/r/vaccines', { query: { limit: 200, active: 'true', sort: 'name', dir: 'asc' } })).rows } catch { /* no permission */ } })
function openOther() {
  const v = vaccines.value[0]; if (!v) return
  form.value = { vaccine_id: v.id, vaccine: v.name, dose_no: 1, status: 'Given', given_on: today, source: 'Outside (vaccination card)', batch_no: '', expiry_date: '', site: '', notes: '', pick: true }
}
function pickVaccine() { const v = vaccines.value.find((x) => x.id === form.value.vaccine_id); if (v) form.value.vaccine = v.name }
</script>
<template>
  <div>
    <h1>Vaccinations <span class="muted small">Register, schedule and due list</span></h1>
    <div class="card no-print">
      <div class="grid g2">
        <div><label>Patient</label><LookupSelect v-model="patientId" resource="patients" placeholder="Search patient by name, MRN or QID (or leave empty for the due list)" /></div>
        <div v-if="d" class="small" style="align-self:end"><b>{{ d.patient.full_name }}</b> · {{ d.patient.mrn }} · {{ d.patient.gender }} · {{ d.patient.age_text }} (DOB {{ fdate(d.patient.dob) }})</div>
      </div>
    </div>
    <div v-if="needReason" class="card no-print">
      <div class="alert warn">You have no treating relationship with this patient. Emergency (break-glass) access is audited.</div>
      <label>Reason for access (min 8 characters)</label><input v-model="reason" placeholder="e.g. covering for the treating doctor" />
      <p><button class="p" :disabled="reason.trim().length < 8" @click="load(reason.trim())">Open record</button></p>
    </div>

    <!-- ===== due list ===== -->
    <template v-if="!patientId">
      <div class="card">
        <div class="bar" style="gap:10px">
          <input v-model="dueQ" placeholder="Search name, MRN or phone" style="max-width:300px" />
          <label class="chk"><input type="checkbox" v-model="hideNo" /> Hide children with no record entered</label>
          <div class="sp"></div>
          <span class="muted small">{{ due.total }} children · {{ due.no_record }} without any vaccination record</span>
        </div>
        <table v-if="due.rows.length">
          <thead><tr><th>Child</th><th>Age</th><th>Overdue / due</th><th>Vaccines needed</th><th>Phone</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in due.rows" :key="r.patient_id">
              <td><b>{{ r.full_name }}</b><div class="small muted">{{ r.mrn }} · {{ r.gender }}</div></td>
              <td>{{ r.age_text }}</td>
              <td><span v-if="r.no_record" class="badge">No record</span><template v-else><span v-if="r.overdue" class="badge red">{{ r.overdue }} overdue</span> <span v-if="r.due" class="badge amber">{{ r.due }} due</span></template></td>
              <td class="small">{{ r.vaccines.slice(0, 4).join(', ') }}<span v-if="r.vaccines.length > 4" class="muted"> +{{ r.vaccines.length - 4 }} more</span></td>
              <td class="small">{{ r.phone }}</td>
              <td><button class="sm" @click="patientId = r.patient_id">Open</button></td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="dueLoading" class="muted">Loading…</div>
        <div v-else class="muted">No children with vaccines due or overdue.</div>
      </div>
    </template>

    <div v-if="loading" class="muted">Loading…</div>

    <!-- ===== patient record ===== -->
    <template v-if="d">
      <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="badge green">{{ d.summary.given }} given</span>
        <span v-if="d.summary.overdue" class="badge red">{{ d.summary.overdue }} overdue</span>
        <span v-if="d.summary.due" class="badge amber">{{ d.summary.due }} due now</span>
        <span class="badge">{{ d.summary.upcoming }} upcoming</span>
        <span v-if="d.summary.declined" class="badge amber">{{ d.summary.declined }} refused / deferred</span>
        <div class="sp"></div>
        <NuxtLink :to="`/growth?patient=${d.patient.id}`" class="btn sm no-print">📈 Growth chart</NuxtLink>
        <NuxtLink :to="`/print/vaccination-card/${d.patient.id}`" class="btn sm no-print">🖨 Vaccination card</NuxtLink>
        <button v-if="can('immunizations.create')" class="sm no-print" @click="openOther">+ Other / outside dose</button>
      </div>

      <div v-if="form" class="card no-print" style="border:2px solid #111">
        <h3>{{ form.status === 'Given' ? 'Record dose' : 'Mark ' + form.status.toLowerCase() }} · {{ form.vaccine }}</h3>
        <div class="grid g4">
          <div v-if="form.pick"><label>Vaccine</label><select v-model="form.vaccine_id" @change="pickVaccine"><option v-for="v in vaccines" :key="v.id" :value="v.id">{{ v.name }}</option></select></div>
          <div><label>Dose no</label><input type="number" min="1" v-model="form.dose_no" /></div>
          <div><label>Status</label><select v-model="form.status"><option>Given</option><option>Refused</option><option>Deferred</option></select></div>
          <div><label>Date</label><input type="date" v-model="form.given_on" :max="today" /></div>
          <div><label>Source</label><select v-model="form.source"><option>This centre</option><option>Outside (vaccination card)</option><option>Other country</option></select></div>
          <template v-if="form.status === 'Given'">
            <div><label>Batch / lot no</label><input v-model="form.batch_no" /></div>
            <div><label>Vaccine expiry</label><input type="date" v-model="form.expiry_date" /></div>
            <div><label>Site</label><select v-model="form.site"><option value=""></option><option>Left thigh</option><option>Right thigh</option><option>Left arm</option><option>Right arm</option><option>Oral</option><option>Other</option></select></div>
          </template>
          <div><label>Notes</label><input v-model="form.notes" :placeholder="form.status === 'Given' ? '' : 'Reason'" /></div>
        </div>
        <p><button class="p" :disabled="busy" @click="saveDose">Save</button> <button @click="form = null">Cancel</button></p>
      </div>

      <div class="card">
        <table>
          <thead><tr><th>Vaccine</th><th>Dose</th><th>Due</th><th>Status</th><th>Given on</th><th>Batch</th><th>Source</th><th class="no-print"></th></tr></thead>
          <tbody v-for="[label, items] in groups" :key="label">
            <tr class="grp"><td colspan="8"><b>{{ label }}</b></td></tr>
            <tr v-for="r in items" :key="r.vaccine_id + '-' + r.dose_no">
              <td>{{ r.vaccine }}<div class="small muted">{{ r.protects_against }}</div></td>
              <td>{{ r.dose_no }}<span v-if="r.label" class="small muted"> · {{ r.label }}</span></td>
              <td>{{ fdate(r.due_date) }}</td>
              <td><span class="badge" :class="stClass(r.status)">{{ r.status }}</span></td>
              <td>{{ r.given ? fdate(r.given.given_on) : '' }}</td>
              <td class="small">{{ r.given?.batch_no || '' }}</td>
              <td class="small">{{ r.given?.source || '' }}</td>
              <td class="no-print" style="white-space:nowrap">
                <template v-if="can('immunizations.create') && r.status !== 'Given'"><button class="sm p" @click="openDose(r)">Give</button> <button class="sm" @click="openDose(r, 'Refused')">Refused</button> <button class="sm" @click="openDose(r, 'Deferred')">Defer</button></template>
                <button v-else-if="r.given && can('immunizations.delete')" class="sm" @click="undo(r.given)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="small muted" style="margin-top:8px">Schedule follows the Qatar MoPH national immunisation schedule as configured under Vaccine Master. Doses marked Optional (influenza, meningococcal, hepatitis A, HPV) are recommended in specific situations and do not count as overdue. Check the current MoPH schedule before go-live.</div>
      </div>

      <div v-if="d.extra.length" class="card">
        <h3>Other recorded vaccines</h3>
        <table><thead><tr><th>Vaccine</th><th>Dose</th><th>Status</th><th>Date</th><th>Batch</th><th>Source</th><th class="no-print"></th></tr></thead>
          <tbody><tr v-for="g in d.extra" :key="g.id"><td>{{ g.vaccine }}</td><td>{{ g.dose_no }}</td><td><span class="badge" :class="stClass(g.status)">{{ g.status }}</span></td><td>{{ fdate(g.given_on) }}</td><td class="small">{{ g.batch_no }}</td><td class="small">{{ g.source }}</td>
            <td class="no-print"><button v-if="can('immunizations.delete')" class="sm" @click="undo(g)">Remove</button></td></tr></tbody></table>
      </div>
    </template>
  </div>
</template>
