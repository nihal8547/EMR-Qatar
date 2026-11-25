<script setup lang="ts">
definePageMeta({ perm: 'dental.chart' })
const route = useRoute()
const { api } = useApi(); const { err, ok } = useUi(); const { can } = useAuth()
const patientId = ref<number | null>(route.query.patient ? Number(route.query.patient) : null)
const d = ref<any>(null)
const loading = ref(false)
const needReason = ref(false); const reason = ref('')
const tab = ref<'chart' | 'plans' | 'history'>('chart')
const dentition = ref<'Permanent' | 'Primary'>('Permanent')
const sel = ref<string | null>(null)

const SURFACES = ['Whole tooth', 'M', 'O', 'D', 'B', 'L', 'MO', 'DO', 'MOD', 'Incisal', 'Cervical', 'Root']
const CONDITIONS = ['Healthy', 'Caries', 'Filling', 'Crown', 'Bridge', 'Root canal', 'Implant', 'Missing', 'Extracted', 'Fractured', 'Impacted', 'Sealant', 'Veneer', 'Mobility', 'Periapical lesion', 'Planned extraction']
const LEGEND: Record<string, string> = { Caries: '#d64545', Filling: '#3b82c4', Crown: '#c9a227', 'Root canal': '#8b5cf6', Implant: '#0f9d8a', Missing: '#e5e7eb', Fractured: '#e8833a', Impacted: '#6b7280', Sealant: '#7fc8a9', Veneer: '#e9d8a6', Mobility: '#f2b8c6', 'Periapical lesion': '#b45309', 'Planned extraction': '#f59e0b' }
const ROWS: Record<string, { upper: string[]; lower: string[] }> = {
  Permanent: { upper: ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'], lower: ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'] },
  Primary: { upper: ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'], lower: ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'] },
}

async function load(bg = '') {
  if (!patientId.value) { d.value = null; return }
  loading.value = true
  try { d.value = await api(`/dental/chart/${patientId.value}`, { query: bg ? { breakglass: bg } : {} }); needReason.value = false; sel.value = null }
  catch (e: any) { d.value = null; if (e.extra?.breakglass) needReason.value = true; else err(e) }
  finally { loading.value = false }
}
watch(patientId, () => { reason.value = ''; load() }, { immediate: true })

// latest entry per (tooth, surface) already arrives from the API; derive per-zone colour source
const byTooth = computed(() => {
  const m: Record<string, any[]> = {}
  for (const e of d.value?.state || []) if (e.dentition === dentition.value) (m[e.tooth_no] ||= []).push(e)
  return m
})
function zonesOf(no: string) {
  const z: Record<string, string> = {}; const best: Record<string, number> = {}
  for (const e of byTooth.value[no] || []) {
    const s = e.surface
    const zs = s === 'Whole tooth' ? ['M', 'D', 'O', 'B', 'L'] : s === 'Incisal' ? ['O'] : ['M', 'D', 'O', 'B', 'L'].filter((c) => s.includes(c) && s.length <= 3 && /^[MODBL]+$/.test(s))
    for (const k of zs) if (!best[k] || e.id > best[k]) { best[k] = e.id; z[k] = e.condition }
  }
  return z
}
const wholeOf = (no: string) => (byTooth.value[no] || []).filter((e) => e.surface === 'Whole tooth').sort((a, b) => b.id - a.id)[0]?.condition
const plannedTeeth = computed(() => new Set((d.value?.plans || []).filter((p: any) => ['Proposed', 'Accepted', 'In Progress'].includes(p.status)).flatMap((p: any) => p.items.filter((i: any) => i.status === 'Planned' && i.tooth_no && i.dentition === dentition.value).map((i: any) => i.tooth_no))))
const selEntries = computed(() => (sel.value ? (byTooth.value[sel.value] || []).filter((e) => e.condition !== 'Healthy' || true) : []))

/* ---- record a finding ---- */
const f = reactive<any>({ surface: 'Whole tooth', condition: 'Caries', notes: '', visit_id: null })
const busy = ref(false)
async function saveEntry() {
  if (!sel.value) return
  busy.value = true
  try {
    await api('/r/dental_chart_entries', { method: 'POST', body: { patient_id: patientId.value, visit_id: f.visit_id || null, dentition: dentition.value, tooth_no: sel.value, surface: f.surface, condition: f.condition, notes: f.notes || null } })
    ok(`Tooth ${sel.value}: ${f.condition} recorded`); f.notes = ''; await load(reason.value)
  } catch (e) { err(e) } finally { busy.value = false }
}
async function undoEntry(e: any) {
  if (!confirm(`Remove the ${e.condition} entry for tooth ${e.tooth_no}?`)) return
  try { await api(`/r/dental_chart_entries/${e.id}`, { method: 'DELETE' }); ok('Entry removed'); await load(reason.value) } catch (x) { err(x) }
}

