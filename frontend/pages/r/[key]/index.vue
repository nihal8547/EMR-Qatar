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

const isGrouped = ref(false)
const expandedGroups = ref<Record<string, boolean>>({})

type ChargeGroup = {
  id: string
  patient_id: number | null
  patient_label: string
  visit_id: number | null
  visit_label: string
  total_amount: number
  total_qty: number
  items: any[]
  statuses: Record<string, number>
  invoices: string[]
  created_at: string
}

type DoctorScheduleGroup = {
  id: string
  doctor_id: number | null
  doctor_name: string
  items: any[]
  days_count: number
  rooms: string[]
  time_summary: string
  active: boolean
}

const groupedCharges = computed<ChargeGroup[]>(() => {
  if (key.value !== 'charges') return []
  const map: Record<string, ChargeGroup> = {}
  for (const r of rows.value) {
    const gKey = r.patient_id ? `${r.patient_id}_${r.visit_id || 0}` : `row_${r.id}`
    if (!map[gKey]) {
      map[gKey] = {
        id: gKey,
        patient_id: r.patient_id || null,
        patient_label: r.patient_id__label || 'General / Unknown',
        visit_id: r.visit_id || null,
        visit_label: r.visit_id__label || '-',
        total_amount: 0,
        total_qty: 0,
        items: [],
        statuses: {},
        invoices: [],
        created_at: r.created_at,
      }
    }
    const g = map[gKey]
    g.total_amount += Number(r.amount) || 0
    g.total_qty += Number(r.qty) || 0
    g.items.push(r)
    if (r.status) {
      g.statuses[r.status] = (g.statuses[r.status] || 0) + 1
    }
    if (r.invoice_id__label && !g.invoices.includes(r.invoice_id__label)) {
      g.invoices.push(r.invoice_id__label)
    }
  }
  return Object.values(map)
})

const dayOrder: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

const groupedDoctorSchedules = computed<DoctorScheduleGroup[]>(() => {
  if (key.value !== 'doctor_schedules') return []
  const map: Record<string, DoctorScheduleGroup> = {}
  for (const r of rows.value) {
    const gKey = r.doctor_id ? `doc_${r.doctor_id}` : `row_${r.id}`
    if (!map[gKey]) {
      map[gKey] = {
        id: gKey,
        doctor_id: r.doctor_id || null,
        doctor_name: r.doctor_id__label || 'Unknown Doctor',
        items: [],
        days_count: 0,
        rooms: [],
        time_summary: '',
        active: true,
      }
    }
    const g = map[gKey]
    g.items.push(r)
    if (r.room && !g.rooms.includes(r.room)) {
      g.rooms.push(r.room)
    }
    if (r.active === false) {
      g.active = false
    }
  }

  return Object.values(map).map((g) => {
    g.items.sort((a, b) => (dayOrder[a.weekday] ?? 99) - (dayOrder[b.weekday] ?? 99))
    g.days_count = g.items.length
    const times = Array.from(new Set(g.items.map((x) => `${x.start_time} - ${x.end_time}`)))
    g.time_summary = times.join(', ')
    return g
  })
})

function toggleGroup(id: string) {
  expandedGroups.value[id] = !expandedGroups.value[id]
}

function expandAll(val = true) {
  if (key.value === 'charges') {
    for (const g of groupedCharges.value) {
      expandedGroups.value[g.id] = val
    }
  } else if (key.value === 'doctor_schedules') {
    for (const g of groupedDoctorSchedules.value) {
      expandedGroups.value[g.id] = val
    }
  }
}

