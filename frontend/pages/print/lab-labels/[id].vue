<script setup lang="ts">
definePageMeta({ perm: 'lab_orders.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
const SIZES: Record<string, [number, number, string]> = { '50x30': [50, 30, '50 × 30 mm (standard tube label)'], '40x25': [40, 25, '40 × 25 mm (small)'], '60x40': [60, 40, '60 × 40 mm (large)'] }
const size = ref('50x30'); const copies = ref(1)
onMounted(async () => {
  try { d.value = await api(`/lab/orders/${route.params.id}/slip`) } catch (e) { err(e); return }
  if (route.query.auto === '1' && d.value?.specimens?.length) setTimeout(() => window.print(), 600)
})
const printNow = () => window.print()
const W = computed(() => SIZES[size.value][0]); const H = computed(() => SIZES[size.value][1])
useHead({ style: [{ key: 'lblpage', innerHTML: computed(() => `@media print{@page{size:${W.value}mm ${H.value}mm;margin:0}body{margin:0}}`) as any }] })
const age = (dob: string) => { if (!dob) return ''; const a = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000); return a >= 0 ? `${a}y` : '' }
const labels = computed(() => {
  if (!d.value) return []
  const out: any[] = []
  for (const sp of d.value.specimens) {
    const tests = d.value.tests.filter((t: any) => (t.sample_type || 'Blood') === sp.sample_type).map((t: any) => t.code || t.name)
    for (let c = 0; c < copies.value; c++) out.push({ ...sp, tests })
  }
  return out
})
const priority = computed(() => (d.value?.order.priority && d.value.order.priority !== 'Routine' ? d.value.order.priority.toUpperCase() : ''))
</script>
<template>
  <div v-if="d">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><h1 style="margin:0">Tube labels · {{ d.order.order_no }}</h1><div class="sp"></div>
      <label class="small muted">Size</label><select v-model="size" style="width:230px"><option v-for="(v, k) in SIZES" :key="k" :value="k">{{ v[2] }}</option></select>
      <label class="small muted">Copies per tube</label><input v-model.number="copies" type="number" min="1" max="6" style="width:70px" />
      <button class="p" :disabled="!labels.length" @click="printNow">🏷 Print {{ labels.length }} label(s)</button></div>
    <div v-if="!d.specimens.length" class="alert warn no-print">The sample has not been collected yet. Tube labels (with barcodes) are created when you press <b>Collect sample</b> in the Lab Worklist.</div>
    <div class="no-print small muted" style="margin-bottom:8px">Use a label printer (or sticker sheets) and choose the same paper size in the print dialog. One label per tube — stick it on the bottle / tube after collecting.</div>
    <div class="lbl-wrap">
      <div v-for="(l, i) in labels" :key="i" class="lbl" :style="{ width: W + 'mm', height: H + 'mm' }">
        <div class="l1"><b class="nm">{{ d.order.full_name }}</b><span v-if="priority" class="pri">{{ priority }}</span></div>
        <div class="l2">{{ d.order.mrn }} · {{ d.order.gender?.[0] }}<template v-if="d.order.dob">/{{ age(d.order.dob) }}</template> · {{ fdate(l.collected_at) }} {{ String(fdt(l.collected_at)).slice(-5) }}</div>
        <Barcode39 :value="l.barcode" :height="H >= 30 ? 34 : 26" class="bc" />
        <div class="l3"><b>{{ l.barcode }}</b> · {{ l.sample_type }}</div>
        <div class="l4">{{ l.tests.join(', ') }}</div>
      </div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
<style>
.lbl-wrap{display:flex;flex-wrap:wrap;gap:10px;padding:6px}
.lbl{background:#fff;border:1px dashed #888;box-sizing:border-box;padding:1.4mm 1.8mm;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#000;line-height:1.15;display:flex;flex-direction:column}
.lbl .l1{display:flex;justify-content:space-between;gap:4px;font-size:9.5pt}.lbl .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl .pri{background:#000;color:#fff;font-size:7pt;font-weight:700;padding:0 3px;border-radius:2px;align-self:center}
.lbl .l2{font-size:7pt}.lbl .l3{font-size:7.5pt;margin-top:1px}.lbl .l4{font-size:6.5pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl svg.bc{max-width:100%!important;display:block;margin:1px 0}
@media print{
  .lbl-wrap{display:block;padding:0;gap:0}
  .lbl{border:0;page-break-after:always;break-after:page;margin:0}
  .lbl:last-child{page-break-after:auto;break-after:auto}
}
</style>
