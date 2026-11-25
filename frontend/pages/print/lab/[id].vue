<script setup lang="ts">
definePageMeta({ perm: 'lab_orders.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/lab/orders/${route.params.id}/report`) } catch (e) { err(e) } })
const printNow = () => window.print()
const fc = (f: string) => (f?.startsWith('Critical') ? 'flag-C' : f === 'High' || f === 'Low' ? 'flag-H' : '')
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">LABORATORY REPORT</h2><div>{{ d.order.order_no }}</div></div></div><hr />
      <div class="grid g2"><div><b>{{ d.order.full_name }}</b><div class="small">MRN {{ d.order.mrn }} · QID {{ d.order.qid || '–' }}</div><div class="small">{{ d.order.gender }} · DOB {{ fdate(d.order.dob) }}</div></div><div class="small right">Ordered {{ fdt(d.order.ordered_at) }}<div>Requested by {{ d.order.doctor }}</div></div></div>
      <table style="margin-top:12px"><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead><tbody><tr v-for="(i, k) in d.items" :key="k"><td>{{ i.test }}</td><td><b>{{ i.result_value ?? i.result_text }}</b></td><td>{{ i.unit }}</td><td>{{ i.ref_low ?? '' }} – {{ i.ref_high ?? '' }}</td><td><span :class="fc(i.flag)">{{ i.flag && i.flag !== 'Normal' ? i.flag : '' }}</span></td></tr></tbody></table>
      <div v-if="!d.items.length" class="alert warn">No validated results yet. Only validated results are printed.</div>
      <p class="small muted" style="margin-top:14px">Validated by {{ d.items[0]?.validated_by || '—' }} {{ d.items[0] ? fdt(d.items[0].validated_at) : '' }}. Interpret results together with clinical findings.</p>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
