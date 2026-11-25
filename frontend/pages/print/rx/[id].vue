<script setup lang="ts">
definePageMeta({ perm: 'prescriptions.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
const printNow = () => window.print()
onMounted(async () => { try { d.value = await api(`/prescriptions/${route.params.id}/print`) } catch (e) { err(e) } })
const age = (dob: string) => { if (!dob) return ''; const a = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000); return a >= 0 ? `${a}y` : '' }
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">PRESCRIPTION</h2><div>{{ d.rx.rx_no }}</div></div></div><hr />
      <div class="grid g2"><div><b>{{ d.rx.full_name }}</b><div class="small">MRN {{ d.rx.mrn }} · QID {{ d.rx.qid || '–' }}</div><div class="small">{{ d.rx.gender }}<template v-if="d.rx.dob">, {{ age(d.rx.dob) }} · DOB {{ fdate(d.rx.dob) }}</template></div></div><div class="small right">Date {{ fdt(d.rx.created_at) }}<div v-if="d.rx.visit_no">Visit {{ d.rx.visit_no }}</div></div></div>
      <div v-if="d.allergies.length" class="alert warn" style="margin-top:10px"><b>Allergies:</b> {{ d.allergies.map((a: any) => a.allergen + (a.severity ? ' (' + a.severity + ')' : '')).join(', ') }}</div>
      <table style="margin-top:12px"><thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Route</th><th>Days</th><th>Qty</th></tr></thead>
        <tbody><template v-for="(i, k) in d.items" :key="k"><tr><td>{{ k + 1 }}</td><td><b>{{ i.drug }}</b><div class="small muted">{{ i.generic_name }} {{ i.strength }} {{ i.form }}</div></td><td>{{ i.dose }}</td><td>{{ i.frequency }}</td><td>{{ i.route }}</td><td>{{ i.duration_days }}</td><td>{{ i.qty }}</td></tr>
          <tr v-if="i.instructions"><td></td><td colspan="6" class="small">↳ {{ i.instructions }}</td></tr></template></tbody></table>
      <div v-if="!d.items.length" class="alert warn">No medicines on this prescription.</div>
      <p v-if="d.rx.notes" class="small" style="margin-top:10px"><b>Notes:</b> {{ d.rx.notes }}</p>
      <div style="margin-top:36px" class="small"><div style="border-top:1px solid #000;width:240px;padding-top:4px">{{ d.rx.doctor }}<div class="muted">Licence {{ d.rx.doctor_licence || '–' }}</div></div></div>
    </div>
  </div>
  <div v-else class="empty">Loading…</div>
</template>
