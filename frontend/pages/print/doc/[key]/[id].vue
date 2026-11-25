<script setup lang="ts">
const route = useRoute(); const { api } = useApi(); const { err } = useUi(); const { state: auth } = useAuth()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/print/${route.params.key}/${route.params.id}`) } catch (e) { err(e) } })
const printNow = () => window.print()
const age = (dob: string) => { if (!dob) return ''; const a = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000); return a >= 0 ? `${a}y` : '' }
const HIDE = ['id', 'patient_id', 'is_deleted', 'created_at', 'updated_at']
function val(row: any, f: any) {
  const v = row[f.name]
  if (f.type === 'ref') return row[f.name + '__label'] || ''
  if (v === null || v === undefined || v === '') return ''
  if (f.type === 'bool') return v ? 'Yes' : 'No'
  if (f.type === 'money' || f.type === 'decimal') return money(v)
  if (f.type === 'date') return fdate(v)
  if (f.type === 'datetime') return fdt(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
const main = computed(() => d.value ? d.value.fields.filter((f: any) => !HIDE.includes(f.name) && !(d.value.patient && f.name === 'patient_id') && val(d.value.record, f) !== '') : [])
const letter = computed(() => ['certificates', 'referrals'].includes(d.value?.meta.key))
const title = computed(() => (d.value?.meta.singular || '').toUpperCase())
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">{{ title }}</h2><div class="small muted">No. {{ d.record.id }}</div></div></div><hr />
      <div v-if="d.patient" class="grid g2" style="margin-bottom:10px"><div><b>{{ d.patient.full_name }}</b><div class="small">MRN {{ d.patient.mrn }} · QID {{ d.patient.qid || '–' }}</div><div class="small">{{ d.patient.gender }}<template v-if="d.patient.dob">, {{ age(d.patient.dob) }} · DOB {{ fdate(d.patient.dob) }}</template><template v-if="d.patient.phone"> · {{ d.patient.phone }}</template></div></div><div class="small right">Printed {{ fdt(new Date().toISOString()) }}</div></div>
      <div v-if="letter" style="margin:14px 0;line-height:1.7">
        <template v-if="d.meta.key === 'certificates'"><p>This is to certify that the above-named patient was examined at this centre. <b>{{ d.record.cert_type }}</b><template v-if="d.record.days"> — {{ d.record.days }} day(s) from {{ fdate(d.record.from_date) }}</template>.</p></template>
        <template v-else><p>Dear Colleague, kindly see and manage the above-named patient — <b>{{ d.record.to_facility }}</b><template v-if="d.record.to_department"> ({{ d.record.to_department }})</template>. Urgency: {{ d.record.urgency }}.</p></template>
      </div>
      <dl class="kv"><template v-for="f in main" :key="f.name"><dt>{{ f.label }}</dt><dd>{{ val(d.record, f) }}</dd></template></dl>
      <template v-for="c in d.children" :key="c.key"><div v-if="c.rows.length"><h3 style="margin-top:16px">{{ c.label }}</h3>
        <table><thead><tr><th v-for="f in c.fields" :key="f.name" :class="{ num: ['int','money','decimal'].includes(f.type) }">{{ f.label }}</th></tr></thead><tbody><tr v-for="r in c.rows" :key="r.id"><td v-for="f in c.fields" :key="f.name" :class="{ num: ['int','money','decimal'].includes(f.type) }">{{ val(r, f) }}</td></tr></tbody></table></div></template>
      <div style="margin-top:36px" class="small"><div style="border-top:1px solid #000;width:240px;padding-top:4px">{{ letter && d.record.issued_by__label ? d.record.issued_by__label : 'Authorised signature' }}<div class="muted">Printed by {{ auth.user?.full_name }}</div></div></div>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
