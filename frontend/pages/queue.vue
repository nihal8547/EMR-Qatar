<script setup lang="ts">
definePageMeta({ perm: 'queue.view' })
const { api } = useApi(); const { err, ok } = useUi(); const { can } = useAuth()
const date = ref(todayStr()); const doctor = ref<any>(null); const rows = ref<any[]>([]); const loading = ref(false)
const cols = ['Registered', 'Triage', 'With Doctor', 'Diagnostics', 'Pharmacy', 'Billing', 'Completed']
async function load() { loading.value = true; try { rows.value = await api('/queue', { query: { date: date.value, doctor_id: doctor.value } }) } catch (e) { err(e) } finally { loading.value = false } }
let timer: any
onMounted(() => { load(); timer = setInterval(load, 30000) })
onBeforeUnmount(() => clearInterval(timer))
watch([date, doctor], load)
const by = (s: string) => rows.value.filter((r) => r.status === s)
async function move(v: any, status: string) {
  let reason: string | undefined
  if (status === 'Cancelled') { reason = prompt(`Cancel visit ${v.visit_no}? Reason (required):`) || ''; if (reason.trim().length < 3) return }
  try { await api(`/visits/${v.id}/status`, { method: 'PUT', body: { status, reason } }); ok(`${v.visit_no} → ${status}`); load() } catch (e) { err(e) }
}
</script>
<template>
  <div>
    <div class="bar"><div><h1>Queue Board</h1><div class="page-sub">Live patient flow · refreshes every 30 s · {{ rows.length }} visit(s)</div></div><div class="sp"></div><input type="date" v-model="date" style="width:160px" /><div style="width:220px"><LookupSelect v-model="doctor" resource="doctors" placeholder="All doctors" /></div><button @click="load">↻ Refresh</button></div>
    <div class="qb">
      <div v-for="c in cols" :key="c" class="qcol">
        <h3>{{ c }} <span class="badge grey">{{ by(c).length }}</span></h3>
        <div v-if="!by(c).length" class="qempty">No patients</div>
        <div v-for="v in by(c)" :key="v.id" class="qcard">
          <div><b>#{{ v.token_no }}</b> {{ v.full_name }}</div>
          <div class="small muted">{{ v.mrn }} · {{ v.age }}y {{ v.gender?.[0] }} · {{ v.doctor_name || 'Walk-in (lab / X-ray)' }}</div>
          <div class="small"><span class="badge">{{ v.payer_type }}</span> <span v-if="v.payer_type === 'Insurance'" class="badge" :class="badgeClass(v.eligibility_status)">{{ v.eligibility_status }}</span> <span v-if="v.status !== 'Completed'" class="muted">⏱ {{ v.waiting_min }} min</span></div>
          <div v-if="v.complaint" class="small" style="margin-top:4px">{{ v.complaint }}</div>
          <div class="qacts">
            <NuxtLink v-if="can('vitals.create') && ['Registered', 'Triage'].includes(v.status)" :to="`/r/vitals/new?visit_id=${v.id}`" class="btn sm">Vitals</NuxtLink>
            <NuxtLink v-if="can('consult.use')" :to="`/consult/${v.id}`" class="btn sm">Consult</NuxtLink>
            <NuxtLink v-if="can('billing.cashier')" :to="`/cashier?visit=${v.id}`" class="btn sm">Bill</NuxtLink>
            <NuxtLink v-if="can('patients.360')" :to="`/patient/${v.patient_id}`" class="btn sm">360</NuxtLink>
            <NuxtLink :to="`/print/token/${v.id}`" class="btn sm" title="Print token slip">🖨</NuxtLink><NuxtLink v-if="can('visits.manage')" :to="`/visit-manage?visit=${v.id}`" class="btn sm">Manage</NuxtLink>
          </div>
          <select v-if="v.status !== 'Completed'" style="margin-top:6px;font-size:12px" :value="v.status" @change="move(v, ($event.target as HTMLSelectElement).value)">
            <option v-for="s in [...cols.slice(0, 6), 'Completed', ...(can('visits.manage') ? ['Cancelled'] : [])]" :key="s" :value="s">{{ s === v.status ? 'Status: ' + s : '→ ' + s }}</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>
