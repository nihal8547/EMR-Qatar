<script setup lang="ts">
const props = defineProps<{ front?: boolean }>()
const route = useRoute()
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const list = ref<any[]>([]); const q = ref(''); const sel = ref<number | null>(route.query.visit ? Number(route.query.visit) : null)
const d = ref<any>(null); const sess = ref<any>(null); const busy = ref(false)
const disc = ref<number | null>(null); const pay = reactive({ amount: null as number | null, method: 'Cash', reference: '' })
const openCash = ref<number | null>(0); const closeCash = ref<number | null>(null)

const chip = ref('all')
const CHIPS: [string, string][] = [['all', 'All'], ['due', 'Has dues'], ['Lab', 'Lab tests'], ['Radiology', 'X-ray / Imaging'], ['Consultation', 'Consultation'], ['Procedure', 'Procedures'], ['Pharmacy', 'Pharmacy']]
const shown = computed(() => list.value.filter((v: any) => chip.value === 'all' ? true : chip.value === 'due' ? (Number(v.pending_amount) > 0 || Number(v.balance) > 0) : String(v.sources || '').split(',').includes(chip.value)))
const bySource = computed(() => { const o: Record<string, number> = {}; for (const c of d.value?.pending || []) o[c.source] = (o[c.source] || 0) + Number(c.amount); return o })
const REMOVABLE = ['Lab', 'Radiology', 'Procedure', 'Manual']
async function removeItem(c: any) {
  const reason = prompt(`Remove "${c.description}" from this bill?\nThe ${c.source === 'Manual' ? 'charge' : 'test / order'} is cancelled too, if not started.\n\nReason (e.g. patient declined):`); if (!reason) return
  if (await run(() => api(`/billing/charges/${c.id}/remove`, { method: 'POST', body: { reason } }), 'Item removed')) { await Promise.all([loadVisit(), loadList()]) }
}
const items = computed(() => [
  ...(d.value?.invoice?.lines || []).map((l: any) => ({ ...l, billed: true })),
  ...(d.value?.pending || []).map((c: any) => ({ ...c, billed: false })),
])
const canRemove = (c: any) => REMOVABLE.includes(c.source) && !(c.billed && Number(inv.value?.paid) > 0.005) && inv.value?.status !== 'Cancelled'
async function quickCollect() {
  busy.value = true
  try {
    const b: any = await api(`/billing/visit/${sel.value}/invoice`, { method: 'POST', body: discTouched.value ? { discount_pct: disc.value || 0 } : {} })
    const due = Number(b.invoice.balance)
    if (due > 0) await api(`/billing/invoices/${b.invoice.id}/pay`, { method: 'POST', body: { amount: due, method: pay.method, reference: pay.reference } })
    ok(due > 0 ? `Received ${money(due)}` : 'Invoice saved — nothing to pay'); pay.reference = ''
    await Promise.all([loadVisit(), loadList(), loadSess()])
  } catch (e) { err(e) } finally { busy.value = false }
}
const discTouched = ref(false)
async function decideCheckin(approve: boolean) { try { await api(`/visits/${sel.value}/discount/decision`, { method: 'POST', body: { approve } }); ok(approve ? 'Discount approved' : 'Discount rejected'); await loadVisit() } catch (e) { err(e) } }
async function loadList() { try { list.value = await api('/billing/worklist', { query: { q: q.value } }) } catch (e) { err(e) } }
async function loadSess() { try { sess.value = await api('/billing/session/current') } catch (e) { err(e) } }
async function loadVisit() {
  if (!sel.value) { d.value = null; return }
  try {
    d.value = await api(`/billing/visit/${sel.value}`)
    const inv = d.value.invoice?.invoice
    const ci = d.value.checkin_discount
    disc.value = inv && Number(inv.gross) > 0 ? Math.round((Number(inv.discount) / Number(inv.gross)) * 10000) / 100 : (ci && ci.status === 'Applied' ? ci.pct_now : 0)
    discTouched.value = false
    pay.amount = inv ? Number(inv.balance) : null
  } catch (e) { err(e); d.value = null }
}
onMounted(() => { loadList(); loadSess(); loadVisit() })
let t: any; watch(q, () => { clearTimeout(t); t = setTimeout(loadList, 300) })
watch(sel, loadVisit)
const inv = computed(() => d.value?.invoice?.invoice)
const pendTotal = computed(() => (d.value?.pending || []).reduce((s: number, c: any) => s + Number(c.amount), 0))

