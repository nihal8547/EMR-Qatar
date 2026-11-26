<script setup lang="ts">
definePageMeta({ perm: 'growth_measurements.view' })
const route = useRoute()
const { api } = useApi(); const { err, ok } = useUi(); const { can } = useAuth()
const patientId = ref<number | null>(route.query.patient ? Number(route.query.patient) : null)
const d = ref<any>(null); const loading = ref(false)
const needReason = ref(false); const reason = ref('')
const ind = ref<'wfa' | 'lhfa' | 'hcfa' | 'bmifa'>('wfa')
const range = ref<'auto' | 24 | 60>('auto')

async function load(bg = '') {
  if (!patientId.value) { d.value = null; return }
  loading.value = true
  try { d.value = await api(`/growth/${patientId.value}`, { query: bg ? { breakglass: bg } : {} }); needReason.value = false }
  catch (e: any) { d.value = null; if (e.extra?.breakglass) needReason.value = true; else err(e) }
  finally { loading.value = false }
}
watch(patientId, () => { reason.value = ''; load() }, { immediate: true })

const maxAge = computed(() => (range.value === 'auto' ? ((d.value?.patient.age_months ?? 0) <= 26 ? 24 : 60) : range.value))
const val = (p: any) => ({ wfa: p.weight_kg, lhfa: p.height_cm, hcfa: p.head_circ_cm, bmifa: p.bmi } as any)[ind.value]
const plotted = computed(() => (d.value?.points || []).filter((p: any) => val(p) && !p.out_of_range).map((p: any) => ({ age: p.age_months, v: val(p), label: `${p.date} · ${p.age_text} · ${val(p)} ${d.value.indicators[ind.value].unit} · z ${p.z[ind.value] ?? '–'} · P${p.pct[ind.value] ?? '–'}` })))
const latest = computed(() => [...(d.value?.points || [])].reverse().find((p: any) => !p.out_of_range))
const zClass = (z: number | null) => (z === null || z === undefined ? '' : Math.abs(z) > 3 ? 'red' : Math.abs(z) > 2 ? 'amber' : 'green')
const IND_TABS: [string, string][] = [['wfa', 'Weight-for-age'], ['lhfa', 'Length / height-for-age'], ['hcfa', 'Head circumference'], ['bmifa', 'BMI-for-age']]

