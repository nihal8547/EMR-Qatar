<script setup lang="ts">
definePageMeta({ perm: 'billing.cashier' })
const route = useRoute()
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const list = ref<any[]>([]); const q = ref(''); const sel = ref<number | null>(route.query.visit ? Number(route.query.visit) : null)
const d = ref<any>(null); const sess = ref<any>(null); const busy = ref(false)
const disc = ref<number | null>(null); const pay = reactive({ amount: null as number | null, method: 'Cash', reference: '' })
const openCash = ref<number | null>(0); const closeCash = ref<number | null>(null)

async function loadList() { try { list.value = await api('/billing/worklist', { query: { q: q.value } }) } catch (e) { err(e) } }
async function loadSess() { try { sess.value = await api('/billing/session/current') } catch (e) { err(e) } }
async function loadVisit() {
  if (!sel.value) { d.value = null; return }
  try {
    d.value = await api(`/billing/visit/${sel.value}`)
    const inv = d.value.invoice?.invoice
    disc.value = inv && Number(inv.gross) > 0 ? Math.round((Number(inv.discount) / Number(inv.gross)) * 10000) / 100 : 0
    pay.amount = inv ? Number(inv.balance) : null
  } catch (e) { err(e); d.value = null }
}
onMounted(() => { loadList(); loadSess(); loadVisit() })
let t: any; watch(q, () => { clearTimeout(t); t = setTimeout(loadList, 300) })
watch(sel, loadVisit)
const inv = computed(() => d.value?.invoice?.invoice)
const pendTotal = computed(() => (d.value?.pending || []).reduce((s: number, c: any) => s + Number(c.amount), 0))

