<script setup lang="ts">
definePageMeta({ perm: 'lab.work' })
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const orders = ref<any[]>([]); const critical = ref<any[]>([]); const q = ref(''); const status = ref('')
const open = ref<number | null>(null)
const vals = reactive<Record<number, { v: string; t: string }>>({})
const busy = ref(false)
async function load() {
  try {
    orders.value = await api('/lab/worklist', { query: { q: q.value, status: status.value } })
    critical.value = await api('/lab/critical')
    for (const o of orders.value) for (const i of o.items) if (!vals[i.id]) vals[i.id] = { v: i.result_value ?? '', t: i.result_text ?? '' }
  } catch (e) { err(e) }
}
let tm: any
onMounted(() => { load(); tm = setInterval(load, 45000) }); onBeforeUnmount(() => clearInterval(tm))
let dq: any
watch([q, status], () => { clearTimeout(dq); dq = setTimeout(load, 300) })
const cur = computed(() => orders.value.find((o) => o.id === open.value))
async function act(fn: () => Promise<any>, msg: string) { busy.value = true; try { const r = await fn(); ok(msg); await load(); return r } catch (e) { err(e) } finally { busy.value = false } }
const collect = (o: any) => act(async () => { const r = await api(`/lab/orders/${o.id}/collect`, { method: 'POST', body: {} }); if (r?.barcodes?.length) ok('Barcode(s): ' + r.barcodes.join(', ')) }, 'Sample collected')
async function collectAndLabel(o: any) {
  busy.value = true
  try { await api(`/lab/orders/${o.id}/collect`, { method: 'POST', body: {} }); ok('Sample collected — printing tube labels'); await navigateTo(`/print/lab-labels/${o.id}?auto=1`) } catch (e) { err(e) } finally { busy.value = false }
}
const rejectSpec = (s: any) => { const reason = prompt('Reason for rejecting this specimen:'); if (reason) act(() => api(`/lab/specimens/${s.id}/reject`, { method: 'POST', body: { reason } }), 'Specimen rejected') }
async function saveResult(i: any) {
  const x = vals[i.id]
  const r = await act(() => api(`/lab/items/${i.id}/result`, { method: 'POST', body: { result_value: x.v === '' ? null : x.v, result_text: x.t || null } }), 'Result saved')
  if (r?.critical) err('CRITICAL value – inform the doctor now and document the call.')
}
const validate = (i: any) => act(() => api(`/lab/items/${i.id}/validate`, { method: 'POST', body: {} }), 'Validated')
const validateAll = (o: any) => act(() => api(`/lab/orders/${o.id}/validate-all`, { method: 'POST', body: {} }), 'Order validated')
const fc = (f: string) => (f?.startsWith('Critical') ? 'flag-C' : f === 'High' || f === 'Low' ? 'flag-H' : '')
</script>
<template>
  <div>
    <div class="bar"><h1>Lab Worklist</h1><div class="sp"></div><input v-model="q" placeholder="Order, patient, MRN…" style="width:220px" />
      <select v-model="status" style="width:160px"><option value="">Open orders</option><option>Ordered</option><option>Collected</option><option>In Progress</option><option>Resulted</option><option>Validated</option></select><button @click="load">↻</button></div>
    <div v-if="critical.length" class="alert err"><b>Critical results (last 48 h):</b>
      <div v-for="c in critical" :key="c.id" class="small">{{ c.full_name }} ({{ c.mrn }}, {{ c.phone }}) – {{ c.test }} <b>{{ c.result_value }} {{ c.unit }}</b> {{ c.flag }} · Dr. {{ c.doctor }} · {{ fdt(c.resulted_at) }}</div></div>
    <div class="split">
      <div class="card flush" style="max-height:75vh;overflow:auto">
        <div v-for="o in orders" :key="o.id" class="list-item" :class="{ on: open === o.id }" @click="open = o.id">
          <div><b>{{ o.order_no }}</b> <span class="badge" :class="badgeClass(o.status)">{{ o.status }}</span> <span v-if="o.priority !== 'Routine'" class="badge red">{{ o.priority }}</span></div>
          <div>{{ o.full_name }} <span class="small muted">{{ o.mrn }}</span></div><div class="small muted">{{ o.items.length }} test(s) · {{ fdt(o.ordered_at) }}</div>
        </div>
        <div v-if="!orders.length" class="empty">Nothing waiting.</div>
      </div>
      <div v-if="cur" class="card">
        <div class="bar"><div><h2 style="margin:0">{{ cur.order_no }} — {{ cur.full_name }}</h2><div class="small muted">{{ cur.mrn }} · {{ cur.gender }} · ordered by {{ cur.doctor }}</div></div><div class="sp"></div>
          <NuxtLink v-if="can('lab_orders.view') && cur.specimens.length" :to="`/print/lab-labels/${cur.id}`" class="btn p">🏷 Tube labels</NuxtLink><NuxtLink v-if="can('lab_orders.view')" :to="`/print/lab-slip/${cur.id}`" class="btn">🖨 Collection slip</NuxtLink><NuxtLink v-if="can('lab_orders.view')" :to="`/print/lab/${cur.id}`" class="btn">🖨 Report</NuxtLink></div>
        <div v-if="cur.status === 'Ordered'" class="alert info">Sample not collected yet. <button class="p sm" :disabled="busy" @click="collectAndLabel(cur)">Collect sample &amp; print tube labels</button> <button class="sm" :disabled="busy" @click="collect(cur)">Collect only</button></div>
        <div v-if="cur.specimens.length" class="small" style="margin-bottom:8px"><b>Specimens:</b> <span v-for="s in cur.specimens" :key="s.id" class="badge" :class="badgeClass(s.status)" style="margin-right:6px">{{ s.barcode }} · {{ s.sample_type }} · {{ s.status }}</span>
          <button v-for="s in cur.specimens.filter((x: any) => x.status !== 'Rejected')" :key="'r' + s.id" class="sm danger" @click="rejectSpec(s)">Reject {{ s.barcode }}</button></div>
        <table><thead><tr><th>Test</th><th>Result</th><th>Text result</th><th>Range</th><th>Flag</th><th>Status</th><th></th></tr></thead>
          <tbody><tr v-for="i in cur.items" :key="i.id">
            <td>{{ i.test }}<div class="small muted">{{ i.code }}</div></td>
            <td style="width:120px"><div class="bar" style="margin:0;flex-wrap:nowrap"><input type="number" step="any" v-model="vals[i.id].v" :disabled="i.status === 'Validated' || cur.status === 'Ordered'" /><span class="small muted">{{ i.unit }}</span></div></td>
            <td><input v-model="vals[i.id].t" :disabled="i.status === 'Validated' || cur.status === 'Ordered'" /></td>
            <td class="small muted nowrap">{{ i.ref_low ?? '' }} – {{ i.ref_high ?? '' }}</td>
            <td><span :class="fc(i.flag)">{{ i.flag }}</span></td><td><span class="badge" :class="badgeClass(i.status)">{{ i.status }}</span></td>
            <td class="nowrap"><button v-if="i.status !== 'Validated' && cur.status !== 'Ordered'" class="sm" :disabled="busy" @click="saveResult(i)">Save</button>
              <button v-if="i.status === 'Resulted' && can('lab.validate')" class="sm ok" :disabled="busy" @click="validate(i)">Validate</button></td></tr></tbody></table>
        <div class="bar" style="margin-top:10px"><button v-if="can('lab.validate') && cur.items.some((i: any) => i.status === 'Resulted')" class="ok" :disabled="busy" @click="validateAll(cur)">Validate all resulted</button>
          <span class="small muted">Validated results are locked and released to the doctor and patient.</span></div>
      </div>
      <div v-else class="card empty">Select an order on the left.</div>
    </div>
  </div>
</template>
