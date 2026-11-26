<script setup lang="ts">
definePageMeta({ perm: 'patients.360' })
const route = useRoute()
const { api } = useApi(); const { err } = useUi(); const { can } = useAuth()
const d = ref<any>(null)
const reason = ref(''); const needReason = ref(false)
async function load(bg?: string) {
  try { d.value = await api(`/patients/${route.params.id}/360`, { query: { breakglass: bg } }); needReason.value = false } catch (e: any) { if (e.extra?.breakglass) needReason.value = true; else err(e) }
}
const tab = ref<'overview' | 'history'>('overview')
const h = ref<any>(null); const hBusy = ref(false); const open = reactive<Record<number, boolean>>({})
async function loadHist() {
  if (h.value || hBusy.value) return
  hBusy.value = true
  try { h.value = await api(`/patients/${route.params.id}/history`, { query: { breakglass: reason.value.trim() || undefined } }); (h.value.visits[0] ? (open[h.value.visits[0].id] = true) : 0) } catch (e) { err(e) } finally { hBusy.value = false }
}
watch(tab, (t) => { if (t === 'history') loadHist() })
const allOpen = (v: boolean) => (h.value?.visits || []).forEach((x: any) => (open[x.id] = v))
const flagCls = (f: string) => (/Critical/.test(f || '') ? 'red' : f && f !== 'Normal' ? 'amber' : '')
const bp = (v: any) => (v.bp_systolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '')
onMounted(() => load())
</script>
<template>
  <div>
    <div v-if="needReason" class="card" style="max-width:600px">
      <h1>Restricted record</h1>
      <p>You have no treatment relationship with this patient. If this is an emergency you may open the record. <b>This access is logged and reviewed.</b></p>
      <textarea v-model="reason" placeholder="Reason for emergency access (at least 8 characters)"></textarea>
      <div class="bar" style="margin-top:8px"><button class="danger" :disabled="reason.trim().length < 8" @click="load(reason.trim())">Break glass and open</button><button @click="navigateTo('/')">Cancel</button></div>
    </div>
    <div v-else-if="d">
      <div class="phead"><div class="pav">{{ (d.patient.full_name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() }}</div>
        <div><h1 style="margin:0">{{ d.patient.full_name }}</h1><div class="pchips"><span class="badge">{{ d.patient.mrn }}</span><span class="badge grey">QID {{ d.patient.qid || '–' }}</span><span class="badge grey">{{ d.patient.age }}y · {{ d.patient.gender }}</span><span v-if="d.patient.phone" class="badge grey">{{ d.patient.phone }}</span></div></div>
        <div class="sp"></div><NuxtLink :to="`/r/patients/${d.patient.id}`" class="btn">Demographics</NuxtLink></div>
      <div class="tabs no-print"><button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button><button :class="{ on: tab === 'history' }" @click="tab = 'history'">Full history</button></div>
      <div class="alert" :class="d.allergies.length ? 'err' : 'ok'"><b>Allergies:</b> <template v-if="d.allergies.length"><span v-for="a in d.allergies" :key="a.allergen" class="badge red" style="margin-right:4px">{{ a.allergen }} {{ a.reaction ? '– ' + a.reaction : '' }}</span></template><template v-else>none recorded</template></div>
      <div v-if="tab === 'history'">
        <div v-if="hBusy || !h" class="empty loading">Loading history…</div>
        <template v-else>
          <div class="bar no-print"><div class="muted small">{{ h.visits.length }} visit(s) on record</div><div class="sp"></div>
            <span v-if="h.totals" class="badge grey">Billed {{ money(h.totals.billed) }}</span><span v-if="h.totals" class="badge ok">Paid {{ money(h.totals.paid) }}</span><span v-if="h.totals && h.totals.due > 0" class="badge red">Due {{ money(h.totals.due) }}</span>
            <button class="sm" @click="allOpen(true)">Expand all</button><button class="sm" @click="allOpen(false)">Collapse all</button><button class="sm" @click="allOpen(true); $nextTick(() => window.print())">🖨 Print history</button></div>
          <div v-if="!h.visits.length" class="empty">No visits yet.</div>
          <div v-for="v in h.visits" :key="v.id" class="card hv">
            <div class="hv-h" @click="open[v.id] = !open[v.id]">
              <span class="chev">{{ open[v.id] ? '▾' : '▸' }}</span>
              <b>{{ fdate(v.visit_date) }}</b><span class="badge grey">{{ v.visit_no }}</span><span class="badge grey">{{ v.visit_type }}</span><span class="badge" :class="badgeClass(v.status)">{{ v.status }}</span>
              <span class="muted small">{{ v.doctor }}<template v-if="v.department"> · {{ v.department }}</template></span>
              <span class="sp"></span><span class="small muted hv-sum">{{ v.diagnoses.map((x: any) => x.description).join('; ') || v.complaint }}</span>
              <NuxtLink v-if="can('visits.view')" :to="`/r/visits/${v.id}`" class="btn sm no-print" @click.stop>Open</NuxtLink>
            </div>
            <div v-show="open[v.id]" class="hv-b">
              <div class="dv" v-if="v.encounter || v.complaint">
                <div class="i wide"><div class="k">Chief complaint</div><div class="v">{{ v.encounter?.chief_complaint || v.complaint || '—' }}</div></div>
                <div v-if="v.encounter?.history" class="i wide"><div class="k">History of present illness</div><div class="v pre">{{ v.encounter.history }}</div></div>
                <div v-if="v.encounter?.examination" class="i wide"><div class="k">Examination</div><div class="v pre">{{ v.encounter.examination }}</div></div>
                <div v-if="v.encounter?.assessment" class="i wide"><div class="k">Assessment</div><div class="v pre">{{ v.encounter.assessment }}</div></div>
                <div v-if="v.encounter?.plan" class="i wide"><div class="k">Plan</div><div class="v pre">{{ v.encounter.plan }}</div></div>
                <div v-if="v.encounter?.follow_up_date" class="i"><div class="k">Follow-up</div><div class="v">{{ fdate(v.encounter.follow_up_date) }}</div></div>
              </div>
              <template v-if="v.diagnoses.length"><div class="sect">Diagnoses</div><div class="pchips"><span v-for="(x, i) in v.diagnoses" :key="i" class="badge" :class="x.dx_type === 'Primary' ? '' : 'grey'">{{ x.code }} · {{ x.description }}<template v-if="x.dx_type !== 'Primary'"> ({{ x.dx_type }})</template></span></div></template>
              <template v-if="v.vitals.length"><div class="sect">Vitals</div>
                <table><thead><tr><th>When</th><th>Temp</th><th>Pulse</th><th>BP</th><th>RR</th><th>SpO₂</th><th>Wt</th><th>Ht</th><th>Pain</th><th>Triage</th></tr></thead>
                  <tbody><tr v-for="(x, i) in v.vitals" :key="i"><td>{{ fdt(x.recorded_at) }}</td><td>{{ x.temperature }}</td><td>{{ x.pulse }}</td><td>{{ bp(x) }}</td><td>{{ x.resp_rate }}</td><td>{{ x.spo2 }}</td><td>{{ x.weight_kg }}</td><td>{{ x.height_cm }}</td><td>{{ x.pain_score }}</td><td>{{ x.triage_level }}</td></tr></tbody></table></template>
              <template v-if="v.nursing_notes.length"><div class="sect">Nursing notes</div><div v-for="(x, i) in v.nursing_notes" :key="i" class="small"><span class="muted">{{ fdt(x.noted_at) }}</span> — {{ x.note }}</div></template>
              <template v-for="l in v.labs" :key="l.order_id"><div class="sect">Lab · {{ l.order_no }} <span class="badge" :class="badgeClass(l.status)">{{ l.status }}</span> <span class="muted" style="text-transform:none;letter-spacing:0">{{ fdt(l.ordered_at) }}</span></div>
                <table v-if="l.items.length"><thead><tr><th>Test</th><th>Result</th><th>Reference</th><th>Flag</th></tr></thead>
                  <tbody><tr v-for="(t, i) in l.items" :key="i"><td>{{ t.test }}</td><td><b>{{ t.result_value ?? t.result_text ?? '—' }}</b> {{ t.result_value != null ? t.unit : '' }}</td><td class="muted">{{ t.ref_low != null || t.ref_high != null ? `${t.ref_low ?? ''} – ${t.ref_high ?? ''}` : '' }}</td><td><span v-if="t.flag" class="badge" :class="flagCls(t.flag)">{{ t.flag }}</span></td></tr></tbody></table></template>
              <template v-for="m in v.imaging" :key="m.id"><div class="sect">Imaging · {{ m.study }} <span class="badge" :class="badgeClass(m.status)">{{ m.status }}</span></div>
                <div class="small muted">{{ m.order_no }} · {{ fdt(m.ordered_at) }}<template v-if="m.clinical_info"> · {{ m.clinical_info }}</template></div>
                <div v-if="m.findings" class="dv" style="margin-top:6px"><div class="i wide"><div class="k">Findings</div><div class="v pre">{{ m.findings }}</div></div><div class="i wide"><div class="k">Impression</div><div class="v pre">{{ m.impression }}</div></div></div></template>
              <template v-for="r in v.prescriptions" :key="r.rx_id"><div class="sect">Prescription · {{ r.rx_no }} <span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span></div>
                <table v-if="r.items.length"><thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Route</th><th class="num">Days</th><th class="num">Qty</th><th class="num">Given</th></tr></thead>
                  <tbody><tr v-for="(m, i) in r.items" :key="i"><td>{{ m.generic_name }} {{ m.strength }}<div v-if="m.instructions" class="small muted">{{ m.instructions }}</div></td><td>{{ m.dose }}</td><td>{{ m.frequency }}</td><td>{{ m.route }}</td><td class="num">{{ m.duration_days }}</td><td class="num">{{ m.qty }}</td><td class="num">{{ m.dispensed_qty }}</td></tr></tbody></table></template>
              <template v-if="v.procedures.length"><div class="sect">Procedures</div><div v-for="(x, i) in v.procedures" :key="i" class="small">{{ x.service }} <span class="badge" :class="badgeClass(x.status)">{{ x.status }}</span> <span class="muted">{{ x.notes }}</span></div></template>
              <template v-if="v.dental.length"><div class="sect">Dental</div><div v-for="(x, i) in v.dental" :key="i" class="small">Tooth {{ x.tooth_no }} {{ x.surface }} — {{ x.condition }} <span class="muted">{{ x.notes }}</span></div></template>
              <template v-if="v.certificates.length"><div class="sect">Certificates</div><div v-for="(x, i) in v.certificates" :key="i" class="small">{{ x.cert_type }}<template v-if="x.days"> · {{ x.days }} day(s) from {{ fdate(x.from_date) }}</template> <span class="muted">{{ x.remarks }}</span></div></template>
              <template v-if="v.referrals.length"><div class="sect">Referrals</div><div v-for="(x, i) in v.referrals" :key="i" class="small">{{ x.to_facility }} {{ x.to_department }} · {{ x.urgency }} <span class="muted">{{ x.reason }}</span></div></template>
              <template v-for="i in v.invoices" :key="i.id"><div class="sect">Bill · {{ i.invoice_no }} <span class="badge" :class="badgeClass(i.status)">{{ i.status }}</span></div>
                <div class="small">Gross {{ money(i.gross) }}<template v-if="Number(i.discount) > 0"> · Discount {{ money(i.discount) }}</template> · Net <b>{{ money(i.net) }}</b> · Patient share {{ money(i.patient_share) }} · Insurer {{ money(i.payer_share) }} · Paid {{ money(i.paid) }} · <b>Balance {{ money(i.balance) }}</b></div>
                <div v-for="(y, k) in i.payments" :key="k" class="small muted">{{ fdt(y.paid_at) }} · {{ y.receipt_no }} · {{ y.kind }} {{ money(y.amount) }} ({{ y.method }})</div></template>
              <div v-if="!v.encounter && !v.diagnoses.length && !v.vitals.length && !v.labs.length && !v.imaging.length && !v.prescriptions.length && !v.invoices.length" class="none-txt">Nothing recorded for this visit yet.</div>
            </div>
          </div>
          <div v-if="h.dental_no_visit.length" class="card"><h2>Dental chart (not linked to a visit)</h2><div v-for="(x, i) in h.dental_no_visit" :key="i" class="small">{{ fdate(x.entry_date) }} · Tooth {{ x.tooth_no }} {{ x.surface }} — {{ x.condition }} <span class="muted">{{ x.notes }}</span></div></div>
          <div v-if="h.consents.length || h.documents.length" class="card"><h2>Consents & documents</h2><div v-for="(c, i) in h.consents" :key="'c' + i" class="small">{{ c.consent_type }} · {{ fdt(c.signed_at) }}<span v-if="c.withdrawn" class="badge red">Withdrawn</span></div><div v-for="(x, i) in h.documents" :key="'d' + i" class="small muted">{{ x.doc_type }}: {{ x.file_name }}<template v-if="x.expiry"> (expires {{ fdate(x.expiry) }})</template></div></div>
        </template>
      </div>
      <div v-show="tab === 'overview'" class="grid g2">
        <div class="card sub-card"><h2>Visits <span class="cnt">{{ d.visits.length }}</span></h2><div v-if="!d.visits.length" class="none-txt">No visits yet.</div><table v-if="d.visits.length"><tbody><tr v-for="v in d.visits" :key="v.id"><td>{{ fdate(v.visit_date) }}</td><td>{{ v.visit_no }}<div class="small muted">{{ v.doctor }}</div></td><td>{{ v.chief_complaint }}<div class="small muted">{{ v.diagnoses }}</div></td><td><span class="badge" :class="badgeClass(v.status)">{{ v.status }}</span></td></tr></tbody></table></div>
        <div class="card sub-card"><h2>Recent vitals <span class="cnt">{{ d.vitals.length }}</span></h2><div v-if="!d.vitals.length" class="none-txt">No vitals recorded.</div><table v-if="d.vitals.length"><thead><tr><th>When</th><th>Temp</th><th>Pulse</th><th>BP</th><th>SpO₂</th><th>Wt</th></tr></thead><tbody><tr v-for="(v, i) in d.vitals" :key="i"><td>{{ fdt(v.recorded_at) }}</td><td>{{ v.temperature }}</td><td>{{ v.pulse }}</td><td>{{ v.bp_systolic }}/{{ v.bp_diastolic }}</td><td>{{ v.spo2 }}</td><td>{{ v.weight_kg }}</td></tr></tbody></table></div>
        <div class="card sub-card"><h2>Lab <span class="cnt">{{ d.labs.length }}</span></h2><div v-if="!d.labs.length" class="none-txt">No lab orders.</div><table v-if="d.labs.length"><tbody><tr v-for="l in d.labs" :key="l.id"><td>{{ l.order_no }}<div class="small muted">{{ fdate(l.ordered_at) }}</div></td><td>{{ l.tests }}</td><td><span class="badge" :class="badgeClass(l.status)">{{ l.status }}</span></td></tr></tbody></table></div>
        <div class="card sub-card"><h2>Imaging <span class="cnt">{{ d.imaging.length }}</span></h2><div v-if="!d.imaging.length" class="none-txt">No imaging orders.</div><table v-if="d.imaging.length"><tbody><tr v-for="l in d.imaging" :key="l.id"><td>{{ l.order_no }}</td><td>{{ l.study }}</td><td><span class="badge" :class="badgeClass(l.status)">{{ l.status }}</span></td></tr></tbody></table></div>
        <div class="card sub-card"><h2>Prescriptions <span class="cnt">{{ d.prescriptions.length }}</span></h2><div v-if="!d.prescriptions.length" class="none-txt">No prescriptions.</div><table v-if="d.prescriptions.length"><tbody><tr v-for="r in d.prescriptions" :key="r.id"><td>{{ r.rx_no }}<div class="small muted">{{ fdate(r.created_at) }}</div></td><td>{{ r.medicines }}</td><td><span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span></td></tr></tbody></table></div>
        <div class="card sub-card"><h2>Insurance policies <span class="cnt">{{ d.policies.length }}</span></h2><table><tbody><tr v-for="p in d.policies" :key="p.id"><td>{{ p.payer }} {{ p.plan }}</td><td>{{ p.policy_no }}</td><td>to {{ fdate(p.valid_to) }}</td><td><span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span></td></tr></tbody></table><div v-if="!d.policies.length" class="none-txt">None on file.</div></div>
        <div v-if="d.invoices.length" class="card"><h2>Invoices</h2><table><thead><tr><th>No</th><th>Date</th><th class="num">Net</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody><tr v-for="i in d.invoices" :key="i.id"><td>{{ i.invoice_no }}</td><td>{{ fdate(i.invoice_date) }}</td><td class="num">{{ money(i.net) }}</td><td class="num">{{ money(i.balance) }}</td><td><span class="badge" :class="badgeClass(i.status)">{{ i.status }}</span></td></tr></tbody></table></div>
        <div class="card sub-card"><h2>Family / documents</h2><div v-if="!d.family.length && !d.documents.length" class="none-txt">Nothing on file.</div><div v-for="f in d.family" :key="f.name">{{ f.name }} – {{ f.relation }} {{ f.phone }}</div><div v-for="x in d.documents" :key="x.file_name" class="small muted">{{ x.doc_type }}: {{ x.file_name }}</div></div>
      </div>
    </div>
    <div v-else class="empty loading">Loading…</div>
  </div>
</template>
