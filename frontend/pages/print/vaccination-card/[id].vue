<script setup lang="ts">
definePageMeta({ perm: 'immunizations.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/vaccination/${route.params.id}`, { query: route.query.breakglass ? { breakglass: route.query.breakglass } : {} }) } catch (e) { err(e) } })
const printNow = () => window.print()
const given = computed(() => (d.value?.rows || []).filter((r: any) => r.given && r.status === 'Given').concat((d.value?.extra || []).filter((g: any) => g.status === 'Given').map((g: any) => ({ vaccine: g.vaccine, dose_no: g.dose_no, given: g })))
  .sort((a: any, b: any) => String(a.given.given_on).localeCompare(String(b.given.given_on))))
const next = computed(() => (d.value?.rows || []).filter((r: any) => ['Overdue', 'Due', 'Upcoming'].includes(r.status)).slice(0, 8))
</script>
<template>
  <div v-if="d" style="max-width:780px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div style="text-align:right"><b style="font-size:16px">Vaccination Record</b></div></div>
      <div class="grid g2" style="margin:10px 0"><div><b>{{ d.patient.full_name }}</b><div class="small">{{ d.patient.mrn }} · {{ d.patient.gender }}</div></div><div class="small" style="text-align:right">DOB {{ fdate(d.patient.dob) }}<br />Age {{ d.patient.age_text }}</div></div>
      <h3>Vaccines given</h3>
      <table v-if="given.length"><thead><tr><th>Date</th><th>Vaccine</th><th>Dose</th><th>Batch</th><th>Site</th><th>Source</th></tr></thead>
        <tbody><tr v-for="(r, i) in given" :key="i"><td>{{ fdate(r.given.given_on) }}</td><td>{{ r.vaccine }}</td><td>{{ r.dose_no }}</td><td>{{ r.given.batch_no }}</td><td>{{ r.given.site }}</td><td class="small">{{ r.given.source }}</td></tr></tbody></table>
      <div v-else class="muted">No vaccines recorded.</div>
      <template v-if="next.length"><h3 style="margin-top:14px">Next vaccines</h3>
        <table><thead><tr><th>Vaccine</th><th>Dose</th><th>Due</th><th>Status</th></tr></thead><tbody><tr v-for="(r, i) in next" :key="i"><td>{{ r.vaccine }}</td><td>{{ r.dose_no }}</td><td>{{ fdate(r.due_date) }}</td><td>{{ r.status }}</td></tr></tbody></table></template>
      <div style="margin-top:34px;display:flex;justify-content:space-between" class="small"><div style="border-top:1px solid #000;width:220px;padding-top:4px">Nurse / doctor signature &amp; stamp</div><div class="muted">Printed {{ fdate(new Date().toISOString()) }}</div></div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
