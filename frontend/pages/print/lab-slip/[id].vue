<script setup lang="ts">
definePageMeta({ perm: 'lab_orders.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/lab/orders/${route.params.id}/slip`) } catch (e) { err(e) } })
const printNow = () => window.print()
const age = (dob: string) => { if (!dob) return ''; const a = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000); return a >= 0 ? `${a}y` : '' }
const groups = computed(() => { const g: Record<string, any[]> = {}; for (const t of d.value?.tests || []) (g[t.sample_type || 'Other'] ||= []).push(t); return g })
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print slip &amp; labels</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">SAMPLE COLLECTION SLIP</h2><div>{{ d.order.order_no }}</div><div v-if="d.order.priority !== 'Routine'"><b>{{ d.order.priority }}</b></div></div></div><hr />
      <div class="grid g2"><div><b>{{ d.order.full_name }}</b><div class="small">MRN {{ d.order.mrn }} · {{ d.order.gender }}<template v-if="d.order.dob">, {{ age(d.order.dob) }}</template></div><div class="small">Visit {{ d.order.visit_no }}</div></div><div class="small right">Ordered {{ fdt(d.order.ordered_at) }}<div>Requested by {{ d.order.doctor }}</div></div></div>
      <div style="margin:8px 0"><Barcode39 :value="d.order.order_no" /><div class="small">{{ d.order.order_no }}</div></div>
      <table style="margin-top:8px"><thead><tr><th>Sample / tube</th><th>Tests</th><th>TAT</th></tr></thead><tbody>
        <tr v-for="(ts, st) in groups" :key="st"><td><b>{{ st }}</b></td><td>{{ ts.map((t: any) => t.name).join(', ') }}</td><td class="small">{{ Math.max(...ts.map((t: any) => t.tat_hours || 0)) || '–' }} h</td></tr></tbody></table>
      <p v-if="d.order.notes" class="small"><b>Notes:</b> {{ d.order.notes }}</p>
      <div class="grid g2" style="margin-top:14px"><div class="small">Collected by: ______________________</div><div class="small">Date / time: ______________________</div></div>
      <h3 style="margin-top:18px">Specimen labels</h3>
      <div v-if="!d.specimens.length" class="small muted">Sample not collected yet — barcodes are generated when the sample is collected. Printing labels now uses the order number.</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
        <div v-for="(sp, i) in (d.specimens.length ? d.specimens : Object.keys(groups).map((k) => ({ barcode: d.order.order_no, sample_type: k })))" :key="i" style="border:1px dashed #000;padding:6px 8px;width:250px">
          <div class="small"><b>{{ d.order.full_name }}</b></div><div class="small">{{ d.order.mrn }} · {{ d.order.gender }}<template v-if="d.order.dob">/{{ age(d.order.dob) }}</template></div>
          <Barcode39 :value="sp.barcode" :height="36" /><div class="small">{{ sp.barcode }} · <b>{{ sp.sample_type }}</b></div></div></div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
