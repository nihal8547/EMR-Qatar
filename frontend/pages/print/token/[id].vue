<script setup lang="ts">
definePageMeta({ perm: 'visits.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/print/visits/${route.params.id}`); if (route.query.auto) setTimeout(() => window.print(), 400) } catch (e) { err(e) } })
const printNow = () => window.print()
</script>
<template>
  <div v-if="d" style="max-width:340px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff;text-align:center">
      <h3 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h3><div class="small muted">{{ d.centre.centre_phone }}</div><hr />
      <div class="small muted">TOKEN</div><div style="font-size:64px;font-weight:800;line-height:1.1">{{ d.record.token_no ?? '—' }}</div>
      <div style="margin:8px 0"><b>{{ d.patient?.full_name }}</b><div class="small">{{ d.patient?.mrn }}</div></div>
      <div class="small">{{ d.record.doctor_id__label || 'Diagnostics (no doctor)' }}<template v-if="d.record.department_id__label"> · {{ d.record.department_id__label }}</template></div>
      <div class="small">{{ d.record.visit_no }} · {{ fdate(d.record.visit_date) }} · {{ d.record.visit_type }}</div>
      <div class="small muted" style="margin-top:6px">Please wait until your token is called.</div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
