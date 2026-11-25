<script setup lang="ts">
const route = useRoute()
const { api } = useApi(); const { ok, err } = useUi(); const { ensure } = useMeta(); const { can } = useAuth()
const key = computed(() => String(route.params.key))
const idParam = computed(() => String(route.params.id))
const isNew = computed(() => idParam.value === 'new')
const m = ref<any>(null)
const model = ref<Record<string, any>>({})
const labels = ref<Record<string, string>>({})
const busy = ref(false)
const loaded = ref(false)
const editing = ref(false)
const policies = ref<any[]>([])

function defaults(fields: any[]) {
  const o: Record<string, any> = {}
  for (const f of fields) {
    const d = f.def
    if (d !== undefined && d !== null && d !== '') {
      if (d === 'today') o[f.name] = todayStr()
      else if (d === 'now') o[f.name] = new Date().toISOString()
      else if (d === 'true') o[f.name] = true
      else if (d === 'false') o[f.name] = false
      else o[f.name] = ['int', 'decimal', 'money'].includes(f.type) ? Number(d) : d
    }
    const qv = route.query[f.name]
    if (qv !== undefined) o[f.name] = f.type === 'ref' || f.type === 'int' ? Number(qv) : qv
  }
  return o
}
async function load() {
  const meta = await ensure()
  m.value = meta[key.value] || null
  loaded.value = false
  if (!m.value) { loaded.value = true; return }
  if (isNew.value) { model.value = defaults(m.value.fields); labels.value = {}; editing.value = true }
  else {
    try {
      const r = await api(`/r/${key.value}/${idParam.value}`)
      setRecord(r)
      editing.value = false
    } catch (e) { err(e); m.value = null }
  }
  loaded.value = true
}
function setRecord(r: any) {
  const l: Record<string, string> = {}
  for (const k of Object.keys(r)) if (k.endsWith('__label')) l[k] = r[k]
  labels.value = l
  model.value = { ...r }
}
onMounted(load)
watch([key, idParam], load)

const fields = computed(() => (m.value?.fields || []) as any[])
const canEdit = computed(() => !isNew.value && m.value?.can.edit)
async function save() {
  busy.value = true
  try {
    const body: Record<string, any> = {}
    for (const f of fields.value) {
      if (f.hidden || f.readonly || f.auto) continue
      if (f.type === 'password' && !model.value[f.name]) continue
      body[f.name] = model.value[f.name]
    }
    if (isNew.value) {
      if (key.value === 'patients' && policies.value.length) {
        for (const [i, p] of policies.value.entries()) {
          if (!p.payer_id) throw new Error(`Policy ${i + 1}: choose the insurance company`)
          if (!String(p.policy_no).trim() || !String(p.member_id).trim()) throw new Error(`Policy ${i + 1}: policy number and member ID are required`)
          if (!p.valid_to) throw new Error(`Policy ${i + 1}: enter the "valid to" date`)
          if (p.valid_from && p.valid_to < p.valid_from) throw new Error(`Policy ${i + 1}: "valid to" is before "valid from"`)
        }
        body.insurance = policies.value
      }
      const r = await api(`/r/${key.value}`, { method: 'POST', body })
      ok('Created'); await navigateTo(`/r/${key.value}/${r.id}`, { replace: true })
    } else {
      const r = await api(`/r/${key.value}/${idParam.value}`, { method: 'PUT', body })
      setRecord(r); editing.value = false; ok('Saved')
    }
  } catch (e) { err(e) } finally { busy.value = false }
}
async function del() {
  if (!confirm('Delete this record?')) return
  try { await api(`/r/${key.value}/${idParam.value}`, { method: 'DELETE' }); ok('Deleted'); await navigateTo(`/r/${key.value}`) } catch (e) { err(e) }
}
async function runAction(a: any) {
  if (a.confirm && !confirm(`${a.label}?`)) return
  let body: any = {}
  if (/reject|cancel/i.test(a.name)) { const reason = prompt('Reason (required):'); if (!reason) return; body = { reason } }
  busy.value = true
  try { const r = await api(`/r/${key.value}/${idParam.value}/action/${a.name}`, { method: 'POST', body }); if (r.record) setRecord(r.record); ok(`${a.label}: done`); childKey.value++ } catch (e) { err(e) } finally { busy.value = false }
}
const childKey = ref(0)
const reload = async () => { try { setRecord(await api(`/r/${key.value}/${idParam.value}`)) } catch { /* ignore */ } }
const statusField = computed(() => fields.value.find((f) => f.name === 'status'))
</script>
<template>
  <div v-if="loaded && !m" class="card"><h1>Not available</h1><p class="muted">This record does not exist, or your role cannot view it.</p><NuxtLink :to="`/r/${key}`">Back</NuxtLink></div>
  <div v-else-if="m">
    <div class="bar">
      <NuxtLink :to="`/r/${key}`">‹ {{ m.label }}</NuxtLink><div class="sp"></div>
      <template v-if="!isNew">
        <NuxtLink v-if="key === 'patients' && can('patients.360')" :to="`/patient/${idParam}`" class="btn">Patient 360</NuxtLink>
        <NuxtLink v-if="key === 'invoices'" :to="`/print/invoice/${idParam}`" class="btn">🖨 Print invoice</NuxtLink>
        <NuxtLink v-if="key === 'lab_orders'" :to="`/print/lab/${idParam}`" class="btn">🖨 Lab report</NuxtLink>
        <NuxtLink v-if="key === 'visits' && can('billing.cashier')" :to="`/cashier?visit=${idParam}`" class="btn">Billing</NuxtLink>
        <button v-for="a in m.actions" :key="a.name" :disabled="busy" @click="runAction(a)">{{ a.label }}</button>
        <button v-if="canEdit && !editing" @click="editing = true">Edit</button>
        <button v-if="m.can.delete" class="danger" @click="del">Delete</button>
      </template>
    </div>
    <div class="card">
      <h1>{{ isNew ? `New ${m.singular || m.label}` : (m.singular || m.label) + ' #' + idParam }} <span v-if="statusField && model.status" class="badge" :class="badgeClass(model.status)">{{ model.status }}</span></h1>
      <div v-if="m.help" class="muted small" style="margin-bottom:10px">{{ m.help }}</div>
      <div v-if="isNew && !m.can.create" class="alert err">Your role cannot create this kind of record.</div>
      <RecordForm :fields="fields" :model="model" :labels="labels" :mode="isNew ? 'create' : 'edit'" :readonly="!editing" />
      <InsuranceBlock v-if="isNew && key === 'patients' && can('policy_members.create')" v-model="policies" />
      <div v-if="editing" class="bar" style="margin-top:8px"><button class="p" :disabled="busy || (isNew && !m.can.create)" @click="save">{{ busy ? 'Saving…' : 'Save' }}</button><button @click="isNew ? navigateTo(`/r/${key}`) : load()">Cancel</button></div>
    </div>
    <template v-if="!isNew">
      <ChildTable v-for="c in m.children" :key="c.res + childKey" :child="c" :parent-id="Number(idParam)" :meta="useMeta().meta.value || {}" :editable="true" @changed="reload" />
    </template>
  </div>
</template>
