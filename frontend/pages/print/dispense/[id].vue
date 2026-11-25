<script setup lang="ts">
definePageMeta({ perm: 'pharmacy.dispense' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null); const mode = ref(String(route.query.mode || 'slip'))
onMounted(async () => { try { d.value = await api(`/pharmacy/dispenses/${route.params.id}/print`) } catch (e) { err(e) } })
const printNow = () => window.print()
const age = (dob: string) => { if (!dob) return ''; const a = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000); return a >= 0 ? `${a}y` : '' }
const dir = (i: any) => [i.dose, i.frequency, i.duration_days ? `for ${i.duration_days} days` : '', i.route && i.route !== 'Oral' ? `(${i.route})` : ''].filter(Boolean).join(' ')
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="sm" :class="{ p: mode === 'slip' }" @click="mode = 'slip'">Slip &amp; receipt</button><button class="sm" :class="{ p: mode === 'labels' }" @click="mode = 'labels'">Medicine labels</button><button class="p" @click="printNow">🖨 Print</button></div>
    <div v-if="mode === 'slip'" class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">PHARMACY DISPENSE SLIP</h2><div>{{ d.dispense.dispense_no }}</div><div class="small muted">{{ fdt(d.dispense.dispensed_at) }}</div></div></div><hr />
      <div class="grid g2"><div><b>{{ d.dispense.full_name }}</b><div class="small">MRN {{ d.dispense.mrn }} · {{ d.dispense.gender }}<template v-if="d.dispense.dob">, {{ age(d.dispense.dob) }}</template></div></div><div class="small right">Rx {{ d.dispense.rx_no }} · Visit {{ d.dispense.visit_no }}<div>Dr. {{ d.dispense.doctor }} · {{ d.dispense.payer_type }}</div></div></div>
      <table style="margin-top:12px"><thead><tr><th>#</th><th>Medicine</th><th>Directions</th><th>Batch / Exp</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
        <tbody><tr v-for="(i, k) in d.items" :key="k"><td>{{ k + 1 }}</td><td><b>{{ i.generic_name }}</b> {{ i.strength }}<div class="small muted">{{ i.brand_name }} {{ i.form }}</div></td><td class="small">{{ dir(i) }}<div v-if="i.instructions" class="muted">{{ i.instructions }}</div></td><td class="small">{{ i.batch_no }}<div class="muted">{{ i.expiry_date ? fdate(i.expiry_date) : '' }}</div></td><td class="num">{{ i.qty }}</td><td class="num">{{ money(i.unit_price) }}</td><td class="num">{{ money(i.qty * i.unit_price) }}</td></tr>
          <tr><td colspan="6" class="right"><b>Total</b></td><td class="num"><b>{{ money(d.dispense.total) }}</b></td></tr></tbody></table>
      <div v-if="d.payments.length" class="small" style="margin-top:10px"><b>Payments on this visit:</b> <span v-for="p in d.payments" :key="p.receipt_no" style="margin-right:10px">{{ p.receipt_no }} · {{ p.method }} · {{ money(p.amount) }}</span></div>
      <div class="small" style="margin-top:30px"><div style="border-top:1px solid #000;width:240px;padding-top:4px">Dispensed by {{ d.dispense.dispensed_by }}</div></div>
      <p class="small muted" style="margin-top:10px">Keep out of reach of children. Check the label before use.</p>
    </div>
    <div v-else style="display:flex;flex-wrap:wrap;gap:10px;background:#fff;padding:8px">
      <div v-for="(i, k) in d.items" :key="k" style="border:1px solid #000;border-radius:6px;padding:8px 10px;width:300px;break-inside:avoid">
        <div class="small"><b>{{ d.centre.centre_name }}</b> · {{ d.centre.centre_phone }}</div>
        <div style="margin-top:4px"><b>{{ d.dispense.full_name }}</b> <span class="small">{{ d.dispense.mrn }}</span></div>
        <div style="margin-top:4px;font-size:15px"><b>{{ i.generic_name }} {{ i.strength }}</b> <span class="small">{{ i.form }}</span></div>
        <div style="margin-top:2px"><b>{{ dir(i) || 'As directed' }}</b></div><div v-if="i.instructions" class="small">{{ i.instructions }}</div>
        <div class="small" style="margin-top:4px">Qty {{ i.qty }} · Batch {{ i.batch_no }} · Exp {{ i.expiry_date ? fdate(i.expiry_date) : '–' }}</div>
        <div class="small muted">{{ fdate(d.dispense.dispensed_at) }} · Dr. {{ d.dispense.doctor }}</div></div>
    </div>
  </div>
  <div v-else class="empty">Loading…</div>
</template>
