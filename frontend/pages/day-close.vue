<script setup lang="ts">
definePageMeta({ perm: 'billing.day_close' })
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const date = ref(todayStr()); const s = ref<any>(null); const busy = ref(false)
const counted = ref<number | null>(null); const notes = ref('')
async function load() { try { s.value = await api('/billing/day-close/summary', { query: { date: date.value } }) } catch (e) { err(e) } }
onMounted(load); watch(date, load)
const isToday = computed(() => date.value === todayStr())
const closed = computed(() => s.value?.closed?.status === 'Closed')
async function closeDay() {
  if (!confirm('Close today? No payments or refunds can be posted until a manager reopens the day.')) return
  busy.value = true
  try { await api('/billing/day-close', { method: 'POST', body: { counted_cash: counted.value, notes: notes.value } }); ok('Day closed'); await load() } catch (e) { err(e) } finally { busy.value = false }
}
async function reopen() {
  const reason = prompt('Reason for reopening today:'); if (!reason) return
  busy.value = true
  try { await api('/billing/day-close/reopen', { method: 'POST', body: { reason } }); ok('Day reopened'); await load() } catch (e) { err(e) } finally { busy.value = false }
}
function printNow() { window.print() }
</script>
<template>
  <div>
    <div class="bar no-print"><h1>Day Close <span class="muted small">· end-of-day closing</span></h1><div class="sp"></div>
      <input type="date" v-model="date" style="width:160px" /><button @click="printNow">🖨 Print</button></div>
    <div v-if="s">
      <div class="card"><div class="bar" style="margin:0"><h2 style="margin:0">Summary for {{ s.date }}</h2><div class="sp"></div>
        <span v-if="closed" class="badge green">Closed by {{ s.closed.closed_by_name || 'cashier' }}</span><span v-else-if="s.closed" class="badge amber">Reopened</span><span v-else class="badge">Open</span></div>
        <div class="paysum" style="margin-top:10px">
          <div><span class="k">Cash</span><b>{{ money(s.cash) }}</b></div><div><span class="k">Card</span><b>{{ money(s.card) }}</b></div>
          <div><span class="k">Bank transfer</span><b>{{ money(s.bank) }}</b></div><div><span class="k">Online / deposit</span><b>{{ money(s.online) }}</b></div>
          <div><span class="k">Refunds / voids</span><b>{{ money(s.refunds) }}</b></div><div><span class="k">Net collected</span><b>{{ money(s.net) }}</b></div></div>
        <p class="small muted">{{ s.payments_count }} receipts · {{ s.invoices_count }} invoices ({{ money(s.invoices_total) }}) · Net already excludes refunds.</p></div>
      <div class="card"><h2>Cashier sessions</h2>
        <table v-if="s.sessions.length"><thead><tr><th>Cashier</th><th>Opened</th><th>Closed</th><th class="num">Opening</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Variance</th><th>Status</th></tr></thead>
          <tbody><tr v-for="x in s.sessions" :key="x.id"><td>{{ x.cashier }}</td><td>{{ fdt(x.opened_at) }}</td><td>{{ x.closed_at ? fdt(x.closed_at) : '' }}</td><td class="num">{{ money(x.opening_cash) }}</td><td class="num">{{ x.expected_cash == null ? '' : money(x.expected_cash) }}</td><td class="num">{{ x.closing_cash == null ? '' : money(x.closing_cash) }}</td><td class="num">{{ x.variance == null ? '' : money(x.variance) }}</td><td><span class="badge" :class="x.status === 'Open' ? 'amber' : 'green'">{{ x.status }}</span></td></tr></tbody></table>
        <div v-else class="none-txt">No cashier sessions.</div></div>
      <div class="card"><h2>Attention</h2>
        <div v-if="s.open_sessions" class="alert warn">{{ s.open_sessions }} cashier session(s) still open — close them before the day.</div>
        <div v-if="s.pending_charges" class="alert warn">{{ s.pending_charges }} unbilled charge(s) are waiting (they carry over).</div>
        <div v-if="s.unpaid_invoices" class="alert warn">{{ s.unpaid_invoices }} invoice(s) with patient balance due: {{ money(s.unpaid_amount) }} (carries over).</div>
        <div v-if="!s.open_sessions && !s.pending_charges && !s.unpaid_invoices" class="alert ok">Nothing pending.</div></div>
      <div v-if="s.closed" class="card"><h2>Closing record</h2>
        <p class="small">Closed at {{ fdt(s.closed.closed_at) }} <span v-if="s.closed.counted_cash != null">· counted cash {{ money(s.closed.counted_cash) }} (system cash {{ money(s.cash) }})</span></p>
        <p v-if="s.closed.notes" class="small">Notes: {{ s.closed.notes }}</p><p v-if="s.closed.reopen_reason" class="small">Reopened: {{ s.closed.reopen_reason }}</p></div>
      <div v-if="isToday" class="card no-print"><h2>{{ closed ? 'Day is closed' : 'Close the day' }}</h2>
        <template v-if="!closed">
          <div class="fgrid"><div class="field"><label class="f">Total cash counted (optional)</label><input type="number" step="any" v-model.number="counted" /></div>
            <div class="field"><label class="f">Notes</label><input v-model="notes" /></div></div>
          <button class="p" :disabled="busy || s.open_sessions > 0" @click="closeDay">Close day</button></template>
        <template v-else><p class="small muted">Payments, refunds and new cashier sessions are blocked.</p>
          <button v-if="can('billing.day_reopen')" class="danger" :disabled="busy" @click="reopen">Reopen day</button></template></div>
    </div>
  </div>
</template>
