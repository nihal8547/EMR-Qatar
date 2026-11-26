<script setup lang="ts">
definePageMeta({ perm: 'imaging_orders.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/imaging/orders/${route.params.id}/report`) } catch (e) { err(e) } })
const printNow = () => window.print()
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">RADIOLOGY REPORT</h2><div>{{ d.order.order_no }}</div></div></div><hr />
      
      <div class="grid g2"><div><b>{{ d.order.full_name }}</b><div class="small">{{ d.order.mrn }} · QID {{ d.order.qid || '–' }}</div><div class="small">{{ d.order.gender }} · DOB {{ fdate(d.order.dob) }}</div></div>
        <div class="small right">Ordered {{ fdt(d.order.ordered_at) }}<div>Requested by {{ d.order.doctor || '—' }}</div></div></div>
      <dl class="kv" style="margin-top:12px"><dt>Study</dt><dd><b>{{ d.order.study }}</b><template v-if="d.order.modality"> ({{ d.order.modality }})</template></dd><dt>Order no</dt><dd>{{ d.order.order_no }}</dd><dt v-if="d.order.clinical_info">Clinical information</dt><dd v-if="d.order.clinical_info">{{ d.order.clinical_info }}</dd></dl>
      <template v-if="d.report"><h3 style="margin-top:16px">Findings</h3><p style="white-space:pre-wrap;line-height:1.6">{{ d.report.findings }}</p>
        <h3>Impression</h3><p style="white-space:pre-wrap;line-height:1.6"><b>{{ d.report.impression }}</b></p>
        <p class="small muted" style="margin-top:20px">Reported by {{ d.report.reported_by || '—' }} · {{ fdt(d.report.reported_at) }} · {{ d.report.status }}<template v-if="d.report.status !== 'Final'"> (draft, not for clinical use)</template></p></template>
      <div v-else class="alert warn">No report yet for this study.</div>
      <div style="margin-top:36px" class="small"><div style="border-top:1px solid #000;width:240px;padding-top:4px">Radiologist signature</div></div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
