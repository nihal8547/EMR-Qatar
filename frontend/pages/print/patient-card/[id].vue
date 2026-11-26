<script setup lang="ts">
definePageMeta({ perm: 'patients.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/print/patients/${route.params.id}`) } catch (e) { err(e) } })
const printNow = () => window.print()
</script>
<template>
  <div v-if="d" style="max-width:420px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff;border:2px solid #111">
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><b style="font-size:16px">{{ d.centre.centre_name || 'Medical Centre' }}</b><div class="small muted">{{ d.centre.centre_phone }}</div></div><div class="small muted">PATIENT CARD</div></div><hr />
      <div style="font-size:20px;font-weight:700">{{ d.record.full_name }}</div>
      <dl class="kv" style="margin:8px 0"><dt>MRN</dt><dd><b>{{ d.record.mrn }}</b></dd><dt>QID</dt><dd>{{ d.record.qid || '—' }}</dd><dt>Gender / DOB</dt><dd>{{ d.record.gender }} · {{ fdate(d.record.dob) }}</dd><dt>Phone</dt><dd>{{ d.record.phone || '—' }}</dd><dt v-if="d.record.blood_group">Blood group</dt><dd v-if="d.record.blood_group">{{ d.record.blood_group }}</dd></dl>
      <div style="text-align:center"><Barcode39 :value="d.record.mrn" :height="44" /><div class="small">{{ d.record.mrn }}</div></div>
      <p class="small muted" style="margin:8px 0 0;text-align:center">Please bring this card on every visit.</p>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
