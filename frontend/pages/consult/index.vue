<script setup lang="ts">
definePageMeta({ perm: 'consult.use' })
const { api } = useApi(); const { err } = useUi(); const { state } = useAuth()
const rows = ref<any[]>([]); const doctor = ref<any>(null)
async function load() { try { rows.value = await api('/consult/list', { query: { doctor_id: doctor.value } }) } catch (e) { err(e) } }
let t: any
onMounted(() => { load(); t = setInterval(load, 30000) }); onBeforeUnmount(() => clearInterval(t))
watch(doctor, load)
const isDoc = computed(() => state.value.user?.role === 'Doctor')
</script>
<template>
  <div>
    <div class="bar"><h1>My Consultations — today</h1><div class="sp"></div><div v-if="!isDoc" style="width:240px"><LookupSelect v-model="doctor" resource="doctors" placeholder="Choose doctor" /></div><button @click="load">↻ Refresh</button></div>
    <div class="card flush"><table>
      <thead><tr><th>Token</th><th>Patient</th><th>Age / sex</th><th>Complaint</th><th>Payer</th><th>Waiting</th><th>Status</th></tr></thead>
      <tbody><tr v-for="r in rows" :key="r.id" class="click" @click="navigateTo(`/consult/${r.id}`)">
        <td><b>#{{ r.token_no }}</b></td><td>{{ r.full_name }}<div class="small muted">{{ r.mrn }} · {{ r.visit_no }}</div></td><td>{{ r.age }} / {{ r.gender }}</td><td>{{ r.complaint }}</td><td>{{ r.payer_type }}</td><td>{{ r.status === 'Completed' ? '' : r.waiting_min + ' min' }}</td><td><span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span></td>
      </tr></tbody></table>
      <div v-if="!rows.length" class="empty">No patients in your list today.</div></div>
  </div>
</template>
