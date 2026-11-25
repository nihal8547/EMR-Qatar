<script setup lang="ts">
definePageMeta({ perm: 'pricing.view' })
const { api } = useApi(); const { err, ok } = useUi(); const { can } = useAuth()
const canEdit = computed(() => can('pricing.edit'))
const tab = ref<'all' | 'payer'>('all')

/* ---------------- all prices ---------------- */
const st = reactive({ q: '', kind: '', category: '', active: false, page: 1, limit: 50 })
const rows = ref<any[]>([]); const total = ref(0); const cats = ref<any[]>([]); const loading = ref(false)
const drafts = reactive<Record<string, string>>({}); const saved = reactive<Record<string, string>>({})
const key = (r: any) => `${r.kind}:${r.id}`
const pages = computed(() => Math.max(1, Math.ceil(total.value / st.limit)))
const query = () => ({ q: st.q || undefined, kind: st.kind || undefined, category: st.category || undefined, active: st.active ? 'true' : undefined })
let seq = 0
async function load() {
  const my = ++seq; loading.value = true
  try {
    const r = await api('/pricing/items', { query: { ...query(), page: st.page, limit: st.limit } })
    if (my !== seq) return
    rows.value = r.rows; total.value = r.total; cats.value = r.categories
    for (const x of r.rows) drafts[key(x)] = String(x.price)
  } catch (e) { err(e) } finally { if (my === seq) loading.value = false }
}
onMounted(load)
let t: any
watch(() => st.q, () => { clearTimeout(t); t = setTimeout(() => { st.page = 1; load() }, 300) })
watch(() => [st.kind, st.category, st.active], () => { st.page = 1; load() })
const go = (p: number) => { st.page = Math.min(Math.max(1, p), pages.value); load() }
function pickCat(c: string) { st.category = st.category === c ? '' : c; st.kind = '' }

async function savePrice(r: any) {
  const k = key(r); const v = drafts[k]
  if (v === String(r.price)) return
  if (v === '' || isNaN(Number(v)) || Number(v) < 0) { drafts[k] = String(r.price); return err('Enter a valid price (0 or more)') }
  try {
    const n = await api(`/pricing/items/${r.kind}/${r.id}`, { method: 'PUT', body: { price: Number(v) } })
    Object.assign(r, n); drafts[k] = String(n.price); saved[k] = 'Saved'; setTimeout(() => delete saved[k], 2000)
    load()   // refresh category averages
  } catch (e) { drafts[k] = String(r.price); err(e) }
}
async function toggle(r: any, field: string) {
  try { const n = await api(`/pricing/items/${r.kind}/${r.id}`, { method: 'PUT', body: { [field]: !r[field] } }); Object.assign(r, n) } catch (e) { err(e) }
}

/* history */
const hist = ref<any>(null)
async function showHistory(r: any) {
  try { hist.value = { item: r, rows: await api(`/pricing/history/${r.kind}/${r.id}`) } } catch (e) { err(e) }
}

/* bulk change */
const bulk = reactive({ mode: 'percent', value: '5', rounding: '0' })
const prev = ref<any>(null); const bBusy = ref(false)
const bulkBody = (preview: boolean) => ({ filter: query(), mode: bulk.mode, value: Number(bulk.value), rounding: Number(bulk.rounding), preview })
async function previewBulk() {
  if (bulk.value === '' || isNaN(Number(bulk.value))) return err('Enter a value')
  bBusy.value = true
  try { prev.value = await api('/pricing/bulk', { method: 'POST', body: bulkBody(true) }) } catch (e) { err(e) } finally { bBusy.value = false }
}
async function applyBulk() {
  if (!prev.value?.count) return
  if (!confirm(`Change the price of ${prev.value.count} item(s)? Past invoices are not affected.`)) return
  bBusy.value = true
  try { const r = await api('/pricing/bulk', { method: 'POST', body: bulkBody(false) }); ok(`${r.updated} price(s) updated`); prev.value = null; await load() } catch (e) { err(e) } finally { bBusy.value = false }
}

