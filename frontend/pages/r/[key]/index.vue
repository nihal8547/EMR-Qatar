<script setup lang="ts">
const route = useRoute()
const { api } = useApi(); const { err } = useUi(); const { ensure } = useMeta()
const key = computed(() => String(route.params.key))
const m = ref<any>(null)
const printBase = computed(() => ({ lab_orders: '/print/lab', prescriptions: '/print/rx', invoices: '/print/invoice', certificates: '/print/doc/certificates', referrals: '/print/doc/referrals', payments: '/print/doc/payments', imaging_reports: '/print/doc/imaging_reports', visits: '/print/doc/visits', dental_treatment_plans: '/print/doc/dental_treatment_plans', claims: '/print/doc/claims', pharmacy_dispenses: '/print/dispense', otc_sales: '/print/doc/otc_sales' } as Record<string, string>)[String(route.params.key)] || '')
const rows = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const state = reactive({ q: '', page: 1, limit: 25, sort: '', dir: 'desc', filters: {} as Record<string, any>, from: '', to: '' })

const listFields = computed(() => (m.value?.fields || []).filter((f: any) => f.list && !f.hidden))
const filterFields = computed(() => (m.value?.fields || []).filter((f: any) => f.filter && !f.hidden))
const dateField = computed(() => listFields.value.find((f: any) => f.type === 'date' || f.type === 'datetime'))
const pages = computed(() => Math.max(1, Math.ceil(total.value / state.limit)))
const numeric = (f: any) => ['money', 'int', 'decimal'].includes(f.type)

function query() {
  const q: Record<string, any> = { q: state.q, page: state.page, limit: state.limit, sort: state.sort, dir: state.dir }
  for (const [k, v] of Object.entries(state.filters)) if (v !== null && v !== '' && v !== undefined) q[k] = v
  if (dateField.value) { if (state.from) q['from_' + dateField.value.name] = state.from; if (state.to) q['to_' + dateField.value.name] = state.to }
  return q
}
async function load() {
  if (!m.value) return
  loading.value = true
  try { const r = await api(`/r/${key.value}`, { query: query() }); rows.value = r.rows; total.value = r.total } catch (e) { err(e) } finally { loading.value = false }
}
async function init() {
  const meta = await ensure()
  m.value = meta[key.value] || null
  Object.assign(state, { q: '', page: 1, sort: '', dir: 'desc', filters: Object.fromEntries(filterFields.value.map((f: any) => [f.name, ''])), from: '', to: '' })
  rows.value = []
  resetting = true
  await nextTick()   // let the filter watcher see the reset first, so it does not trigger a second load
  resetting = false
  if (m.value) await load()
}
onMounted(init)
watch(key, init)
let t: any
let resetting = false
watch(() => state.q, () => { if (resetting) return; clearTimeout(t); t = setTimeout(() => { state.page = 1; load() }, 300) })
watch(() => [state.filters, state.from, state.to], () => { if (resetting) return; state.page = 1; load() }, { deep: true })
function sortBy(f: any) { if (state.sort === f.name) state.dir = state.dir === 'asc' ? 'desc' : 'asc'; else { state.sort = f.name; state.dir = 'asc' } load() }
function go(p: number) { state.page = Math.min(Math.max(1, p), pages.value); load() }
const cell = (r: any, f: any) => {
  const v = f.type === 'ref' ? r[f.name + '__label'] : r[f.name]
  if (f.type === 'bool') return v ? 'Yes' : 'No'
  if (f.type === 'money') return money(v)
  if (f.type === 'date') return fdate(v)
  if (f.type === 'datetime') return fdt(v)
  return v ?? ''
}
const isStatus = (f: any) => f.type === 'select' && /status|flag|severity|priority|movement/.test(f.name)
async function exportCsv() { try { await downloadCsv(`/r/${key.value}`, { ...query(), page: undefined, limit: 20000 }, `${key.value}.csv`) } catch (e) { err(e) } }
</script>
<template>
  <div v-if="!m" class="card"><h1>Not available</h1><p class="muted">This list does not exist, or your role cannot view it.</p></div>
  <div v-else>
    <div class="bar"><div><h1>{{ m.label }}</h1><div v-if="m.help" class="muted small">{{ m.help }}</div></div><div class="sp"></div>
      <button @click="exportCsv">⬇ CSV</button>
      <NuxtLink v-if="m.can.create" :to="`/r/${key}/new`" class="btn p">+ New {{ m.singular || '' }}</NuxtLink>
    </div>
    <div class="card" style="padding:10px 12px">
      <div class="bar" style="margin:0">
        <input v-model="state.q" :placeholder="m?.fields?.some((x: any) => x.name === 'patient_id') ? 'Search (MRN, patient name, phone…)' : 'Search…'" style="max-width:260px" />
        <template v-for="f in filterFields" :key="f.name">
          <select v-if="f.type === 'select'" v-model="state.filters[f.name]" style="max-width:170px"><option value="">{{ f.label }}: all</option><option v-for="o in f.options" :key="o" :value="o">{{ o }}</option></select>
          <select v-else-if="f.type === 'bool'" v-model="state.filters[f.name]" style="max-width:150px"><option value="">{{ f.label }}: all</option><option value="true">Yes</option><option value="false">No</option></select>
          <div v-else-if="f.type === 'ref'" style="width:200px"><LookupSelect v-model="state.filters[f.name]" :resource="f.ref" :placeholder="f.label" /></div>
        </template>
        <template v-if="dateField"><span class="muted small">{{ dateField.label }}</span><input type="date" v-model="state.from" style="width:150px" /><span>–</span><input type="date" v-model="state.to" style="width:150px" /></template>
      </div>
    </div>
    <div class="card flush">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th v-if="printBase" class="no-print"></th><th v-for="f in listFields" :key="f.name" class="sort" :class="{ num: numeric(f) }" @click="sortBy(f)">{{ f.label }} <span v-if="state.sort === f.name">{{ state.dir === 'asc' ? '▲' : '▼' }}</span></th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" class="click" @click="navigateTo(`/r/${key}/${r.id}`)">
              <td v-if="printBase" class="no-print" @click.stop><NuxtLink :to="`${printBase}/${r.id}`" class="btn sm" title="Print">🖨</NuxtLink></td>
              <td v-for="f in listFields" :key="f.name" :class="{ num: numeric(f) }"><span v-if="isStatus(f) && r[f.name]" class="badge" :class="badgeClass(r[f.name])">{{ r[f.name] }}</span><template v-else>{{ cell(r, f) }}</template></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !rows.length" class="empty">No records found.</div>
        <div v-if="loading" class="empty loading">Loading…</div>
      </div>
    </div>
    <div class="bar"><span class="muted small">{{ total }} record(s)</span><div class="sp"></div>
      <button class="sm" :disabled="state.page <= 1" @click="go(state.page - 1)">‹ Prev</button><span class="small">Page {{ state.page }} / {{ pages }}</span><button class="sm" :disabled="state.page >= pages" @click="go(state.page + 1)">Next ›</button>
    </div>
  </div>
</template>
