<script setup lang="ts">
definePageMeta({ perm: 'claims.work' })
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const s = ref<any>(null); const claims = ref<any[]>([]); const tab = ref('ready'); const status = ref(''); const picked = ref<number[]>([]); const busy = ref(false)
const scrubOut = ref<Record<number, string[]>>({}); const rejCodes = ref<any[]>([])
async function load() { try { s.value = await api('/claims/summary'); claims.value = await api('/claims/list', { query: { status: status.value } }) } catch (e) { err(e) } }
onMounted(async () => { load(); try { rejCodes.value = (await api('/r/rejection_codes', { query: { limit: 100 } })).rows } catch { /* optional */ } })
watch(status, load)
async function run(fn: () => Promise<any>, msg: string) { busy.value = true; try { const r = await fn(); ok(msg); await load(); return r } catch (e) { err(e) } finally { busy.value = false } }
const create = (id: number) => run(() => api(`/claims/from-invoice/${id}`, { method: 'POST', body: {} }), 'Claim created')
async function scrub(c: any) { const r = await run(() => api(`/claims/${c.id}/scrub`, { method: 'POST', body: {} }), 'Checked'); if (r) scrubOut.value[c.id] = r.errors }
async function scrubAll() { for (const c of claims.value.filter((x) => ['Draft', 'Scrub Failed'].includes(x.status))) await scrub(c) }
const submit = () => run(async () => { const r = await api('/claims/submit', { method: 'POST', body: { claim_ids: picked.value } }); picked.value = []; return r }, 'Submitted (simulation mode – nothing was sent to a payer)')
const toggle = (id: number) => { const i = picked.value.indexOf(id); if (i >= 0) picked.value.splice(i, 1); else picked.value.push(id) }
const decide = (c: any, status: string) => {
  let body: any = { status }
  if (status === 'Rejected') { const reason = prompt('Rejection reason from the payer:'); if (!reason) return; const code = rejCodes.value.find((r) => reason.toUpperCase().startsWith(r.code)); body = { status, reason, code_id: code?.id } }
  run(() => api(`/claims/${c.id}/decision`, { method: 'POST', body }), `Marked ${status}`)
}
const appeal = (c: any) => run(() => api(`/claims/${c.id}/appeal`, { method: 'POST', body: { note: prompt('Appeal note') || '' } }), 'Appeal recorded')
const resubmit = (c: any) => run(() => api(`/claims/${c.id}/resubmit`, { method: 'POST', body: {} }), 'Back to Draft for correction')
const by = (st: string) => (s.value?.by_status || []).find((x: any) => x.status === st)
const ready = computed(() => claims.value.filter((c) => c.status === 'Ready'))
</script>
<template>
  <div>
    <div class="bar"><h1>Claims Workbench</h1><div class="sp"></div><button @click="load">↻</button></div>
    <div v-if="s" class="cards"><div class="kpi"><div class="v">{{ s.invoices_without_claim.length }}</div><div class="l">Invoices without a claim</div></div><div class="kpi"><div class="v">{{ s.pending_preauth }}</div><div class="l">Pre-auths awaiting decision</div></div>
      <div class="kpi"><div class="v">{{ s.open_rejections }}</div><div class="l">Open rejections</div></div>
      <div v-for="st in ['Draft', 'Scrub Failed', 'Ready', 'Submitted', 'Accepted', 'Paid', 'Rejected']" :key="st" class="kpi"><div class="v">{{ by(st)?.n || 0 }}</div><div class="l">{{ st }} · {{ money(by(st)?.amount || 0) }}</div></div></div>
    <div class="alert info small">Insurer submission is a <b>simulation</b> in this build: claims are batched and logged, but nothing is transmitted. Record each payer decision by hand until a payer adapter is built.</div>
    <div class="tabs"><button :class="{ on: tab === 'ready' }" @click="tab = 'ready'">1 · Invoices to claim ({{ s?.invoices_without_claim.length || 0 }})</button><button :class="{ on: tab === 'claims' }" @click="tab = 'claims'">2 · Claims</button><button :class="{ on: tab === 'submit' }" @click="tab = 'submit'">3 · Submit ({{ ready.length }} ready)</button></div>
    <div v-if="tab === 'ready'" class="card flush"><table><thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Payer</th><th class="num">Payer share</th><th></th></tr></thead>
      <tbody><tr v-for="i in s?.invoices_without_claim" :key="i.id"><td>{{ i.invoice_no }}</td><td>{{ fdate(i.invoice_date) }}</td><td>{{ i.full_name }} <span class="muted small">{{ i.mrn }}</span></td><td>{{ i.payer }}</td><td class="num">{{ money(i.payer_share) }}</td><td><button class="sm p" :disabled="busy" @click="create(i.id)">Create claim</button></td></tr></tbody></table>
      <div v-if="!s?.invoices_without_claim.length" class="empty">All insurance invoices already have claims.</div></div>
    <div v-if="tab === 'claims'">
      <div class="bar"><select v-model="status" style="width:180px"><option value="">All statuses</option><option v-for="x in ['Draft','Scrub Failed','Ready','Submitted','Accepted','Partially Paid','Paid','Rejected','Appealed']" :key="x">{{ x }}</option></select><button @click="scrubAll">Check all drafts</button></div>
      <div class="card flush"><table><thead><tr><th>Claim</th><th>Patient</th><th>Payer</th><th class="num">Amount</th><th class="num">Paid</th><th>Status</th><th></th></tr></thead>
        <tbody><template v-for="c in claims" :key="c.id"><tr><td>{{ c.claim_no }}<div class="small muted">{{ c.invoice_no }}</div></td><td>{{ c.full_name }}<div class="small muted">{{ c.mrn }}</div></td><td>{{ c.payer }}</td><td class="num">{{ money(c.amount) }}</td><td class="num">{{ money(c.paid_amount) }}</td><td><span class="badge" :class="badgeClass(c.status)">{{ c.status }}</span></td>
          <td class="nowrap"><NuxtLink :to="`/r/claims/${c.id}`" class="btn sm">Open</NuxtLink> <button v-if="['Draft', 'Scrub Failed', 'Ready'].includes(c.status)" class="sm" :disabled="busy" @click="scrub(c)">Check</button>
            <template v-if="['Submitted', 'Appealed'].includes(c.status)"><button class="sm ok" @click="decide(c, 'Accepted')">Accepted</button> <button class="sm danger" @click="decide(c, 'Rejected')">Rejected</button></template>
            <template v-if="c.status === 'Rejected'"><button class="sm" @click="appeal(c)">Appeal</button> <button class="sm" @click="resubmit(c)">Correct &amp; resubmit</button></template></td></tr>
          <tr v-if="(c.scrub_errors && c.status === 'Scrub Failed') || scrubOut[c.id]?.length"><td colspan="7" style="background:#fff7e0"><b>Fix before submitting:</b><div v-for="e in (scrubOut[c.id] || String(c.scrub_errors).split('\n'))" :key="e" class="small">{{ String(e).replace(/^- /, '• ') }}</div></td></tr>
          <tr v-if="c.rejections && c.status === 'Rejected'"><td colspan="7" style="background:#fdecea"><span v-for="r in c.rejections" :key="r.id" class="small">{{ r.code }} {{ r.reason }} ({{ r.status }}) </span></td></tr></template></tbody></table>
        <div v-if="!claims.length" class="empty">No claims.</div></div>
    </div>
    <div v-if="tab === 'submit'" class="card"><p>Only claims that passed the pre-submission check (status <b>Ready</b>) can be submitted. One batch is created per payer.</p>
      <table><thead><tr><th></th><th>Claim</th><th>Patient</th><th>Payer</th><th class="num">Amount</th></tr></thead><tbody><tr v-for="c in ready" :key="c.id"><td><input type="checkbox" :checked="picked.includes(c.id)" @change="toggle(c.id)" /></td><td>{{ c.claim_no }}</td><td>{{ c.full_name }}</td><td>{{ c.payer }}</td><td class="num">{{ money(c.amount) }}</td></tr></tbody></table>
      <div v-if="!ready.length" class="muted">Nothing ready. Create claims and run the check first.</div>
      <div class="bar" style="margin-top:10px"><button class="p" :disabled="busy || !picked.length || !can('claims.submit')" @click="submit">Submit {{ picked.length }} claim(s)</button><button @click="picked = ready.map((c) => c.id)">Select all</button><span v-if="!can('claims.submit')" class="muted small">Your role cannot submit claims.</span></div></div>
  </div>
</template>