async function run(fn: () => Promise<any>, msg: string) { busy.value = true; try { const r = await fn(); ok(msg); return r } catch (e) { err(e) } finally { busy.value = false } }
async function makeInvoice() { if (await run(() => api(`/billing/visit/${sel.value}/invoice`, { method: 'POST', body: discTouched.value ? { discount_pct: disc.value || 0 } : {} }), 'Invoice saved')) { await loadVisit(); loadList() } }
async function takePayment() {
  const r = await run(() => api(`/billing/invoices/${inv.value.id}/pay`, { method: 'POST', body: { amount: pay.amount, method: pay.method, reference: pay.reference } }), 'Payment recorded')
  if (r) { pay.reference = ''; await Promise.all([loadVisit(), loadList(), loadSess()]) }
}
async function requestCancel() {
  const reason = prompt('Reason for cancelling this bill (required):'); if (!reason) return
  const voidIt = confirm('Also void the charges (they will NOT be billed again)?\nOK = void charges · Cancel = keep charges to be re-billed')
  if (await run(() => api('/r/bill_cancel_requests', { method: 'POST', body: { invoice_id: inv.value.id, reason, void_charges: voidIt } }), 'Cancel request sent for approval')) await loadVisit()
}
async function decideCancel(approve: boolean) {
  const cr = d.value.invoice.cancel_request; let body: any = {}
  if (!approve) { const reason = prompt('Reason for rejecting:'); if (!reason) return; body = { reason } }
  else if (!confirm(`Approve ${cr.request_no}? The bill will be cancelled${Number(inv.value.paid) > 0 ? ' and ' + money(inv.value.paid) + ' refunded in cash' : ''}.`)) return
  const r = await run(() => api(`/r/bill_cancel_requests/${cr.id}/action/${approve ? 'approve' : 'reject'}`, { method: 'POST', body }), approve ? 'Bill cancelled' : 'Request rejected')
  if (r) { await Promise.all([loadVisit(), loadList(), loadSess()]) }
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
    <div class="bar"><h1>{{ front ? 'Patient Payments' : 'Cashier Desk' }}<span v-if="front" class="muted small"> · bills, lab tests, X-rays, procedures</span></h1><div class="sp"></div>
      <template v-if="sess?.session"><span class="badge green">Session open since {{ fdt(sess.session.opened_at) }}</span><span class="small">Expected cash {{ money(sess.expected_cash) }}</span><input type="number" step="any" v-model.number="closeCash" placeholder="Counted cash" style="width:130px" /><button :disabled="busy || closeCash === null" @click="closeSession">Close session</button></template>
      <template v-else><span class="badge amber">No open session (needed for cash)</span><input type="number" step="any" v-model.number="openCash" placeholder="Opening cash" style="width:130px" /><button class="p" :disabled="busy" @click="openSession">Open session</button></template></div>
    <div class="split">
      <div class="card flush" style="max-height:78vh;overflow:auto"><div style="padding:8px"><input v-model="q" placeholder="Search visit, patient, MRN, phone" /></div>
        <div v-if="front" class="bar" style="padding:0 8px;gap:4px;flex-wrap:wrap"><button v-for="[k, l] in CHIPS" :key="k" class="sm" :class="{ p: chip === k }" @click="chip = k">{{ l }}</button></div>
        <div v-for="v in shown" :key="v.id" class="list-item" :class="{ on: sel === v.id }" @click="sel = v.id"><div><b>{{ v.visit_no }}</b> <span class="badge" :class="badgeClass(v.status)">{{ v.status }}</span> <span class="badge">{{ v.payer_type }}</span></div>
          <div>{{ v.full_name }} <span class="small muted">{{ v.mrn }}</span></div><div class="small"><span v-if="Number(v.pending_amount) > 0" style="color:var(--warn)">Unbilled {{ money(v.pending_amount) }}</span> <span v-if="v.invoice_no" class="muted">{{ v.invoice_no }}</span> <span v-if="front && v.sources" class="muted">· {{ v.sources.split(',').join(' / ') }}</span> <span v-if="Number(v.balance) > 0" style="color:var(--bad)">Due {{ money(v.balance) }}</span></div></div>
        <div v-if="!shown.length" class="empty">No visits found.</div></div>
      <div v-if="d">
        <div class="card"><div class="bar" style="margin:0"><div><h2 style="margin:0">{{ d.patient.full_name }}</h2><span class="muted small">{{ d.patient.mrn }} · {{ d.visit.visit_no }} · {{ d.visit.payer_type }}</span></div><div class="sp"></div>
          <span v-if="d.deposit_balance > 0" class="badge blue">Deposit {{ money(d.deposit_balance) }}</span><span class="badge" :class="badgeClass(d.visit.status)">{{ d.visit.status }}</span></div>
          <div v-if="d.visit.payer_type === 'Insurance' && d.visit.eligibility_status !== 'Eligible'" class="alert warn" style="margin-top:8px">Eligibility: {{ d.visit.eligibility_status }}</div>
          <div v-for="p in d.preauths" :key="p.auth_no" class="small">Pre-auth {{ p.auth_no }} · {{ p.name }} · <span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span></div></div>
        <div v-if="d.checkin_discount" class="alert" :class="d.checkin_discount.status === 'Applied' ? 'ok' : 'warn'">
          Check-in discount: <b>{{ d.checkin_discount.type === 'percent' ? d.checkin_discount.value + '%' : 'QAR ' + d.checkin_discount.value }}</b> — {{ d.checkin_discount.reason }}
          <span class="badge" :class="d.checkin_discount.status === 'Applied' ? 'green' : d.checkin_discount.status === 'Rejected' ? 'red' : 'amber'">{{ d.checkin_discount.status }}</span>
          <span v-if="d.checkin_discount.status === 'Applied' && !inv" class="muted small"> · applied automatically when the invoice is created</span>
          <span v-if="d.checkin_discount.status === 'Pending approval' && can('billing.approve_discount')"> <button class="sm ok" @click="decideCheckin(true)">Approve</button> <button class="sm danger" @click="decideCheckin(false)">Reject</button></span>
          <span v-else-if="d.checkin_discount.status === 'Pending approval'" class="small"> · invoice stays at full price until a manager approves.</span>
        </div>
        <div v-if="d.invoice?.cancel_request" class="alert warn">
          <b>Bill cancel requested</b> ({{ d.invoice.cancel_request.request_no }}) by {{ d.invoice.cancel_request.requested_by }} — {{ d.invoice.cancel_request.reason }}<span v-if="d.invoice.cancel_request.void_charges"> · charges will be voided</span>
          <span v-if="can('bill_cancel_requests.approve')"> <button class="sm ok" :disabled="busy" @click="decideCancel(true)">Approve</button> <button class="sm danger" :disabled="busy" @click="decideCancel(false)">Reject</button></span>
          <span v-else class="small"> · waiting for a cashier / manager to approve.</span></div>
        <div class="card">
          <div class="bar"><h2 style="margin:0">Bill items <span class="cnt-pill">{{ items.length }}</span></h2><div class="sp"></div>
            <span v-if="inv" class="muted small">Invoice {{ inv.invoice_no }}</span><span v-if="inv" class="badge" :class="badgeClass(inv.status)">{{ inv.status }}</span>
            <NuxtLink v-if="inv" :to="`/print/invoice/${inv.id}`" class="btn sm">🖨 Print</NuxtLink></div>
          <div v-if="!items.length" class="none-txt">No charges for this visit yet.</div>
          <table v-else class="bill"><thead><tr><th style="width:34px">#</th><th>Item</th><th>Source</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th><th style="width:34px" class="no-print"></th></tr></thead>
            <tbody><tr v-for="(c, i) in items" :key="(c.billed ? 'i' : 'p') + c.id"><td class="muted">{{ i + 1 }}</td>
              <td>{{ c.description }} <span v-if="!c.billed" class="badge amber">unbilled</span><span v-if="c.covered === false && d.visit.payer_type === 'Insurance'" class="badge amber">not covered</span></td>
              <td class="muted">{{ c.source }}</td><td class="num">{{ c.qty }}</td><td class="num">{{ money(c.unit_price) }}</td><td class="num">{{ money(c.amount) }}</td>
              <td class="no-print"><button v-if="canRemove(c)" class="sm danger rm" :disabled="busy" title="Remove this item (patient declined / not needed)" @click="removeItem(c)">✕</button></td></tr></tbody></table>
          <div v-if="items.length" class="bill-foot">
            <div class="bill-ctl">
              <div class="bar" style="margin:0"><label class="small muted">Discount %</label><input type="number" min="0" max="100" step="any" v-model.number="disc" style="width:90px" @input="discTouched = true" :disabled="!can('billing.discount') && !can('billing.approve_discount')" /><span v-if="!can('billing.discount') && !can('billing.approve_discount')" class="small muted">no discount rights</span></div>
              <div class="bar" style="margin:8px 0 0"><button class="p" :disabled="busy || (!d.pending.length && !inv)" @click="makeInvoice">{{ inv ? 'Add new charges / refresh invoice' : 'Create invoice' }}</button>
                <button v-if="inv && inv.status !== 'Cancelled' && !d.invoice.cancel_request && can('bill_cancel_requests.create') && !can('billing.approve_discount')" :disabled="busy" @click="requestCancel">Request bill cancel</button>
                <button v-if="inv && can('billing.approve_discount') && Number(inv.paid) === 0 && inv.status !== 'Cancelled'" class="danger" @click="cancelInvoice">Cancel invoice</button></div>
            </div>
            <dl class="totals">
              <template v-if="inv"><dt>Gross</dt><dd>{{ money(inv.gross) }}</dd><dt>Discount</dt><dd>− {{ money(inv.discount) }}</dd><dt class="strong">Net total</dt><dd class="strong">{{ money(inv.net) }}</dd>
                <template v-if="inv.payer_type !== 'Cash'"><dt>Insurer / company</dt><dd>{{ money(inv.payer_share) }}</dd></template>
                <dt class="strong">Patient share</dt><dd class="strong">{{ money(inv.patient_share) }}</dd></template>
              <template v-if="d.pending.length"><dt>Unbilled items</dt><dd>{{ money(pendTotal) }}</dd></template>
            </dl>
          </div>
        </div>
        <div class="card pay-card">
          <h2>Payment</h2>
          <div v-if="d.invoice?.payments.length" style="margin-bottom:10px"><table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Cashier</th><th class="num">Amount</th></tr></thead><tbody><tr v-for="p in d.invoice.payments" :key="p.id"><td>{{ p.receipt_no }}</td><td>{{ fdt(p.paid_at) }}</td><td>{{ p.method }} <span class="muted small">{{ p.reference }}</span></td><td>{{ p.cashier }}</td><td class="num">{{ p.kind === 'Refund' ? '-' : '' }}{{ money(p.amount) }}</td></tr></tbody></table></div>
          <div v-if="inv" class="paysum"><div><span class="k">Patient share</span><b>{{ money(inv.patient_share) }}</b></div><div><span class="k">Paid</span><b>{{ money(inv.paid) }}</b></div><div><span class="k">Balance due</span><b :style="{ color: Number(inv.balance) > 0 ? 'var(--bad)' : 'var(--ok)' }">{{ money(inv.balance) }}</b></div></div>
          <template v-if="d.pending.length || (inv && Number(inv.balance) > 0 && inv.status !== 'Cancelled')">
            <div class="fgrid" style="margin-top:12px"><div class="field"><label class="f">Method</label><select v-model="pay.method"><option>Cash</option><option>Card</option><option>Bank transfer</option><option v-if="d.deposit_balance > 0">Deposit</option><option>Online</option></select></div>
              <div class="field"><label class="f">Reference (card slip / transfer)</label><input v-model="pay.reference" /></div>
              <div v-if="!d.pending.length" class="field"><label class="f">Amount</label><input type="number" step="any" v-model.number="pay.amount" /></div></div>
            <div class="bar" style="margin-top:6px">
              <button v-if="d.pending.length" class="ok" :disabled="busy" @click="quickCollect">Create invoice &amp; receive payment</button>
              <button v-else class="ok" :disabled="busy || !pay.amount" @click="takePayment">Receive {{ money(pay.amount) }}</button>
              <span v-if="d.pending.length" class="small muted">The patient's share (after discount / insurance) is collected in full.</span></div>
          </template>
          <div v-else-if="inv && inv.status === 'Paid'" class="alert ok" style="margin:10px 0 0">Fully paid.</div>
          <div v-else-if="!inv" class="none-txt">Nothing to collect.</div>
        </div>
      </div>
      <div v-else class="card empty">Select a visit to bill.</div>
    </div>
  </div>
</template>
