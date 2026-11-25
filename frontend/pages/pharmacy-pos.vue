<script setup lang="ts">
definePageMeta({ perm: 'pharmacy.pos' })
const { api } = useApi(); const { ok, err } = useUi()
const q = ref(''); const results = ref<any[]>([]); const cart = ref<any[]>([]); const method = ref('Cash'); const customer = ref(''); const busy = ref(false); const last = ref<any>(null)
let t: any
watch(q, () => { clearTimeout(t); t = setTimeout(async () => { try { results.value = q.value.trim() ? await api('/pharmacy/drugs/search', { query: { q: q.value } }) : [] } catch (e) { err(e) } }, 250) })
function add(d: any) {
  if (d.requires_prescription) return err(`${d.generic_name} needs a prescription. Dispense it from the Dispensing Queue.`)
  if (d.stock <= 0) return err('Out of stock')
  const l = cart.value.find((x) => x.id === d.id); if (l) l.qty = Math.min(l.qty + 1, d.stock); else cart.value.push({ ...d, qty: 1 })
}
const total = computed(() => cart.value.reduce((s, l) => s + l.qty * Number(l.price), 0))
async function sell() {
  busy.value = true
  try { last.value = await api('/pharmacy/otc', { method: 'POST', body: { items: cart.value.map((l) => ({ drug_id: l.id, qty: l.qty })), customer_name: customer.value, payment_method: method.value } }); ok('Sale completed'); cart.value = []; customer.value = ''; q.value = ''; results.value = [] } catch (e) { err(e) } finally { busy.value = false }
}
</script>
<template>
  <div>
    <h1>OTC Point of Sale</h1>
    <div v-if="last" class="alert ok">Receipt <b>{{ last.receipt_no }}</b> — total <b>{{ money(last.total) }} QAR</b>. <NuxtLink :to="`/print/doc/otc_sales/${last.id}`" class="btn sm">🖨 Print receipt</NuxtLink> <button class="sm" @click="last = null">OK</button></div>
    <div class="split" style="grid-template-columns:1fr 420px">
      <div class="card"><input v-model="q" placeholder="Search medicine by name or code…" autofocus />
        <table style="margin-top:8px"><tbody><tr v-for="d in results" :key="d.id" class="click" @click="add(d)"><td>{{ d.generic_name }} {{ d.strength }}<div class="small muted">{{ d.brand_name }} · {{ d.form }}</div></td><td><span v-if="d.requires_prescription" class="badge red">Rx only</span></td><td class="num">{{ money(d.price) }}</td><td class="num" :style="{ color: d.stock <= 0 ? 'var(--bad)' : '' }">{{ d.stock }} in stock</td></tr></tbody></table>
        <div v-if="q && !results.length" class="muted" style="margin-top:8px">No medicine found.</div></div>
      <div class="card"><h2>Cart</h2><div v-if="!cart.length" class="muted">Empty. Click a medicine to add it.</div>
        <table v-else><tbody><tr v-for="(l, i) in cart" :key="l.id"><td>{{ l.generic_name }} {{ l.strength }}</td><td style="width:70px"><input type="number" min="1" :max="l.stock" v-model.number="l.qty" /></td><td class="num">{{ money(l.qty * l.price) }}</td><td><button class="sm" @click="cart.splice(i, 1)">✕</button></td></tr></tbody></table>
        <div class="field" style="margin-top:10px"><label class="f">Customer (optional)</label><input v-model="customer" placeholder="Walk-in" /></div>
        <div class="field"><label class="f">Payment</label><select v-model="method"><option>Cash</option><option>Card</option><option>Bank transfer</option></select></div>
        <div class="bar"><h2 style="margin:0">Total {{ money(total) }} QAR</h2><div class="sp"></div><button class="p" :disabled="busy || !cart.length" @click="sell">Complete sale</button></div></div>
    </div>
  </div>
</template>
