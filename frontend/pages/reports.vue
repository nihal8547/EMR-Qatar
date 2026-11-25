<script setup lang="ts">
definePageMeta({ perm: 'reports.view' })
const { api } = useApi(); const { err } = useUi()
const list = ref<any[]>([]); const key = ref(''); const out = ref<any>(null); const loading = ref(false)
const from = ref(todayStr().slice(0, 8) + '01'); const to = ref(todayStr())
onMounted(async () => { try { list.value = await api('/reports'); if (list.value.length) { key.value = list.value[0].key } } catch (e) { err(e) } })
const cur = computed(() => list.value.find((r) => r.key === key.value))
async function run() { if (!key.value) return; loading.value = true; try { out.value = await api(`/reports/${key.value}`, { query: { from: from.value, to: to.value } }) } catch (e) { err(e) } finally { loading.value = false } }
watch(key, run)
const cell = (r: any, c: any) => { const v = r[c.key]; if (c.type === 'money') return money(v); if (c.type === 'date') return fdate(v); if (c.type === 'datetime') return fdt(v); return v ?? '' }
const printNow = () => window.print()
async function csv() { try { await downloadCsv(`/reports/${key.value}`, { from: from.value, to: to.value }, `${key.value}.csv`) } catch (e) { err(e) } }
</script>
<template>
  <div>
    <div class="bar"><h1>Reports</h1><div class="sp"></div><select v-model="key" style="width:320px"><option v-for="r in list" :key="r.key" :value="r.key">{{ r.title }}</option></select>
      <template v-if="cur?.dated"><input type="date" v-model="from" style="width:150px" /><span>–</span><input type="date" v-model="to" style="width:150px" /></template><button class="p" @click="run">Run</button><button @click="csv">⬇ CSV</button><button @click="printNow">🖨 Print</button></div>
    <div class="card flush"><div v-if="loading" class="empty">Loading…</div>
      <div v-else-if="out" class="tbl-wrap"><h2 class="print-only" style="padding:8px">{{ out.title }} ({{ out.from }} to {{ out.to }})</h2>
        <table><thead><tr><th v-for="c in out.cols" :key="c.key" :class="{ num: c.type === 'money' || c.type === 'int' }">{{ c.label }}</th></tr></thead>
          <tbody><tr v-for="(r, i) in out.rows" :key="i"><td v-for="c in out.cols" :key="c.key" :class="{ num: c.type === 'money' || c.type === 'int' }">{{ cell(r, c) }}</td></tr>
            <tr v-if="Object.keys(out.totals).length && out.rows.length"><td v-for="(c, i) in out.cols" :key="c.key" :class="{ num: c.type === 'money' || c.type === 'int' }"><b>{{ i === 0 ? 'Total' : out.totals[c.key] !== undefined ? (c.type === 'money' ? money(out.totals[c.key]) : out.totals[c.key]) : '' }}</b></td></tr></tbody></table>
        <div v-if="!out.rows.length" class="empty">No data for this period.</div></div></div>
  </div>
</template>
