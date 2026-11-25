<script setup lang="ts">
definePageMeta({ perm: 'portal.use', layout: 'portal' })
const { api } = useApi(); const { ok, err } = useUi()
const d = ref<any>(null); const tab = ref('home'); const doctors = ref<any[]>([]); const slots = ref<string[]>([])
const bk = reactive<any>({ doctor_id: null, appt_date: '', appt_time: '', reason: '' }); const busy = ref(false)
async function load() { try { d.value = await api('/portal/summary') } catch (e) { err(e) } }
onMounted(async () => { await load(); try { doctors.value = await api('/portal/doctors') } catch { /* ignore */ } })
async function loadSlots() { slots.value = []; bk.appt_time = ''; if (!bk.doctor_id || !bk.appt_date) return; try { slots.value = (await api('/portal/slots', { query: { doctor_id: bk.doctor_id, date: bk.appt_date } })).slots } catch (e) { err(e) } }
watch(() => [bk.doctor_id, bk.appt_date], loadSlots)
async function book() { busy.value = true; try { const r = await api('/portal/appointments', { method: 'POST', body: bk }); ok(`Booked: ${r.appt_no}`); Object.assign(bk, { appt_time: '', reason: '' }); await load(); loadSlots(); tab.value = 'appts' } catch (e) { err(e); loadSlots() } finally { busy.value = false } }
async function cancel(a: any) { if (!confirm('Cancel this appointment?')) return; try { await api(`/portal/appointments/${a.id}/cancel`, { method: 'POST', body: {} }); ok('Cancelled'); load() } catch (e) { err(e) } }
const upcoming = computed(() => (d.value?.appointments || []).filter((a: any) => ['Booked', 'Confirmed'].includes(a.status) && fdate(a.appt_date) >= todayStr()))
const fc = (f: string) => (f?.startsWith('Critical') || f === 'High' || f === 'Low' ? 'flag-H' : '')
const tabs = [['home', 'Home'], ['appts', 'Appointments'], ['book', 'Book'], ['labs', 'Lab results'], ['rx', 'Prescriptions'], ['bills', 'Bills']]
</script>
<template>
  <div v-if="d" style="max-width:980px;margin:0 auto">
    <div class="tabs"><button v-for="t in tabs" :key="t[0]" :class="{ on: tab === t[0] }" @click="tab = t[0]">{{ t[1] }}</button></div>
    <div v-if="tab === 'home'" class="card"><h1>Hello, {{ d.patient.full_name }}</h1><p class="muted">MRN {{ d.patient.mrn }} · {{ d.patient.phone }}</p>
      <h3>Upcoming appointments</h3><div v-if="!upcoming.length" class="muted">None. Use <b>Book</b> to make one.</div><div v-for="a in upcoming" :key="a.id">{{ fdate(a.appt_date) }} {{ String(a.appt_time).slice(0, 5) }} · {{ a.doctor }}</div>
      <h3 style="margin-top:14px">Outstanding bills</h3><div v-if="!d.invoices.some((i: any) => Number(i.balance) > 0)" class="muted">Nothing due.</div><div v-for="i in d.invoices.filter((x: any) => Number(x.balance) > 0)" :key="i.id">{{ i.invoice_no }} – {{ money(i.balance) }} QAR due</div></div>
    <div v-if="tab === 'appts'" class="card"><h2>My appointments</h2><table><thead><tr><th>Date</th><th>Time</th><th>Doctor</th><th>Department</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="a in d.appointments" :key="a.id"><td>{{ fdate(a.appt_date) }}</td><td>{{ String(a.appt_time).slice(0, 5) }}</td><td>{{ a.doctor }}</td><td>{{ a.department }}</td><td><span class="badge" :class="badgeClass(a.status)">{{ a.status }}</span></td><td><button v-if="['Booked', 'Confirmed'].includes(a.status) && fdate(a.appt_date) >= todayStr()" class="sm danger" @click="cancel(a)">Cancel</button></td></tr></tbody></table></div>
    <div v-if="tab === 'book'" class="card"><h2>Book an appointment</h2>
      <div class="fgrid"><div class="field"><label class="f">Doctor</label><select v-model="bk.doctor_id"><option :value="null">Select…</option><option v-for="x in doctors" :key="x.id" :value="x.id">{{ x.full_name }} – {{ x.department }}</option></select></div><div class="field"><label class="f">Date</label><input type="date" v-model="bk.appt_date" :min="todayStr()" /></div></div>
      <label class="f">Time</label><div class="pill-row"><button v-for="s in slots" :key="s" class="sm" :class="{ p: bk.appt_time === s }" @click="bk.appt_time = s">{{ s }}</button></div><div v-if="bk.doctor_id && bk.appt_date && !slots.length" class="muted small">No free slots on this day.</div>
      <div class="field" style="margin-top:10px"><label class="f">Reason</label><input v-model="bk.reason" /></div><button class="p" :disabled="busy || !bk.appt_time" @click="book">Confirm booking</button></div>
    <div v-if="tab === 'labs'" class="card"><h2>Lab results</h2><div class="muted small">Only results that the laboratory has validated appear here. Please discuss results with your doctor.</div><table><thead><tr><th>Date</th><th>Test</th><th>Result</th><th>Normal range</th></tr></thead><tbody><tr v-for="(l, i) in d.labs" :key="i"><td>{{ fdate(l.ordered_at) }}</td><td>{{ l.test }}</td><td :class="fc(l.flag)">{{ l.result_value ?? l.result_text }} {{ l.unit }} <span v-if="l.flag && l.flag !== 'Normal'">({{ l.flag }})</span></td><td class="muted">{{ l.ref_low ?? '' }} – {{ l.ref_high ?? '' }}</td></tr></tbody></table><div v-if="!d.labs.length" class="muted">No results yet.</div></div>
    <div v-if="tab === 'rx'" class="card"><h2>Prescriptions</h2><div v-for="r in d.prescriptions" :key="r.rx_no" style="margin-bottom:10px"><b>{{ r.rx_no }}</b> · {{ fdate(r.date) }} <span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span><div v-for="(i, k) in r.items" :key="k" class="small">• {{ i.drug }} – {{ i.dose }} {{ i.frequency }} {{ i.days ? 'for ' + i.days + ' days' : '' }}</div></div><div v-if="!d.prescriptions.length" class="muted">None.</div></div>
    <div v-if="tab === 'bills'" class="card"><h2>Bills</h2><table><thead><tr><th>Invoice</th><th>Date</th><th class="num">Your share</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody><tr v-for="i in d.invoices" :key="i.id"><td>{{ i.invoice_no }}</td><td>{{ fdate(i.invoice_date) }}</td><td class="num">{{ money(i.patient_share) }}</td><td class="num">{{ money(i.paid) }}</td><td class="num">{{ money(i.balance) }}</td><td><span class="badge" :class="badgeClass(i.status)">{{ i.status }}</span></td></tr></tbody></table><div class="muted small" style="margin-top:8px">Pay at the reception desk. Online payment is not enabled in this build.</div></div>
  </div>
  <div v-else class="empty">Loading…</div>
</template>