async function run(fn: () => Promise<any>, msg: string) { busy.value = true; try { const r = await fn(); ok(msg); return r } catch (e) { err(e) } finally { busy.value = false } }
async function makeInvoice() { if (await run(() => api(`/billing/visit/${sel.value}/invoice`, { method: 'POST', body: { discount_pct: disc.value || 0 } }), 'Invoice saved')) { await loadVisit(); loadList() } }
async function takePayment() {
  const r = await run(() => api(`/billing/invoices/${inv.value.id}/pay`, { method: 'POST', body: { amount: pay.amount, method: pay.method, reference: pay.reference } }), 'Payment recorded')
  if (r) { pay.reference = ''; await Promise.all([loadVisit(), loadList(), loadSess()]) }
}
async function cancelInvoice() { const reason = prompt('Reason for cancelling this invoice:'); if (!reason) return; if (await run(() => api(`/billing/invoices/${inv.value.id}/cancel`, { method: 'POST', body: { reason } }), 'Invoice cancelled')) { await loadVisit(); loadList() } }
async function openSession() { if (await run(() => api('/billing/session/open', { method: 'POST', body: { opening_cash: openCash.value || 0 } }), 'Session opened')) { loadSess(); loadVisit() } }
async function closeSession() {
  const r = await run(() => api('/billing/session/close', { method: 'POST', body: { closing_cash: closeCash.value } }), 'Session closed')
  if (r) { alert(`Expected cash: ${money(r.expected)}\nCounted: ${money(r.counted)}\nVariance: ${money(r.variance)}`); loadSess(); closeCash.value = null }
}
</script>
<template>
  <div>
    <div class="bar"><h1>Cashier Desk</h1><div class="sp"></div>
      <template v-if="sess?.session"><span class="badge green">Session open since {{ fdt(sess.session.opened_at) }}</span><span class="small">Expected cash {{ money(sess.expected_cash) }}</span><input type="number" step="any" v-model.number="closeCash" placeholder="Counted cash" style="width:130px" /><button :disabled="busy || closeCash === null" @click="closeSession">Close session</button></template>
      <template v-else><span class="badge amber">No open session (needed for cash)</span><input type="number" step="any" v-model.number="openCash" placeholder="Opening cash" style="width:130px" /><button class="p" :disabled="busy" @click="openSession">Open session</button></template></div>
    <div class="split">
      <div class="card flush" style="max-height:78vh;overflow:auto"><div style="padding:8px"><input v-model="q" placeholder="Search visit, patient, MRN, phone" /></div>
        <div v-for="v in list" :key="v.id" class="list-item" :class="{ on: sel === v.id }" @click="sel = v.id"><div><b>{{ v.visit_no }}</b> <span class="badge" :class="badgeClass(v.status)">{{ v.status }}</span> <span class="badge">{{ v.payer_type }}</span></div>
          <div>{{ v.full_name }} <span class="small muted">{{ v.mrn }}</span></div><div class="small"><span v-if="Number(v.pending_amount) > 0" style="color:var(--warn)">Unbilled {{ money(v.pending_amount) }}</span> <span v-if="v.invoice_no" class="muted">{{ v.invoice_no }}</span> <span v-if="Number(v.balance) > 0" style="color:var(--bad)">Due {{ money(v.balance) }}</span></div></div>
        <div v-if="!list.length" class="empty">No visits found.</div></div>
      <div v-if="d">
        <div class="card"><div class="bar" style="margin:0"><div><h2 style="margin:0">{{ d.patient.full_name }}</h2><span class="muted small">{{ d.patient.mrn }} · {{ d.visit.visit_no }} · {{ d.visit.payer_type }}</span></div><div class="sp"></div>
          <span v-if="d.deposit_balance > 0" class="badge blue">Deposit {{ money(d.deposit_balance) }}</span><span class="badge" :class="badgeClass(d.visit.status)">{{ d.visit.status }}</span></div>
          <div v-if="d.visit.payer_type === 'Insurance' && d.visit.eligibility_status !== 'Eligible'" class="alert warn" style="margin-top:8px">Eligibility: {{ d.visit.eligibility_status }}</div>
          <div v-for="p in d.preauths" :key="p.auth_no" class="small">Pre-auth {{ p.auth_no }} · {{ p.name }} · <span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span></div></div>
        <div v-if="d.pending.length" class="card"><h2>Unbilled charges</h2>
          <table><thead><tr><th>Item</th><th>Source</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody><tr v-for="c in d.pending" :key="c.id"><td>{{ c.description }} <span v-if="!c.covered && d.visit.payer_type === 'Insurance'" class="badge amber">not covered</span></td><td>{{ c.source }}</td><td class="num">{{ c.qty }}</td><td class="num">{{ money(c.unit_price) }}</td><td class="num">{{ money(c.amount) }}</td></tr>
            <tr><td colspan="4" class="right"><b>Total</b></td><td class="num"><b>{{ money(pendTotal) }}</b></td></tr></tbody></table></div>
        <div class="card">
          <div class="bar"><h2 style="margin:0">Invoice <span v-if="inv">{{ inv.invoice_no }}</span></h2><div class="sp"></div><span v-if="inv" class="badge" :class="badgeClass(inv.status)">{{ inv.status }}</span>
            <NuxtLink v-if="inv" :to="`/print/invoice/${inv.id}`" class="btn sm">🖨 Print</NuxtLink></div>
          <div class="bar"><label class="small muted">Discount %</label><input type="number" min="0" max="100" step="any" v-model.number="disc" style="width:90px" :disabled="!can('billing.discount') && !can('billing.approve_discount')" /><span v-if="!can('billing.discount') && !can('billing.approve_discount')" class="small muted">no discount rights</span>
            <button class="p" :disabled="busy || (!d.pending.length && !inv)" @click="makeInvoice">{{ inv ? 'Add new charges / refresh invoice' : 'Create invoice' }}</button>
            <button v-if="inv && can('billing.approve_discount') && Number(inv.paid) === 0 && inv.status !== 'Cancelled'" class="danger" @click="cancelInvoice">Cancel invoice</button></div>
          <template v-if="inv">
            <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody><tr v-for="l in d.invoice.lines" :key="l.id"><td>{{ l.description }}</td><td class="num">{{ l.qty }}</td><td class="num">{{ money(l.amount) }}</td></tr></tbody></table>
            <dl class="kv" style="margin-top:10px"><dt>Gross</dt><dd>{{ money(inv.gross) }}</dd><dt>Discount</dt><dd>{{ money(inv.discount) }}</dd><dt>Net</dt><dd><b>{{ money(inv.net) }}</b></dd>
              <template v-if="inv.payer_type !== 'Cash'"><dt>Payer share</dt><dd>{{ money(inv.payer_share) }} <span class="muted small">({{ d.invoice.invoice.payer_name || d.invoice.invoice.corporate_name }})</span></dd></template><dt>Patient share</dt><dd><b>{{ money(inv.patient_share) }}</b></dd><dt>Paid</dt><dd>{{ money(inv.paid) }}</dd><dt>Balance due</dt><dd><b :style="{ color: Number(inv.balance) > 0 ? 'var(--bad)' : 'var(--ok)' }">{{ money(inv.balance) }}</b></dd></dl>
            <div v-if="d.invoice.payments.length"><h3>Payments</h3><table><tbody><tr v-for="p in d.invoice.payments" :key="p.id"><td>{{ p.receipt_no }}</td><td>{{ fdt(p.paid_at) }}</td><td>{{ p.method }} <span class="muted small">{{ p.reference }}</span></td><td>{{ p.cashier }}</td><td class="num">{{ p.kind === 'Refund' ? '-' : '' }}{{ money(p.amount) }}</td></tr></tbody></table></div>
            <div v-if="Number(inv.balance) > 0 && inv.status !== 'Cancelled'" class="card" style="background:#fafbfc;margin-top:10px"><h3>Take payment</h3>
              <div class="fgrid"><div class="field"><label class="f">Amount</label><input type="number" step="any" v-model.number="pay.amount" /></div><div class="field"><label class="f">Method</label><select v-model="pay.method"><option>Cash</option><option>Card</option><option>Bank transfer</option><option v-if="d.deposit_balance > 0">Deposit</option><option>Online</option></select></div><div class="field"><label class="f">Reference (card slip / transfer)</label><input v-model="pay.reference" /></div></div>
              <button class="ok" :disabled="busy || !pay.amount" @click="takePayment">Receive {{ money(pay.amount) }}</button></div>
          </template>
        </div>
      </div>
      <div v-else class="card empty">Select a visit to bill.</div>
    </div>
  </div>
</template>
