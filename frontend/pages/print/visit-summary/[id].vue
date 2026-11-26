<script setup lang="ts">
definePageMeta({ perm: 'patients.360' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const v = ref<any>(null); const p = ref<any>(null); const centre = ref<any>({})
onMounted(async () => {
  try {
    const pv: any = await api(`/print/visits/${route.params.id}`); centre.value = pv.centre
    const h: any = await api(`/patients/${pv.record.patient_id}/history`)
    p.value = h.patient; v.value = h.visits.find((x: any) => String(x.id) === String(route.params.id)) || null
  } catch (e) { err(e) }
})
const printNow = () => window.print()
const bp = (x: any) => (x.bp_systolic ? `${x.bp_systolic}/${x.bp_diastolic}` : '')
</script>
<template>
  <div v-if="v && p" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ centre.centre_address }} · {{ centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">VISIT SUMMARY</h2><div>{{ v.visit_no }}</div></div></div><hr />
      <div class="grid g2"><div><b>{{ p.full_name }}</b><div class="small">{{ p.mrn }} · QID {{ p.qid || '–' }}</div><div class="small">{{ p.gender }} · DOB {{ fdate(p.dob) }}</div></div><div class="small right">{{ fdate(v.visit_date) }} · {{ v.visit_type }}<div>{{ v.doctor || '—' }}<template v-if="v.department"> · {{ v.department }}</template></div></div></div>
      <dl class="kv" style="margin-top:10px"><template v-if="v.encounter?.chief_complaint || v.complaint"><dt>Complaint</dt><dd>{{ v.encounter?.chief_complaint || v.complaint }}</dd></template><template v-if="v.encounter?.history"><dt>History</dt><dd style="white-space:pre-wrap">{{ v.encounter.history }}</dd></template><template v-if="v.encounter?.examination"><dt>Examination</dt><dd style="white-space:pre-wrap">{{ v.encounter.examination }}</dd></template><template v-if="v.encounter?.assessment"><dt>Assessment</dt><dd style="white-space:pre-wrap">{{ v.encounter.assessment }}</dd></template><template v-if="v.encounter?.plan"><dt>Plan</dt><dd style="white-space:pre-wrap">{{ v.encounter.plan }}</dd></template><template v-if="v.encounter?.follow_up_date"><dt>Follow-up</dt><dd>{{ fdate(v.encounter.follow_up_date) }}</dd></template></dl>
      <template v-if="v.diagnoses.length"><h3>Diagnoses</h3><div v-for="(x, i) in v.diagnoses" :key="i" class="small">{{ x.code }} · {{ x.description }} <span class="muted">({{ x.dx_type }})</span></div></template>
      <template v-if="v.vitals.length"><h3>Vitals</h3><div v-for="(x, i) in v.vitals" :key="i" class="small">{{ fdt(x.recorded_at) }} — Temp {{ x.temperature ?? '–' }} · Pulse {{ x.pulse ?? '–' }} · BP {{ bp(x) || '–' }} · SpO₂ {{ x.spo2 ?? '–' }} · Wt {{ x.weight_kg ?? '–' }}</div></template>
      <template v-for="l in v.labs" :key="l.order_id"><h3>Lab · {{ l.order_no }}</h3><table v-if="l.items.length"><thead><tr><th>Test</th><th>Result</th><th>Reference</th><th>Flag</th></tr></thead><tbody><tr v-for="(t, i) in l.items" :key="i"><td>{{ t.test }}</td><td><b>{{ t.result_value ?? t.result_text ?? '—' }}</b> {{ t.result_value != null ? t.unit : '' }}</td><td class="muted">{{ t.ref_low != null || t.ref_high != null ? `${t.ref_low ?? ''} – ${t.ref_high ?? ''}` : '' }}</td><td>{{ t.flag && t.flag !== 'Normal' ? t.flag : '' }}</td></tr></tbody></table><div v-else class="small muted">Results pending</div></template>
      <template v-for="m in v.imaging" :key="m.id"><h3>Imaging · {{ m.study }}</h3><div v-if="m.findings" class="small" style="white-space:pre-wrap"><b>Findings:</b> {{ m.findings }}<br /><b>Impression:</b> {{ m.impression }}</div><div v-else class="small muted">Report pending</div></template>
      <template v-for="r in v.prescriptions" :key="r.rx_id"><h3>Prescription · {{ r.rx_no }}</h3><table><thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Route</th><th class="num">Days</th><th class="num">Qty</th></tr></thead><tbody><tr v-for="(m, i) in r.items" :key="i"><td>{{ m.generic_name }} {{ m.strength }}<div v-if="m.instructions" class="small muted">{{ m.instructions }}</div></td><td>{{ m.dose }}</td><td>{{ m.frequency }}</td><td>{{ m.route }}</td><td class="num">{{ m.duration_days }}</td><td class="num">{{ m.qty }}</td></tr></tbody></table></template>
      <template v-if="v.procedures.length"><h3>Procedures</h3><div v-for="(x, i) in v.procedures" :key="i" class="small">{{ x.service }} — {{ x.status }} <span class="muted">{{ x.notes }}</span></div></template>
      <template v-if="v.certificates.length"><h3>Certificates</h3><div v-for="(x, i) in v.certificates" :key="i" class="small">{{ x.cert_type }}<template v-if="x.days"> · {{ x.days }} day(s) from {{ fdate(x.from_date) }}</template></div></template>
      <div style="margin-top:36px" class="small"><div style="border-top:1px solid #000;width:240px;padding-top:4px">Doctor signature · {{ v.doctor }}</div></div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