/* ---- treatment plans ---- */
const planBusy = ref(false)
async function newPlan() {
  planBusy.value = true
  try { await api('/r/dental_treatment_plans', { method: 'POST', body: { patient_id: patientId.value, status: 'Proposed' } }); ok('Plan created'); await load(reason.value); tab.value = 'plans' } catch (e) { err(e) } finally { planBusy.value = false }
}
const item = reactive<any>({ plan_id: null, service_id: null, tooth_no: '', surface: 'Whole tooth', fee: '' })
watch(sel, (v) => { item.tooth_no = v || '' })
async function addItem() {
  if (!item.plan_id || !item.service_id) return err(new Error('Choose a plan and a procedure'))
  planBusy.value = true
  try {
    await api('/r/dental_plan_items', { method: 'POST', body: { plan_id: item.plan_id, dentition: dentition.value, tooth_no: item.tooth_no || null, surface: item.surface, service_id: item.service_id, fee: item.fee === '' ? null : Number(item.fee) } })
    ok('Procedure added to plan'); item.service_id = null; item.fee = ''; await load(reason.value)
  } catch (e) { err(e) } finally { planBusy.value = false }
}
const openPlans = computed(() => (d.value?.plans || []).filter((p: any) => !['Completed', 'Cancelled'].includes(p.status)))
watch(openPlans, (p) => { if (p.length && !p.find((x: any) => x.id === item.plan_id)) item.plan_id = p[0].id }, { immediate: true })
async function setPlanStatus(p: any, status: string) {
  try { await api(`/r/dental_treatment_plans/${p.id}`, { method: 'PUT', body: { status } }); ok(`Plan ${p.plan_no}: ${status}`); await load(reason.value) } catch (e) { err(e) }
}
const done = reactive<any>({ item: null, visit_id: null, condition: '' })
function startDone(i: any) { done.item = i; done.visit_id = d.value.open_visits[0]?.id || null; done.condition = ({ 'Tooth filling (composite)': 'Filling', 'Root canal treatment': 'Root canal', 'Tooth extraction (simple)': 'Extracted', 'Surgical extraction': 'Extracted', 'Crown (porcelain fused to metal)': 'Crown' } as any)[i.service] || '' }
async function completeItem() {
  if (!done.visit_id) return err(new Error('Select the visit to bill'))
  planBusy.value = true
  try {
    await api(`/dental/plan-items/${done.item.id}/complete`, { method: 'POST', body: { visit_id: done.visit_id, condition: done.condition || undefined } })
    ok('Procedure completed and charged to the visit'); done.item = null; await load(reason.value)
  } catch (e) { err(e) } finally { planBusy.value = false }
}
async function cancelItem(i: any) {
  if (!confirm('Cancel this planned procedure?')) return
  try { await api(`/dental/plan-items/${i.id}/cancel`, { method: 'POST' }); ok('Cancelled'); await load(reason.value) } catch (e) { err(e) }
}
const age = computed(() => { const b = d.value?.patient?.dob; if (!b) return ''; return Math.floor((Date.now() - new Date(b).getTime()) / 31557600000) + ' y' })
</script>
<template>
  <div>
    <h1>Dental Chart</h1>
    <div class="card">
      <div class="grid g2">
        <div><label>Patient</label><LookupSelect v-model="patientId" resource="patients" placeholder="Search patient by name, MRN or QID" /></div>
        <div v-if="d" class="small" style="align-self:end"><b>{{ d.patient.full_name }}</b> · {{ d.patient.mrn }} · {{ d.patient.gender }} {{ age }}
          <span v-for="a in d.allergies" :key="a.allergen" class="badge red" style="margin-left:6px">Allergy: {{ a.allergen }}</span></div>
      </div>
    </div>

    <div v-if="needReason" class="card">
      <div class="alert warn">You have no treating relationship with this patient. Emergency (break-glass) access is audited.</div>
      <label>Reason for access (min 8 characters)</label><input v-model="reason" placeholder="e.g. covering for Dr. Layla, patient in pain" />
      <p><button class="p" :disabled="reason.trim().length < 8" @click="load(reason.trim())">Open chart</button></p>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!patientId" class="card muted">Choose a patient to open their dental chart.</div>

    <template v-if="d">
      <div class="tabs">
        <button :class="{ on: tab === 'chart' }" @click="tab = 'chart'">Chart</button>
        <button :class="{ on: tab === 'plans' }" @click="tab = 'plans'">Treatment plans <span class="badge grey">{{ d.plans.length }}</span></button>
        <button :class="{ on: tab === 'history' }" @click="tab = 'history'">History <span class="badge grey">{{ d.history.length }}</span></button>
      </div>

      <div v-show="tab === 'chart'" class="grid" style="grid-template-columns:minmax(0,1fr) 280px;align-items:start">
        <div class="card" style="overflow-x:auto">
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button :class="{ p: dentition === 'Permanent' }" @click="dentition = 'Permanent'; sel = null">Permanent (adult)</button>
            <button :class="{ p: dentition === 'Primary' }" @click="dentition = 'Primary'; sel = null">Primary (child)</button>
          </div>
          <div class="muted small" style="text-align:center">Upper · patient's right ◄ ► patient's left</div>
          <div class="arch">
            <template v-for="(n, i) in ROWS[dentition].upper" :key="n">
              <ToothTile :no="n" :zones="zonesOf(n)" :whole="wholeOf(n)" :upper="true" :mesial-right="i < ROWS[dentition].upper.length / 2" :selected="sel === n" :plan="plannedTeeth.has(n)" @pick="sel = n" />
              <i v-if="i === ROWS[dentition].upper.length / 2 - 1" class="mid" />
            </template>
          </div>
          <hr style="margin:6px 0;border:0;border-top:1px dashed #ccc" />
          <div class="arch">
            <template v-for="(n, i) in ROWS[dentition].lower" :key="n">
              <ToothTile :no="n" :zones="zonesOf(n)" :whole="wholeOf(n)" :upper="false" :mesial-right="i < ROWS[dentition].lower.length / 2" :selected="sel === n" :plan="plannedTeeth.has(n)" @pick="sel = n" />
              <i v-if="i === ROWS[dentition].lower.length / 2 - 1" class="mid" />
            </template>
          </div>
          <div class="muted small" style="text-align:center">Lower</div>
          <div class="legend"><span v-for="(c, k) in LEGEND" :key="k"><i :style="{ background: c }" />{{ k }}</span><span><i style="background:#f59e0b;border-radius:50%" />Planned treatment</span></div>
          <p class="muted small">Zones: B buccal/labial, L lingual/palatal, M mesial, D distal, O occlusal/incisal. FDI numbering.</p>
        </div>

        <div class="card">
          <template v-if="sel">
            <h3 style="margin-top:0">Tooth {{ sel }}</h3>
            <div v-if="!selEntries.length" class="muted small">No findings recorded.</div>
            <table v-else class="t"><tbody>
              <tr v-for="e in selEntries" :key="e.id"><td>{{ e.surface }}</td><td>{{ e.condition }}<div v-if="e.notes" class="muted small">{{ e.notes }}</div></td>
                <td style="text-align:right"><button v-if="can('dental_chart_entries.delete')" class="sm" title="Remove entry" @click="undoEntry(e)">✕</button></td></tr>
            </tbody></table>
            <template v-if="can('dental_chart_entries.create')">
              <hr style="border:0;border-top:1px solid #eee;margin:10px 0" />
              <label>Surface</label><select v-model="f.surface"><option v-for="s in SURFACES" :key="s">{{ s }}</option></select>
              <label>Condition</label><select v-model="f.condition"><option v-for="c in CONDITIONS" :key="c">{{ c }}</option></select>
              <label>Visit (optional)</label>
              <select v-model="f.visit_id"><option :value="null">— none —</option><option v-for="v in d.open_visits" :key="v.id" :value="v.id">{{ v.visit_no }}</option></select>
              <label>Notes</label><input v-model="f.notes" maxlength="200" />
              <p><button class="p" :disabled="busy" @click="saveEntry">Record on chart</button></p>
            </template>
          </template>
          <div v-else class="muted">Click a tooth to see its findings and record a new one.</div>
        </div>
      </div>

      <div v-show="tab === 'plans'">
        <div v-if="can('dental_treatment_plans.create')" style="margin-bottom:12px"><button class="p" :disabled="planBusy" @click="newPlan">+ New treatment plan</button></div>
        <div v-if="!d.plans.length" class="card muted">No treatment plans yet.</div>
        <div v-for="p in d.plans" :key="p.id" class="card">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div><b>{{ p.plan_no }}</b> <span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span> <span class="muted small">{{ fdate(p.plan_date) }} · {{ p.doctor || '—' }}</span></div>
            <div><b>{{ money(p.total) }}</b>
              <template v-if="can('dental_treatment_plans.edit')">
                <button v-if="p.status === 'Proposed'" class="sm" @click="setPlanStatus(p, 'Accepted')">Patient accepted</button>
                <button v-if="!['Completed', 'Cancelled'].includes(p.status)" class="sm" @click="setPlanStatus(p, 'Cancelled')">Cancel plan</button>
              </template></div>
          </div>
          <table class="t" style="margin-top:8px"><thead><tr><th>Tooth</th><th>Surface</th><th>Procedure</th><th>Fee</th><th>Status</th><th /></tr></thead><tbody>
            <tr v-for="i in p.items" :key="i.id"><td>{{ i.tooth_no || 'Whole mouth' }}</td><td>{{ i.tooth_no ? i.surface : '—' }}</td><td>{{ i.service }}</td><td>{{ money(i.fee) }}</td>
              <td><span class="badge" :class="badgeClass(i.status)">{{ i.status }}</span><span v-if="i.done_on" class="muted small"> {{ fdate(i.done_on) }}</span></td>
              <td style="text-align:right"><template v-if="i.status === 'Planned' && can('dental.complete')"><button class="sm p" @click="startDone(i)">Complete</button> <button class="sm" @click="cancelItem(i)">Cancel</button></template></td></tr>
            <tr v-if="!p.items.length"><td colspan="6" class="muted">No procedures yet.</td></tr>
          </tbody></table>
        </div>

        <div v-if="done.item" class="card">
          <h3 style="margin-top:0">Complete: {{ done.item.service }} <span v-if="done.item.tooth_no">(tooth {{ done.item.tooth_no }})</span></h3>
          <div v-if="!d.open_visits.length" class="alert warn">This patient has no open visit. Start a visit (Check-in) first so the procedure can be billed.</div>
          <div class="grid g3">
            <div><label>Bill to visit</label><select v-model="done.visit_id"><option :value="null">— select —</option><option v-for="v in d.open_visits" :key="v.id" :value="v.id">{{ v.visit_no }} · {{ v.status }}</option></select></div>
            <div><label>Record on chart as</label><select v-model="done.condition"><option value="">— nothing —</option><option v-for="c in CONDITIONS" :key="c">{{ c }}</option></select></div>
          </div>
          <p><button class="p" :disabled="planBusy || !done.visit_id" @click="completeItem">Mark done and add charge</button> <button @click="done.item = null">Close</button></p>
        </div>

        <div v-if="openPlans.length && can('dental_plan_items.create')" class="card">
          <h3 style="margin-top:0">Add procedure to plan</h3>
          <div class="grid g4">
            <div><label>Plan</label><select v-model="item.plan_id"><option v-for="p in openPlans" :key="p.id" :value="p.id">{{ p.plan_no }}</option></select></div>
            <div><label>Tooth ({{ dentition }}; blank = whole mouth)</label><input v-model="item.tooth_no" maxlength="2" placeholder="e.g. 16" /></div>
            <div><label>Surface</label><select v-model="item.surface"><option v-for="s in SURFACES" :key="s">{{ s }}</option></select></div>
            <div><label>Fee (blank = price list)</label><input v-model="item.fee" type="number" min="0" step="0.01" /></div>
          </div>
          <label>Procedure</label><LookupSelect v-model="item.service_id" resource="services" placeholder="Search dental procedure" />
          <p><button class="p" :disabled="planBusy" @click="addItem">Add to plan</button></p>
        </div>
      </div>

      <div v-show="tab === 'history'" class="card flush">
        <table class="t"><thead><tr><th>Date</th><th>Tooth</th><th>Surface</th><th>Condition</th><th>Notes</th><th>By</th></tr></thead><tbody>
          <tr v-for="e in d.history" :key="e.id"><td>{{ fdate(e.entry_date) }}</td><td>{{ e.tooth_no }}{{ e.dentition === 'Primary' ? ' (p)' : '' }}</td><td>{{ e.surface }}</td><td>{{ e.condition }}</td><td>{{ e.notes }}</td><td>{{ e.recorded_by }}</td></tr>
          <tr v-if="!d.history.length"><td colspan="6" class="muted">No entries.</td></tr>
        </tbody></table>
      </div>
    </template>
  </div>
</template>
<style scoped>
.arch{display:flex;justify-content:center;align-items:center;gap:1px;min-width:max-content;padding:2px 0}
.mid{width:2px;height:54px;background:#111;margin:0 4px;border-radius:2px}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:11px;color:#444}
.legend span{display:flex;align-items:center;gap:5px}.legend i{width:12px;height:12px;border:1px solid #111;display:inline-block}
</style>
