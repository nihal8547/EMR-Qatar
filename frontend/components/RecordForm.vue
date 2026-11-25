<script setup lang="ts">
// Renders the fields of a resource as a form. `model` is mutated in place.
const props = defineProps<{ fields: any[]; model: Record<string, any>; labels?: Record<string, string>; mode: 'create' | 'edit'; readonly?: boolean; skip?: string[] }>()
const shown = computed(() => props.fields.filter((f) => !f.hidden && !(props.skip || []).includes(f.name) && !(f.type === 'password' && props.readonly)))
const isOff = (f: any) => props.readonly || f.readonly || (f.auto && props.mode === 'create') || (f.auto && props.mode === 'edit')
const wide = (f: any) => f.type === 'textarea' || f.type === 'json'
const view = computed(() => !!props.readonly && props.mode === 'edit')
function show(f: any) {
  const v = props.model[f.name]
  if (f.type === 'ref') return props.labels?.[f.name + '__label'] || (v ? String(v) : '')
  if (v === null || v === undefined || v === '') return ''
  if (f.type === 'bool') return v ? 'Yes' : 'No'
  if (f.type === 'money') return money(v)
  if (f.type === 'date') return fdate(v)
  if (f.type === 'datetime') return fdt(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// When a Visit is picked on a new record, fill the patient (and doctor) from it and show the patient's details.
const { api } = useApi()
const info = ref<any>(null)
const has = (n: string) => props.fields.some((f) => f.name === n)
const ageOf = (d: string) => { if (!d) return ''; const a = Math.floor((Date.now() - new Date(d).getTime()) / 31557600000); return a >= 0 ? `${a}y` : '' }
async function fillFromVisit(vid: any) {
  info.value = null
  if (!vid || !has('patient_id') || props.mode !== 'create') return
  try {
    const v: any = await api(`/r/visits/${vid}`)
    if (props.mode === 'create') {
      props.model.patient_id = v.patient_id
      if (props.labels) props.labels.patient_id__label = v.patient_id__label
      if (has('doctor_id') && !props.model.doctor_id) { props.model.doctor_id = v.doctor_id; if (props.labels) props.labels.doctor_id__label = v.doctor_id__label }
    }
    let p: any = null
    try { p = await api(`/r/patients/${v.patient_id}`) } catch { /* no patients.view */ }
    info.value = { visit: v, patient: p }
  } catch { /* visit not visible */ }
}
watch(() => props.model.visit_id, fillFromVisit, { immediate: true })
</script>
<template>
  <div v-if="info" class="alert" style="margin-bottom:10px">
    <b>{{ info.patient?.full_name || info.visit.patient_id__label }}</b>
    <span v-if="info.patient"> · {{ info.patient.mrn }} · {{ info.patient.gender }}<template v-if="info.patient.dob">, {{ ageOf(info.patient.dob) }}</template><template v-if="info.patient.blood_group"> · {{ info.patient.blood_group }}</template><template v-if="info.patient.phone"> · {{ info.patient.phone }}</template></span>
    <div class="small muted">Visit {{ info.visit.visit_no }} · {{ info.visit.doctor_id__label }} · {{ info.visit.payer_type }} · {{ info.visit.status }}<template v-if="info.visit.complaint"> · {{ info.visit.complaint }}</template></div>
  </div>
  <div v-if="view" class="dv">
    <div v-for="f in shown" :key="f.name" class="i" :class="{ wide: wide(f) }"><div class="k">{{ f.label }}</div>
      <div class="v" :class="{ none: !show(f), pre: wide(f) }"><template v-if="show(f)"><span v-if="f.type === 'select' && ['status', 'priority'].includes(f.name)" class="badge" :class="badgeClass(show(f))">{{ show(f) }}</span><template v-else>{{ show(f) }}</template></template><template v-else>—</template></div></div>
  </div>
  <div v-else class="fgrid">
    <div v-for="f in shown" :key="f.name" class="field" :class="{ wide: wide(f) }">
      <label class="f">{{ f.label }}<span v-if="f.required && !isOff(f)" class="req"> *</span><span v-if="f.auto && mode === 'create'" class="muted"> (auto)</span></label>
      <FieldInput :field="f" v-model="model[f.name]" :label="labels?.[f.name + '__label']" :disabled="isOff(f)" />
    </div>
  </div>
</template>
