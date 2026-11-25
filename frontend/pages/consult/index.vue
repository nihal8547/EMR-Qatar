<script setup lang="ts">
definePageMeta({ perm: 'consult.use' })
const { api } = useApi(); const { err } = useUi(); const { state } = useAuth()
const rows = ref<any[]>([]); const doctor = ref<any>(null); const q = ref(''); const chip = ref('open'); const loading = ref(true)
async function load() { try { rows.value = await api('/consult/list', { query: { doctor_id: doctor.value } }) } catch (e) { err(e) } finally { loading.value = false } }
let t: any
onMounted(() => { load(); t = setInterval(load, 30000) }); onBeforeUnmount(() => clearInterval(t))
watch(doctor, load)
const isDoc = computed(() => state.value.user?.role === 'Doctor')
const open = computed(() => rows.value.filter((r) => r.status !== 'Completed'))
const stats = computed(() => ({ total: rows.value.length, waiting: rows.value.filter((r) => ['Registered', 'Triage'].includes(r.status)).length, with: rows.value.filter((r) => r.status === 'With Doctor').length, done: rows.value.filter((r) => r.status === 'Completed').length,
  avg: open.value.length ? Math.round(open.value.reduce((a, r) => a + (r.waiting_min || 0), 0) / open.value.length) : 0 }))
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return rows.value.filter((r) => (chip.value === 'all' || (chip.value === 'open' ? r.status !== 'Completed' : chip.value === 'done' ? r.status === 'Completed' : r.status === chip.value))
    && (!s || `${r.full_name} ${r.mrn} ${r.visit_no} ${r.complaint || ''} ${r.token_no}`.toLowerCase().includes(s)))
})
const initials = (n: string) => String(n || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
const wait = (r: any) => r.status === 'Completed' ? '' : r.waiting_min >= 60 ? 'red' : r.waiting_min >= 30 ? 'amber' : 'green'
const fmtWait = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
const CH: [string, string][] = [['open', 'Open'], ['With Doctor', 'With doctor'], ['Triage', 'Triage'], ['done', 'Completed'], ['all', 'All']]
</script>
<template>
  <div>
    <div class="bar"><h1>My Consultations <span class="muted small">· today</span></h1><div class="sp"></div><div v-if="!isDoc" style="width:240px"><LookupSelect v-model="doctor" resource="doctors" placeholder="Choose doctor" /></div><button @click="load">↻ Refresh</button></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:12px">
      <div class="kpi"><div class="v">{{ stats.total }}</div><div class="l">Patients today</div></div>
      <div class="kpi"><div class="v">{{ stats.waiting }}</div><div class="l">Waiting / triage</div></div>
      <div class="kpi"><div class="v">{{ stats.with }}</div><div class="l">With doctor</div></div>
      <div class="kpi"><div class="v">{{ stats.done }}</div><div class="l">Completed</div></div>
      <div class="kpi"><div class="v">{{ stats.avg }}<span class="small muted"> min</span></div><div class="l">Avg. wait (open)</div></div>
    </div>
    <div class="bar" style="gap:6px;flex-wrap:wrap"><input v-model="q" placeholder="Search name, MRN, visit, token, complaint" style="max-width:320px" /><button v-for="[k, l] in CH" :key="k" class="sm" :class="{ p: chip === k }" @click="chip = k">{{ l }}</button></div>
    <div class="cq">
      <div v-for="r in shown" :key="r.id" class="cq-card" :class="{ done: r.status === 'Completed' }" @click="navigateTo(`/consult/${r.id}`)">
        <div class="cq-tok">#{{ r.token_no }}</div>
        <div class="cq-av">{{ initials(r.full_name) }}</div>
        <div class="cq-main">
          <div><b>{{ r.full_name }}</b> <span class="muted small">{{ r.age }}y · {{ r.gender }}</span> <span v-if="r.allergies" class="badge red">⚠ {{ r.allergies }} allergy</span> <span v-if="r.triage_level" class="badge amber">{{ r.triage_level }}</span></div>
          <div class="small muted">{{ r.mrn }} · {{ r.visit_no }} · {{ r.visit_type }}</div>
          <div class="small">{{ r.complaint || 'No complaint recorded' }}</div>
        </div>
        <div class="cq-side"><span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span><span class="badge">{{ r.payer_type }}</span><span v-if="wait(r)" class="badge" :class="wait(r)">⏱ {{ fmtWait(r.waiting_min) }}</span>
          <button class="sm" :class="{ p: r.status !== 'Completed' }">{{ r.status === 'Completed' ? 'View' : r.status === 'With Doctor' ? 'Continue' : 'Open' }} ›</button></div>
      </div>
      <div v-if="!loading && !shown.length" class="card empty">No patients match.</div>
    </div>
  </div>
</template>
<style scoped>
.cq{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.cq-card{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer}.cq-card:hover{border-color:#111;box-shadow:0 2px 8px rgba(0,0,0,.06)}.cq-card.done{opacity:.65}
.cq-tok{font-weight:700;font-size:18px;min-width:44px}.cq-av{width:38px;height:38px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px}
.cq-main{flex:1;min-width:0}.cq-side{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
</style>
