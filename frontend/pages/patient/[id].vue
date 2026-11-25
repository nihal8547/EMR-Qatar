<script setup lang="ts">
definePageMeta({ perm: 'patients.360' })
const route = useRoute()
const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
const reason = ref(''); const needReason = ref(false)
async function load(bg?: string) {
  try { d.value = await api(`/patients/${route.params.id}/360`, { query: { breakglass: bg } }); needReason.value = false } catch (e: any) { if (e.extra?.breakglass) needReason.value = true; else err(e) }
}
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
      <div class="alert" :class="d.allergies.length ? 'err' : 'ok'"><b>Allergies:</b> <template v-if="d.allergies.length"><span v-for="a in d.allergies" :key="a.allergen" class="badge red" style="margin-right:4px">{{ a.allergen }} {{ a.reaction ? '– ' + a.reaction : '' }}</span></template><template v-else>none recorded</template></div>
      <div class="grid g2">
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
