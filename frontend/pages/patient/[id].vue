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
      <div class="bar"><h1>{{ d.patient.full_name }}</h1><span class="muted">{{ d.patient.mrn }} · QID {{ d.patient.qid || '–' }} · {{ d.patient.age }}y {{ d.patient.gender }} · {{ d.patient.phone }}</span><div class="sp"></div><NuxtLink :to="`/r/patients/${d.patient.id}`" class="btn">Demographics</NuxtLink></div>
      <div class="alert" :class="d.allergies.length ? 'err' : 'ok'"><b>Allergies:</b> <template v-if="d.allergies.length"><span v-for="a in d.allergies" :key="a.allergen" class="badge red" style="margin-right:4px">{{ a.allergen }} {{ a.reaction ? '– ' + a.reaction : '' }}</span></template><template v-else>none recorded</template></div>
      <div class="grid g2">
        <div class="card"><h2>Visits</h2><table><tbody><tr v-for="v in d.visits" :key="v.id"><td>{{ fdate(v.visit_date) }}</td><td>{{ v.visit_no }}<div class="small muted">{{ v.doctor }}</div></td><td>{{ v.chief_complaint }}<div class="small muted">{{ v.diagnoses }}</div></td><td><span class="badge" :class="badgeClass(v.status)">{{ v.status }}</span></td></tr></tbody></table></div>
        <div class="card"><h2>Recent vitals</h2><table><thead><tr><th>When</th><th>Temp</th><th>Pulse</th><th>BP</th><th>SpO₂</th><th>Wt</th></tr></thead><tbody><tr v-for="(v, i) in d.vitals" :key="i"><td>{{ fdt(v.recorded_at) }}</td><td>{{ v.temperature }}</td><td>{{ v.pulse }}</td><td>{{ v.bp_systolic }}/{{ v.bp_diastolic }}</td><td>{{ v.spo2 }}</td><td>{{ v.weight_kg }}</td></tr></tbody></table></div>
        <div class="card"><h2>Lab</h2><table><tbody><tr v-for="l in d.labs" :key="l.id"><td>{{ l.order_no }}<div class="small muted">{{ fdate(l.ordered_at) }}</div></td><td>{{ l.tests }}</td><td><span class="badge" :class="badgeClass(l.status)">{{ l.status }}</span></td></tr></tbody></table></div>
        <div class="card"><h2>Imaging</h2><table><tbody><tr v-for="l in d.imaging" :key="l.id"><td>{{ l.order_no }}</td><td>{{ l.study }}</td><td><span class="badge" :class="badgeClass(l.status)">{{ l.status }}</span></td></tr></tbody></table></div>
        <div class="card"><h2>Prescriptions</h2><table><tbody><tr v-for="r in d.prescriptions" :key="r.id"><td>{{ r.rx_no }}<div class="small muted">{{ fdate(r.created_at) }}</div></td><td>{{ r.medicines }}</td><td><span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span></td></tr></tbody></table></div>
        <div class="card"><h2>Insurance policies</h2><table><tbody><tr v-for="p in d.policies" :key="p.id"><td>{{ p.payer }} {{ p.plan }}</td><td>{{ p.policy_no }}</td><td>to {{ fdate(p.valid_to) }}</td><td><span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span></td></tr></tbody></table><div v-if="!d.policies.length" class="muted">None on file.</div></div>
        <div v-if="d.invoices.length" class="card"><h2>Invoices</h2><table><thead><tr><th>No</th><th>Date</th><th class="num">Net</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody><tr v-for="i in d.invoices" :key="i.id"><td>{{ i.invoice_no }}</td><td>{{ fdate(i.invoice_date) }}</td><td class="num">{{ money(i.net) }}</td><td class="num">{{ money(i.balance) }}</td><td><span class="badge" :class="badgeClass(i.status)">{{ i.status }}</span></td></tr></tbody></table></div>
        <div class="card"><h2>Family / documents</h2><div v-for="f in d.family" :key="f.name">{{ f.name }} – {{ f.relation }} {{ f.phone }}</div><div v-for="x in d.documents" :key="x.file_name" class="small muted">{{ x.doc_type }}: {{ x.file_name }}</div></div>
      </div>
    </div>
    <div v-else class="empty">Loading…</div>
  </div>
</template>