function onScheduleSelect(g: DoctorScheduleGroup, scheduleId: string) {
  if (!scheduleId) return
  navigateTo(`/r/doctor_schedules/${scheduleId}`)
}

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
let loadSeq = 0
async function load() {
  if (!m.value) return
  const my = ++loadSeq   // ignore answers that arrive after a newer search was sent
  loading.value = true
  try { const r = await api(`/r/${key.value}`, { query: query() }); if (my !== loadSeq) return; rows.value = r.rows; total.value = r.total } catch (e) { if (my === loadSeq) err(e) } finally { if (my === loadSeq) loading.value = false }
}
async function init() {
  const meta = await ensure()
  m.value = meta[key.value] || null
  const defaultLimit = (key.value === 'charges' || key.value === 'doctor_schedules') ? 100 : 25
  isGrouped.value = key.value === 'charges' || key.value === 'doctor_schedules'
  expandedGroups.value = {}
  Object.assign(state, { q: '', page: 1, limit: defaultLimit, sort: '', dir: 'desc', filters: Object.fromEntries(filterFields.value.map((f: any) => [f.name, ''])), from: '', to: '' })
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
      <template v-if="key === 'charges' || key === 'doctor_schedules'">
        <button type="button" class="sm" :class="{ p: isGrouped }" @click="isGrouped = !isGrouped">
          {{ isGrouped ? (key === 'charges' ? '👥 Same Person Grouped' : '👨‍⚕️ Grouped by Doctor') : '📋 Flat View' }}
        </button>
        <template v-if="isGrouped">
          <button type="button" class="sm" @click="expandAll(true)">▾ Expand all</button>
          <button type="button" class="sm" @click="expandAll(false)">▸ Collapse all</button>
        </template>
      </template>
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
      <!-- Grouped view for Charges (Bill Lines) -->
      <template v-if="key === 'charges' && isGrouped">
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:36px"></th>
                <th>Patient</th>
                <th>Visit</th>
                <th>Charge Items</th>
                <th class="num">Total Amount</th>
                <th>Status</th>
                <th>Invoice</th>
                <th class="right">Action</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in groupedCharges" :key="g.id">
                <tr class="click" :style="expandedGroups[g.id] ? 'background:#f0f4f8' : ''" @click="toggleGroup(g.id)">
                  <td style="text-align:center; color:var(--muted)">
                    <span style="display:inline-block; font-size:12px; transition:transform 0.15s" :style="{ transform: expandedGroups[g.id] ? 'rotate(90deg)' : 'none' }">▶</span>
                  </td>
                  <td><strong>{{ g.patient_label }}</strong></td>
                  <td><span class="chip" style="font-size:11px; padding:2px 8px">{{ g.visit_label }}</span></td>
                  <td>
                    <span class="badge grey">{{ g.items.length }} line{{ g.items.length > 1 ? 's' : '' }}</span>
                    <span class="small muted" style="margin-left:6px">({{ g.items.map((x: any) => x.description).slice(0, 2).join(', ') }}{{ g.items.length > 2 ? '…' : '' }})</span>
                  </td>
                  <td class="num"><strong style="color:var(--maroon)">{{ money(g.total_amount) }}</strong></td>
                  <td>
                    <span v-for="(cnt, st) in g.statuses" :key="st" class="badge" :class="badgeClass(st)" style="margin-right:4px">
                      {{ st }} <template v-if="g.items.length > 1">({{ cnt }})</template>
                    </span>
                  </td>
                  <td>
                    <span v-if="g.invoices.length" class="small">{{ g.invoices.join(', ') }}</span>
                    <span v-else class="small muted">-</span>
                  </td>
                  <td class="right" @click.stop>
                    <button type="button" class="sm" @click="toggleGroup(g.id)">
                      {{ expandedGroups[g.id] ? '▲ Close' : '▼ Full Details' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedGroups[g.id]" style="background:#fafbfc">
                  <td colspan="8" style="padding:14px 18px; border-bottom:2px solid var(--line); background:#f8fafc">
                    <div style="background:#fff; border:1px solid var(--line); border-radius:8px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.04)">
                      <div class="bar" style="margin-bottom:10px">
                        <div>
                          <h3 style="margin:0; font-size:15px; font-weight:700">📋 Full Bill Breakdown for {{ g.patient_label }}</h3>
                          <div class="small muted" style="margin-top:2px">
                            Visit: <b>{{ g.visit_label }}</b> · Total Amount: <b style="color:var(--maroon)">{{ money(g.total_amount) }} QAR</b> ({{ g.items.length }} items)
                          </div>
                        </div>
                        <div class="sp"></div>
                        <NuxtLink v-if="g.patient_id" :to="'/patient/' + g.patient_id" class="btn sm" target="_blank">Patient 360 ↗</NuxtLink>
                        <NuxtLink to="/cashier" class="btn sm p">Go to Cashier ↗</NuxtLink>
                      </div>
                      <div style="overflow-x:auto">
                        <table style="font-size:13px; background:#fff">
                          <thead>
                            <tr style="background:#f1f4f8">
                              <th style="width:34px">#</th>
                              <th>Item / Service</th>
                              <th>Source</th>
                              <th class="num">Qty</th>
                              <th class="num">Unit Price</th>
                              <th class="num">Amount (QAR)</th>
                              <th>Status</th>
                              <th>Invoice No</th>
                              <th class="right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(item, idx) in g.items" :key="item.id">
                              <td class="muted small">{{ idx + 1 }}</td>
                              <td>
                                <div style="font-weight:600">{{ item.description }}</div>
                                <div v-if="item.service_id__label && item.service_id__label !== item.description" class="small muted">{{ item.service_id__label }}</div>
                              </td>
                              <td><span class="badge blue">{{ item.source }}</span></td>
                              <td class="num">{{ item.qty }}</td>
                              <td class="num">{{ money(item.unit_price) }}</td>
                              <td class="num"><b>{{ money(item.amount) }}</b></td>
                              <td><span class="badge" :class="badgeClass(item.status)">{{ item.status }}</span></td>
                              <td>
                                <span v-if="item.invoice_id__label" class="badge grey">{{ item.invoice_id__label }}</span>
                                <span v-else class="muted small">Unbilled</span>
                              </td>
                              <td class="right" @click.stop>
                                <NuxtLink :to="'/r/charges/' + item.id" class="btn sm">Edit / View #{{ item.id }}</NuxtLink>
                              </td>
                            </tr>
                          </tbody>
                          <tfoot>
                            <tr style="background:#f8fafc; font-weight:700">
                              <td colspan="5" class="right">Total ({{ g.items.length }} charges):</td>
                              <td class="num" style="font-size:14px; color:var(--maroon)">{{ money(g.total_amount) }}</td>
                              <td colspan="3"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <div v-if="!loading && !groupedCharges.length" class="empty">No records found.</div>
          <div v-if="loading" class="empty">Loading…</div>
        </div>
      </template>

      <!-- Grouped view for Doctor Schedules -->
      <template v-else-if="key === 'doctor_schedules' && isGrouped">
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:36px"></th>
                <th>Doctor</th>
                <th>Week Schedule (Dropdown)</th>
                <th>Working Days</th>
                <th>Hours</th>
                <th>Room</th>
                <th>Status</th>
                <th class="right">Action</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in groupedDoctorSchedules" :key="g.id">
                <tr class="click" :style="expandedGroups[g.id] ? 'background:#f0f4f8' : ''" @click="toggleGroup(g.id)">
                  <td style="text-align:center; color:var(--muted)">
                    <span style="display:inline-block; font-size:12px; transition:transform 0.15s" :style="{ transform: expandedGroups[g.id] ? 'rotate(90deg)' : 'none' }">▶</span>
                  </td>
                  <td><strong>👨‍⚕️ {{ g.doctor_name }}</strong></td>
                  <td @click.stop>
                    <select style="max-width:270px; font-size:12px; padding:4px 8px; border-radius:6px" @change="onScheduleSelect(g, ($event.target as HTMLSelectElement).value)">
                      <option value="">📅 Week Schedule ({{ g.days_count }} days) ▼</option>
                      <option v-for="item in g.items" :key="item.id" :value="item.id">
                        {{ item.weekday }}: {{ item.start_time }} – {{ item.end_time }} ({{ item.room || 'No Room' }})
                      </option>
                    </select>
                  </td>
                  <td>
                    <span v-for="item in g.items" :key="item.id" class="badge" :class="item.active ? 'green' : 'grey'" style="margin-right:3px; font-size:11px" :title="item.weekday + ': ' + item.start_time + ' - ' + item.end_time">
                      {{ item.weekday.slice(0, 3) }}
                    </span>
                  </td>
                  <td><span class="small">{{ g.time_summary || '-' }}</span></td>
                  <td><span class="small">{{ g.rooms.join(', ') || '-' }}</span></td>
                  <td><span class="badge" :class="g.active ? 'green' : 'grey'">{{ g.active ? 'Active' : 'Inactive' }}</span></td>
                  <td class="right" @click.stop>
                    <button type="button" class="sm" @click="toggleGroup(g.id)">
                      {{ expandedGroups[g.id] ? '▲ Close' : '▼ Week Details' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedGroups[g.id]" style="background:#fafbfc">
                  <td colspan="8" style="padding:14px 18px; border-bottom:2px solid var(--line); background:#f8fafc">
                    <div style="background:#fff; border:1px solid var(--line); border-radius:8px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.04)">
                      <div class="bar" style="margin-bottom:10px">
                        <div>
                          <h3 style="margin:0; font-size:15px; font-weight:700">📅 Weekly Schedule: 👨‍⚕️ {{ g.doctor_name }}</h3>
                          <div class="small muted" style="margin-top:2px">
                            Total <b>{{ g.items.length }} scheduled day(s)</b> · Timing: <b>{{ g.time_summary }}</b> · Room: <b>{{ g.rooms.join(', ') }}</b>
                          </div>
                        </div>
                        <div class="sp"></div>
                        <NuxtLink v-if="m.can.create" :to="'/r/doctor_schedules/new'" class="btn sm p">+ Add Schedule Day</NuxtLink>
                      </div>
                      <div style="overflow-x:auto">
                        <table style="font-size:13px; background:#fff">
                          <thead>
                            <tr style="background:#f1f4f8">
                              <th style="width:34px">#</th>
                              <th>Weekday</th>
                              <th>From (Start)</th>
                              <th>To (End)</th>
                              <th>Slot Duration</th>
                              <th>Room</th>
                              <th>Status</th>
                              <th class="right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(item, idx) in g.items" :key="item.id">
                              <td class="muted small">{{ idx + 1 }}</td>
                              <td>
                                <span class="badge" style="font-weight:600; background:#e8f1fb; color:#1f4f86">{{ item.weekday }}</span>
                              </td>
                              <td><b>{{ item.start_time }}</b></td>
                              <td><b>{{ item.end_time }}</b></td>
                              <td>{{ item.slot_minutes }} mins</td>
                              <td><span class="chip" style="font-size:11px; padding:2px 8px">{{ item.room || '-' }}</span></td>
                              <td><span class="badge" :class="item.active ? 'green' : 'grey'">{{ item.active ? 'Active' : 'Inactive' }}</span></td>
                              <td class="right" @click.stop>
                                <NuxtLink :to="'/r/doctor_schedules/' + item.id" class="btn sm">Edit Day #{{ item.id }}</NuxtLink>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <div v-if="!loading && !groupedDoctorSchedules.length" class="empty">No schedules found.</div>
          <div v-if="loading" class="empty">Loading…</div>
        </div>
      </template>

      <!-- Standard flat view -->
      <template v-else>
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
      </template>
    </div>
    <div class="bar">
      <span class="muted small">
        <template v-if="key === 'charges' && isGrouped">{{ groupedCharges.length }} person group(s) · </template>
        <template v-else-if="key === 'doctor_schedules' && isGrouped">{{ groupedDoctorSchedules.length }} doctor(s) · </template>
        {{ total }} record(s)
      </span>
      <div class="sp"></div>
      <button class="sm" :disabled="state.page <= 1" @click="go(state.page - 1)">‹ Prev</button><span class="small">Page {{ state.page }} / {{ pages }}</span><button class="sm" :disabled="state.page >= pages" @click="go(state.page + 1)">Next ›</button>
    </div>
  </div>
</template>