async function exportCsv() {
  try {
    const r = await api('/pricing/items', { query: { ...query(), all: 1, limit: 5000 } })
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['Type', 'Code', 'Name', 'Category', 'Price (QAR)', 'Insurance covered', 'Needs pre-auth', 'Active'].join(',')]
    for (const x of r.rows) lines.push([x.kind, x.code, x.name, x.category, x.price, x.covered == null ? '' : x.covered ? 'Yes' : 'No', x.needs_preauth == null ? '' : x.needs_preauth ? 'Yes' : 'No', x.active ? 'Yes' : 'No'].map(esc).join(','))
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'price-list.csv'; a.click(); URL.revokeObjectURL(url)
  } catch (e) { err(e) }
}
const kindLabel: Record<string, string> = { service: 'Service', drug: 'Drug', package: 'Package' }
const addLinks = [['service', '/r/services/new', '+ Service / treatment / test'], ['drug', '/r/drugs/new', '+ Drug'], ['package', '/r/packages/new', '+ Package']]

/* ---------------- payer / corporate ---------------- */
const lists = ref<any[]>([]); const listId = ref<number | null>(null)
const pl = ref<any>(null); const pq = ref(''); const pd = reactive<Record<number, string>>({})
async function loadLists() { try { lists.value = await api('/pricing/lists'); if (!listId.value && lists.value.length) listId.value = lists.value[0].id } catch (e) { err(e) } }
async function loadList() {
  if (!listId.value) { pl.value = null; return }
  try { pl.value = await api(`/pricing/lists/${listId.value}`, { query: { q: pq.value || undefined } }); for (const r of pl.value.rows) pd[r.id] = r.special_price == null ? '' : String(r.special_price) } catch (e) { err(e) }
}
watch(tab, (v) => { if (v === 'payer' && !lists.value.length) loadLists() })
watch(listId, loadList)
let pt: any
watch(pq, () => { clearTimeout(pt); pt = setTimeout(loadList, 300) })
async function saveSpecial(r: any) {
  const v = pd[r.id]
  if (v === (r.special_price == null ? '' : String(r.special_price))) return
  if (v !== '' && (isNaN(Number(v)) || Number(v) < 0)) { pd[r.id] = r.special_price == null ? '' : String(r.special_price); return err('Enter a valid price') }
  try { await api(`/pricing/lists/${listId.value}/service/${r.id}`, { method: 'PUT', body: { price: v === '' ? null : Number(v) } }); await loadList(); lists.value = await api('/pricing/lists') } catch (e) { err(e) }
}
</script>
<template>
  <div>
    <h1>Price Configuration</h1>
    <p class="muted small" style="margin-top:-6px">All treatments, consultations, lab tests, radiology, dental procedures, packages and pharmacy items. A price change applies to new bills only; invoices already raised keep the price they were charged.</p>
    <div class="tabs">
      <button :class="{ on: tab === 'all' }" @click="tab = 'all'">All prices</button>
      <button :class="{ on: tab === 'payer' }" @click="tab = 'payer'">Insurance &amp; corporate prices</button>
    </div>

    <template v-if="tab === 'all'">
      <div class="cards">
        <button v-for="c in cats" :key="c.category" class="card" :class="{ sel: st.category === c.category }" style="text-align:left;margin:0;cursor:pointer" @click="pickCat(c.category)">
          <div class="muted small">{{ c.category }}</div><div style="font-size:20px;font-weight:600">{{ c.n }}</div>
          <div class="muted small">avg {{ money(c.avg) }} · {{ money(c.min) }} – {{ money(c.max) }}</div>
        </button>
      </div>
      <div class="card">
        <div class="bar">
          <input v-model="st.q" placeholder="Search by name or code" style="max-width:260px" />
          <select v-model="st.kind" style="max-width:170px"><option value="">All types</option><option value="service">Services &amp; treatments</option><option value="drug">Pharmacy drugs</option><option value="package">Packages</option></select>
          <label style="display:flex;align-items:center;gap:6px;margin:0"><input v-model="st.active" type="checkbox" style="width:auto" /> Active only</label>
          <button v-if="st.category || st.kind || st.q" class="sm" @click="st.category = ''; st.kind = ''; st.q = ''">Clear filters</button>
          <div class="sp"></div>
          <button @click="exportCsv">⬇ CSV</button>
          <template v-if="canEdit"><NuxtLink v-for="a in addLinks" :key="a[0]" :to="a[1]" class="btn">{{ a[2] }}</NuxtLink></template>
        </div>
      </div>

      <div v-if="canEdit" class="card">
        <b>Change many prices at once</b> <span class="muted small">— applies to everything matching the filters above ({{ total }} item{{ total === 1 ? '' : 's' }})</span>
        <div class="bar" style="margin-top:8px">
          <select v-model="bulk.mode" style="max-width:190px"><option value="percent">Increase / decrease by %</option><option value="amount">Add / subtract QAR</option><option value="set">Set all to QAR</option></select>
          <input v-model="bulk.value" type="number" step="any" style="max-width:110px" :placeholder="bulk.mode === 'percent' ? 'e.g. 5 or -10' : 'QAR'" />
          <select v-model="bulk.rounding" style="max-width:170px"><option value="0">No rounding</option><option value="0.5">Round to 0.5</option><option value="1">Round to 1</option><option value="5">Round to 5</option><option value="10">Round to 10</option></select>
          <button :disabled="bBusy" @click="previewBulk">Preview</button>
        </div>
        <div v-if="prev" style="margin-top:10px">
          <div v-if="!prev.count" class="muted">No price would change.</div>
          <template v-else>
            <div class="alert warn"><b>{{ prev.count }}</b> price(s) will change<span v-if="prev.count > 500"> (first 500 shown)</span>. Nothing is saved until you apply.</div>
            <div style="max-height:260px;overflow:auto"><table class="t"><thead><tr><th>Item</th><th>Category</th><th class="right">Now</th><th class="right">New</th></tr></thead><tbody>
              <tr v-for="c in prev.changes" :key="c.kind + c.id"><td>{{ c.name }}</td><td>{{ c.category }}</td><td class="right">{{ money(c.old) }}</td><td class="right"><b>{{ money(c.new) }}</b></td></tr>
            </tbody></table></div>
            <p><button class="p" :disabled="bBusy" @click="applyBulk">Apply to {{ prev.count }} item(s)</button> <button @click="prev = null">Discard</button></p>
          </template>
        </div>
      </div>

      <div class="card flush">
        <table class="t">
          <thead><tr><th>Code</th><th>Name</th><th>Category</th><th class="right">Price (QAR)</th><th>Covered</th><th>Pre-auth</th><th>Active</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="key(r)" :class="{ off: !r.active }">
              <td class="nowrap">{{ r.code || '—' }}</td>
              <td>{{ r.name }} <span v-if="r.extra && r.extra !== 'Normal'" class="badge amber">{{ r.extra }}</span></td>
              <td><span class="badge grey">{{ r.category }}</span> <span v-if="r.kind === 'drug'" class="muted small">per unit</span></td>
              <td class="right nowrap">
                <input v-if="canEdit" v-model="drafts[key(r)]" type="number" min="0" step="0.01" class="pin" :aria-label="`Price of ${r.name}`" @blur="savePrice(r)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
                <b v-else>{{ money(r.price) }}</b>
                <span v-if="saved[key(r)]" class="ok-tick">✓</span>
              </td>
              <td><input v-if="r.kind === 'service'" type="checkbox" :checked="r.covered" :disabled="!canEdit" style="width:auto" @change="toggle(r, 'covered')" /><span v-else class="muted">—</span></td>
              <td><input v-if="r.kind === 'service'" type="checkbox" :checked="r.needs_preauth" :disabled="!canEdit" style="width:auto" @change="toggle(r, 'needs_preauth')" /><span v-else class="muted">—</span></td>
              <td><input type="checkbox" :checked="r.active" :disabled="!canEdit" style="width:auto" @change="toggle(r, 'active')" /></td>
              <td class="right"><button class="sm" @click="showHistory(r)">History</button></td>
            </tr>
            <tr v-if="!rows.length && !loading"><td colspan="8" class="muted">Nothing matches.</td></tr>
          </tbody>
        </table>
        <div class="bar" style="padding:10px"><span class="muted small">{{ total }} item(s)</span><div class="sp"></div>
          <button class="sm" :disabled="st.page <= 1" @click="go(st.page - 1)">‹ Prev</button><span class="small">Page {{ st.page }} / {{ pages }}</span><button class="sm" :disabled="st.page >= pages" @click="go(st.page + 1)">Next ›</button></div>
      </div>

      <div v-if="hist" class="modal-bg" @mousedown.self="hist = null">
        <div class="modal" style="max-width:520px">
          <h3 style="margin-top:0">Price history · {{ hist.item.name }}</h3>
          <p class="muted small">Current price {{ money(hist.item.price) }} ({{ kindLabel[hist.item.kind] }})</p>
          <table class="t"><thead><tr><th>When</th><th>By</th><th class="right">From</th><th class="right">To</th></tr></thead><tbody>
            <tr v-for="(h, i) in hist.rows" :key="i"><td>{{ fdt(h.at) }}</td><td>{{ h.by }}<span v-if="h.bulk" class="muted small"> (bulk)</span></td><td class="right">{{ h.price ? money(h.price.from) : '—' }}</td><td class="right">{{ h.price ? money(h.price.to) : h.action.replace('_', ' ').toLowerCase() }}</td></tr>
            <tr v-if="!hist.rows.length"><td colspan="4" class="muted">No changes recorded since this feature was added.</td></tr>
          </tbody></table>
          <p class="right"><button @click="hist = null">Close</button></p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="card">
        <p class="muted small" style="margin-top:0">Insurers and corporate accounts can have their own price list. A service with a special price uses it; every other service gets the list's default discount off the cash price. Pharmacy items always use the drug price.</p>
        <div class="bar">
          <select v-model="listId" style="max-width:340px"><option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }} — {{ l.payer || l.corporate || 'General' }} ({{ l.special_count }} special)</option></select>
          <input v-model="pq" placeholder="Search service" style="max-width:240px" />
          <div class="sp"></div>
          <NuxtLink v-if="canEdit" to="/r/price_lists/new" class="btn">+ New price list</NuxtLink>
          <NuxtLink v-if="listId && can('price_lists.edit')" :to="`/r/price_lists/${listId}`" class="btn">List settings / discount</NuxtLink>
        </div>
        <div v-if="!lists.length" class="muted" style="margin-top:10px">No price lists yet.</div>
      </div>
      <div v-if="pl" class="card flush">
        <div style="padding:10px 14px" class="small muted">Default discount for services without a special price: <b>{{ pl.list.discount_pct || 0 }}%</b></div>
        <table class="t"><thead><tr><th>Code</th><th>Service</th><th>Category</th><th class="right">Cash price</th><th class="right">Special price</th><th class="right">Payer pays</th></tr></thead><tbody>
          <tr v-for="r in pl.rows" :key="r.id">
            <td>{{ r.code }}</td><td>{{ r.name }}</td><td><span class="badge grey">{{ r.category }}</span></td><td class="right">{{ money(r.cash_price) }}</td>
            <td class="right"><input v-if="canEdit" v-model="pd[r.id]" type="number" min="0" step="0.01" class="pin" placeholder="—" :aria-label="`Special price of ${r.name}`" @blur="saveSpecial(r)" @keydown.enter="($event.target as HTMLInputElement).blur()" /><span v-else>{{ r.special_price == null ? '—' : money(r.special_price) }}</span></td>
            <td class="right"><b>{{ money(r.effective_price) }}</b></td>
          </tr>
        </tbody></table>
      </div>
    </template>
  </div>
</template>
<style scoped>
.pin{width:110px;text-align:right;padding:4px 8px}
.off td{opacity:.55}
.ok-tick{color:#14633a;margin-left:6px;font-weight:700}
.card.sel{border-color:#111;box-shadow:0 0 0 1px #111 inset}
</style>
