<script setup lang="ts">
definePageMeta({ perm: 'lab_orders.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/visits/${route.params.id}/results`) } catch (e) { err(e) } })
const centre = computed(() => d.value?.centre || {})
const printNow = () => window.print()
const fc = (f: string) => (f?.startsWith('Critical') ? 'flag-C' : f === 'High' || f === 'Low' ? 'flag-H' : '')
const groups = computed(() => { const g: Record<string, any[]> = {}; for (const r of d.value?.lab || []) (g[r.order_no] ||= []).push(r); return g })
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ centre.centre_address }} · {{ centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">TEST RESULTS</h2><div>{{ d.visit.visit_no }}</div></div></div><hr />
      <div class="grid g2"><div><b>{{ d.visit.full_name }}</b><div class="small">{{ d.visit.mrn }} · QID {{ d.visit.qid || '–' }}</div><div class="small">{{ d.visit.gender }} · DOB {{ fdate(d.visit.dob) }}</div></div><div class="small right">Visit {{ fdate(d.visit.visit_date) }}<div>Doctor {{ d.visit.doctor || '—' }}</div></div></div>
      <template v-for="(rows, no) in groups" :key="no"><h3 style="margin-top:16px">Laboratory · {{ no }}</h3>
        <table><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead><tbody>
          <tr v-for="(i, k) in rows" :key="k"><td>{{ i.test }}</td><td><b>{{ i.result_value ?? i.result_text ?? '—' }}</b></td><td>{{ i.result_value != null ? i.unit : '' }}</td><td class="muted">{{ i.ref_low != null || i.ref_high != null ? `${i.ref_low ?? ''} – ${i.ref_high ?? ''}` : '' }}</td><td><span v-if="i.flag && i.flag !== 'Normal'" :class="fc(i.flag)">{{ i.flag }}</span></td></tr></tbody></table></template>
      <template v-for="m in d.imaging" :key="m.order_no"><h3 style="margin-top:16px">Imaging · {{ m.study }} <span class="small muted">{{ m.order_no }}</span></h3>
        <p style="white-space:pre-wrap;margin:4px 0"><b>Findings:</b> {{ m.findings }}</p><p style="white-space:pre-wrap;margin:4px 0"><b>Impression:</b> {{ m.impression }}</p><p class="small muted">Reported by {{ m.reported_by || '—' }} · {{ fdt(m.reported_at) }}</p></template>
      <div v-if="!d.lab.length && !d.imaging.length" class="alert warn">No validated results yet for this visit. Only validated / final results are printed.</div>
      <p class="small muted" style="margin-top:14px">Interpret results together with clinical findings.</p>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
