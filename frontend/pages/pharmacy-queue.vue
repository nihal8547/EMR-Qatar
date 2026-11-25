<script setup lang="ts">
definePageMeta({ perm: 'pharmacy.dispense' })
const { api } = useApi(); const { ok, err } = useUi()
const rows = ref<any[]>([]); const open = ref<number | null>(null)
const qty = reactive<Record<number, number>>({}); const witness = ref(''); const override = ref(false); const busy = ref(false)
const allergyHit = ref('')
const est = ref<any>(null); const pay = reactive({ method: 'Cash', reference: '' }); const sess = ref<any>(null); const openCash = ref<number | null>(0)
const { can } = useAuth()
async function loadSess() { try { sess.value = await api('/billing/session/current') } catch { sess.value = null } }
onMounted(loadSess)
const lines = () => (cur.value?.items || []).filter((i: any) => qty[i.id] > 0).map((i: any) => ({ prescription_item_id: i.id, qty: qty[i.id] }))
let et: any
function refreshEst() { clearTimeout(et); et = setTimeout(async () => { const c = cur.value; if (!c || !lines().length) { est.value = null; return } try { est.value = await api('/pharmacy/estimate', { method: 'POST', body: { prescription_id: c.id, items: lines() } }) } catch { est.value = null } }, 250) }
watch(() => ({ ...qty, id: open.value }), refreshEst, { deep: true })
async function openSession() { try { await api('/billing/session/open', { method: 'POST', body: { opening_cash: openCash.value || 0 } }); ok('Cashier session opened'); await loadSess() } catch (e) { err(e) } }
const lastDisp = ref<any>(null)
const dueNow = computed(() => Number(est.value?.patient_share || 0))
const blockers = computed(() => cur.value?.payer?.blockers || [])
async function load() { try { rows.value = await api('/pharmacy/queue') } catch (e) { err(e) } }
let t: any; onMounted(() => { load(); t = setInterval(load, 30000) }); onBeforeUnmount(() => clearInterval(t))
const cur = computed(() => rows.value.find((r) => r.id === open.value))
watch(cur, (c) => { est.value = null; pay.reference = ''; witness.value = ''; override.value = false; allergyHit.value = ''; if (c) for (const i of c.items) qty[i.id] = Math.max(0, Math.min(i.qty - i.dispensed, i.stock)) })
const hasNarcotic = computed(() => cur.value?.items.some((i: any) => i.schedule === 'Narcotic'))
async function dispense() {
  const c = cur.value; if (!c) return
  const items = c.items.filter((i: any) => qty[i.id] > 0).map((i: any) => ({ prescription_item_id: i.id, qty: qty[i.id] }))
  busy.value = true
  try {
    const r = await api('/pharmacy/dispense', { method: 'POST', body: { prescription_id: c.id, items, witness: witness.value, override_allergy: override.value, ...(dueNow.value > 0.005 || c.payer?.type === 'Cash' ? { payment: { method: pay.method, reference: pay.reference } } : {}) } })
    ok(`Dispensed ${r.dispense_no || ''}. Total ${money(r.total)}${r.payment?.amount ? ' · received ' + money(r.payment.amount) : ''}`); lastDisp.value = r; open.value = null; await load(); loadSess()
  } catch (e: any) { if (e.extra?.allergy) allergyHit.value = e.message; else err(e); loadSess() } finally { busy.value = false }
}
</script>
<template>
  <div>
    <div class="bar"><h1>Dispensing Queue</h1><div class="sp"></div><button @click="load">↻ Refresh</button></div>
    <div v-if="lastDisp" class="alert ok">Dispensed <b>{{ lastDisp.dispense_no }}</b> · {{ money(lastDisp.total) }}<span v-if="lastDisp.payment?.amount"> · received {{ money(lastDisp.payment.amount) }} ({{ lastDisp.payment.receipt_no }})</span>
      <NuxtLink :to="`/print/dispense/${lastDisp.dispense_id}`" class="btn sm">🖨 Slip &amp; receipt</NuxtLink><NuxtLink :to="`/print/dispense/${lastDisp.dispense_id}?mode=labels`" class="btn sm">🏷 Medicine labels</NuxtLink><button class="sm" @click="lastDisp = null">✕</button></div>
    <div class="split">
      <div class="card flush" style="max-height:75vh;overflow:auto">
        <div v-for="r in rows" :key="r.id" class="list-item" :class="{ on: open === r.id }" @click="open = r.id">
          <b>{{ r.rx_no }}</b> <span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span><div>{{ r.full_name }} <span class="small muted">{{ r.mrn }}</span></div>
          <div class="small muted">{{ r.items.length }} item(s) · Dr. {{ r.doctor }} · {{ r.payer_type }}<span v-if="r.payer?.blockers?.length" style="color:var(--bad)"> · ⛔ payer issue</span></div>
          <div v-if="r.allergies.length" class="small" style="color:var(--bad)">⚠ {{ r.allergies.join(', ') }}</div>
        </div>
        <div v-if="!rows.length" class="empty">No prescriptions waiting.</div>
      </div>
      <div v-if="cur" class="card">
        <h2>{{ cur.rx_no }} — {{ cur.full_name }}</h2>
        <div v-if="cur.allergies.length" class="alert err"><b>Allergies:</b> {{ cur.allergies.join(', ') }}</div>
        <div class="card" style="background:#fafbfc;padding:10px;margin:8px 0">
          <div class="bar" style="margin:0"><b>Payer check</b><span class="badge" :class="cur.payer.type === 'Cash' ? '' : 'blue'">{{ cur.payer.type }}</span>
            <template v-if="cur.payer.type === 'Insurance'"><span>{{ cur.payer.payer_name }} · {{ cur.payer.plan_name || 'no plan' }}</span><span class="small muted">Policy {{ cur.payer.policy_no }} · Member {{ cur.payer.member_id }} · valid to {{ fdate(cur.payer.valid_to) }}</span><span class="badge" :class="cur.payer.policy_status === 'Active' ? 'green' : 'red'">{{ cur.payer.policy_status }}</span><span class="badge" :class="cur.payer.eligibility === 'Eligible' ? 'green' : cur.payer.eligibility === 'Not eligible' ? 'red' : 'amber'">{{ cur.payer.eligibility }}</span>
              <span class="small">Co-pay {{ cur.payer.copay_pct }}%<template v-if="Number(cur.payer.copay_max) > 0"> (max {{ money(cur.payer.copay_max) }})</template></span></template>
            <template v-else-if="cur.payer.type === 'Corporate'"><span>{{ cur.payer.corporate_name }}</span></template>
            <span v-else class="small muted">Self-pay — payment is collected before dispensing</span></div>
          <div v-for="b in blockers" :key="b" class="alert err" style="margin:6px 0 0">⛔ {{ b }}</div>
          <div v-for="w in cur.payer.warnings" :key="w" class="alert warn" style="margin:6px 0 0">{{ w }}</div>
        </div>
        <table><thead><tr><th>Medicine</th><th>Directions</th><th class="num">Prescribed</th><th class="num">Given</th><th class="num">In stock</th><th style="width:100px">Dispense now</th></tr></thead>
          <tbody><tr v-for="i in cur.items" :key="i.id"><td>{{ i.drug }}<span v-if="i.schedule !== 'Normal'" class="badge red" style="margin-left:6px">{{ i.schedule }}</span></td><td>{{ i.dose }} {{ i.frequency }} × {{ i.days }}d</td><td class="num">{{ i.qty }}</td><td class="num">{{ i.dispensed }}</td>
            <td class="num" :style="{ color: i.stock < i.qty - i.dispensed ? 'var(--bad)' : '' }">{{ i.stock }}</td><td><input type="number" min="0" :max="i.qty - i.dispensed" v-model.number="qty[i.id]" :disabled="i.qty - i.dispensed <= 0" /></td></tr></tbody></table>
        <div v-if="hasNarcotic" class="field" style="margin-top:8px"><label class="f">Witness name (required for narcotics)</label><input v-model="witness" /></div>
        <div v-if="allergyHit" class="alert err">{{ allergyHit }}<div><label><input type="checkbox" v-model="override" /> I have confirmed with the prescriber – override</label></div></div>
        <div v-if="est" class="card" style="padding:10px;margin-top:10px"><dl class="kv" style="margin:0"><dt>Medicines total</dt><dd>{{ money(est.gross) }}</dd><dt v-if="Number(est.discount) > 0">Discount</dt><dd v-if="Number(est.discount) > 0">{{ money(est.discount) }}</dd><dt v-if="cur.payer.type !== 'Cash'">Payer pays</dt><dd v-if="cur.payer.type !== 'Cash'">{{ money(est.payer_share) }}</dd><dt><b>Patient pays now</b></dt><dd><b>{{ money(est.patient_share) }}</b></dd></dl>
          <div v-if="dueNow > 0.005 && can('billing.cashier')" class="bar" style="margin:8px 0 0"><select v-model="pay.method" style="width:140px"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Online</option></select><input v-model="pay.reference" placeholder="Reference (card slip)" style="width:180px" />
            <template v-if="pay.method === 'Cash' && !sess?.session"><span class="badge amber">No cashier session</span><input type="number" step="any" v-model.number="openCash" placeholder="Opening cash" style="width:120px" /><button class="sm" @click="openSession">Open session</button></template></div>
          <div v-else-if="dueNow <= 0.005" class="small muted" style="margin-top:6px">Nothing to collect — covered by the payer.</div></div>
        <div class="bar" style="margin-top:10px"><button class="p" :disabled="busy || blockers.length > 0 || !lines().length" @click="dispense">{{ dueNow > 0.005 ? `Receive ${money(dueNow)} & dispense` : 'Dispense' }}</button><NuxtLink :to="`/print/rx/${cur.id}`" class="btn">🖨 Prescription</NuxtLink><span class="muted small">Stock is taken from the batch expiring first (FEFO). The charge is added to the visit bill.</span></div>
      </div>
      <div v-else class="card empty">Select a prescription.</div>
    </div>
  </div>
</template>
