<script setup lang="ts">
definePageMeta({ perm: 'pharmacy.stock' })
const { api } = useApi(); const { err } = useUi()
const rows = ref<any[]>([]); const q = ref(''); const filter = ref(''); const openRow = ref<number | null>(null)
async function load() { try { rows.value = await api('/pharmacy/stock', { query: { q: q.value, filter: filter.value } }) } catch (e) { err(e) } }
let t: any; onMounted(load); watch([q, filter], () => { clearTimeout(t); t = setTimeout(load, 250) })
</script>
<template>
  <div>
    <div class="bar"><h1>Stock & Expiry</h1><div class="sp"></div><input v-model="q" placeholder="Search drug…" style="width:220px" />
      <select v-model="filter" style="width:200px"><option value="">All drugs</option><option value="low">At / below reorder level</option><option value="expiring">Expiring in 90 days</option><option value="expired">Has expired stock</option></select></div>
    <div class="card flush"><table><thead><tr><th>Drug</th><th>Form</th><th class="num">In stock</th><th class="num">Reorder at</th><th>Next expiry</th><th>Alerts</th></tr></thead>
      <tbody><template v-for="r in rows" :key="r.id"><tr class="click" @click="openRow = openRow === r.id ? null : r.id"><td>{{ r.generic_name }} {{ r.strength }}<div class="small muted">{{ r.brand_name }}</div></td><td>{{ r.form }}</td><td class="num">{{ r.in_stock }}</td><td class="num">{{ r.reorder_level }}</td><td>{{ fdate(r.next_expiry) }}</td>
        <td><span v-if="r.low" class="badge red">Low</span> <span v-if="r.expiring" class="badge amber">Expiring</span> <span v-if="r.has_expired" class="badge red">Expired {{ r.expired_qty }}</span></td></tr>
        <tr v-if="openRow === r.id"><td colspan="6" style="background:#fafbfc"><table><thead><tr><th>Batch</th><th>Expiry</th><th class="num">Qty</th><th>Store</th></tr></thead><tbody><tr v-for="b in r.batches" :key="b.batch + b.store"><td>{{ b.batch }}</td><td>{{ fdate(b.expiry) }}</td><td class="num">{{ b.qty }}</td><td>{{ b.store }}</td></tr></tbody></table></td></tr></template></tbody></table>
      <div v-if="!rows.length" class="empty">Nothing matches.</div></div>
    <p class="muted small">Receive stock through Inventory → GRN, adjust through Stock Adjustments. Expired batches are never dispensed.</p>
  </div>
</template>