/* add measurement */
const f = reactive<any>({ measured_on: new Date().toISOString().slice(0, 10), weight_kg: '', height_cm: '', head_circ_cm: '', source: 'This centre', notes: '' })
const busy = ref(false)
async function save() {
  busy.value = true
  try {
    await api('/r/growth_measurements', { method: 'POST', body: { patient_id: patientId.value, ...f, weight_kg: f.weight_kg || null, height_cm: f.height_cm || null, head_circ_cm: f.head_circ_cm || null, notes: f.notes || null } })
    ok('Measurement saved'); Object.assign(f, { weight_kg: '', height_cm: '', head_circ_cm: '', notes: '' }); await load(reason.value)
  } catch (e) { err(e) } finally { busy.value = false }
}
async function remove(p: any) {
  if (!confirm('Remove this measurement?')) return
  try { await api(`/r/growth_measurements/${p.id}`, { method: 'DELETE' }); ok('Removed'); await load(reason.value) } catch (e) { err(e) }
}
const printNow = () => window.print()
</script>
<template>
  <div>
    <h1>Growth Charts <span class="muted small">WHO Child Growth Standards, 0–5 years</span></h1>
    <div class="card no-print">
      <div class="grid g2">
        <div><label>Patient</label><LookupSelect v-model="patientId" resource="patients" placeholder="Search patient by name, MRN or QID" /></div>
        <div v-if="d" class="small" style="align-self:end"><b>{{ d.patient.full_name }}</b> · {{ d.patient.mrn }} · {{ d.patient.gender }} · {{ d.patient.age_text }} (DOB {{ fdate(d.patient.dob) }})</div>
      </div>
    </div>
    <div v-if="needReason" class="card no-print">
      <div class="alert warn">You have no treating relationship with this patient. Emergency (break-glass) access is audited.</div>
      <label>Reason for access (min 8 characters)</label><input v-model="reason" placeholder="e.g. covering for the treating doctor" />
      <p><button class="p" :disabled="reason.trim().length < 8" @click="load(reason.trim())">Open growth chart</button></p>
    </div>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!patientId" class="card muted">Choose a child to see the growth chart. Weight, height and head circumference recorded at triage appear automatically; add older or outside measurements below.</div>

    <template v-if="d">
      <div v-for="w in d.warnings" :key="w" class="alert warn">{{ w }}</div>
      <div v-if="latest" class="card" style="display:flex;gap:18px;flex-wrap:wrap">
        <div v-for="[k, lab] in IND_TABS" :key="k" style="min-width:150px">
          <div class="small muted">{{ lab }}</div>
          <template v-if="latest.z[k] !== null && latest.z[k] !== undefined">
            <b style="font-size:17px">z {{ latest.z[k] }}</b> <span class="badge" :class="zClass(latest.z[k])">P{{ latest.pct[k] }}</span>
          </template>
          <span v-else class="muted">–</span>
        </div>
        <div class="small muted" style="align-self:center">Latest: {{ fdate(latest.date) }} ({{ latest.age_text }})</div>
      </div>
      <div v-if="latest?.flags.length" class="card">
        <div v-for="(fl, i) in latest.flags" :key="i" class="small"><span class="badge" :class="fl.level === 'red' ? 'red' : 'amber'">{{ fl.indicator }}</span> {{ fl.text }}</div>
        <div class="small muted" style="margin-top:6px">Screening flags from WHO z-scores. They support, not replace, clinical judgement.</div>
      </div>

      <div class="tabs no-print">
        <button v-for="[k, lab] in IND_TABS" :key="k" :class="{ on: ind === k }" @click="ind = k as any">{{ lab }}</button>
        <div class="sp"></div>
        <select v-model="range" style="width:auto"><option value="auto">Auto range</option><option :value="24">0 – 2 years</option><option :value="60">0 – 5 years</option></select>
        <button class="no-print" @click="printNow">🖨 Print</button>
      </div>
      <div class="card">
        <div class="print-only"><b>{{ d.patient.full_name }}</b> · {{ d.patient.mrn }} · {{ d.patient.gender }} · DOB {{ fdate(d.patient.dob) }}</div>
        <GrowthChart :curves="d.indicators[ind].curves" :points="plotted" :unit="d.indicators[ind].unit" :title="d.indicators[ind].label" :max-age="maxAge" />
        <div class="small muted" style="margin-top:6px">Lines: median, ±2 SD (orange) and ±3 SD (red dashed). {{ d.standard }}. Length is measured lying down below 2 years and height standing from 2 years.</div>
      </div>

      <div class="card">
        <h3>Measurements</h3>
        <table v-if="d.points.length">
          <thead><tr><th>Date</th><th>Age</th><th class="num">Weight kg</th><th class="num">Length/height cm</th><th class="num">Head cm</th><th class="num">BMI</th><th class="num">W-A z</th><th class="num">L/H-A z</th><th class="num">HC z</th><th class="num">BMI z</th><th>Source</th><th class="no-print"></th></tr></thead>
          <tbody>
            <tr v-for="p in [...d.points].reverse()" :key="p.origin + p.id">
              <td>{{ fdate(p.date) }}</td><td>{{ p.age_text }}</td><td class="num">{{ p.weight_kg ?? '' }}</td><td class="num">{{ p.height_cm ?? '' }}</td><td class="num">{{ p.head_circ_cm ?? '' }}</td><td class="num">{{ p.bmi ?? '' }}</td>
              <td v-for="k in ['wfa', 'lhfa', 'hcfa', 'bmifa']" :key="k" class="num"><span v-if="p.z[k] !== null && p.z[k] !== undefined" class="badge" :class="zClass(p.z[k])" :title="'Percentile ' + p.pct[k]">{{ p.z[k] }}</span></td>
              <td class="small">{{ p.source }}</td>
              <td class="no-print"><button v-if="p.origin === 'growth' && can('growth_measurements.delete')" class="sm" @click="remove(p)">Remove</button></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="muted">No measurements yet.</div>
      </div>

      <div v-if="can('growth_measurements.create')" class="card no-print">
        <h3>Add measurement</h3>
        <div class="grid g4">
          <div><label>Date</label><input type="date" v-model="f.measured_on" /></div>
          <div><label>Weight (kg)</label><input type="number" step="0.01" v-model="f.weight_kg" /></div>
          <div><label>Length / height (cm)</label><input type="number" step="0.1" v-model="f.height_cm" /></div>
          <div><label>Head circumference (cm)</label><input type="number" step="0.1" v-model="f.head_circ_cm" /></div>
        </div>
        <div class="grid g2" style="margin-top:8px">
          <div><label>Source</label><select v-model="f.source"><option>This centre</option><option>Outside (growth card)</option><option>Parent reported</option></select></div>
          <div><label>Notes</label><input v-model="f.notes" /></div>
        </div>
        <p><button class="p" :disabled="busy || (!f.weight_kg && !f.height_cm && !f.head_circ_cm)" @click="save">Save measurement</button></p>
      </div>
    </template>
  </div>
</template>
