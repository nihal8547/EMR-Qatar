<script setup lang="ts">
// Child records of a parent (e.g. prescription items) with add / edit / delete in a modal.
const props = defineProps<{ child: { res: string; fk: string; label: string | null }; parentId: number; meta: Record<string, any>; editable: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()
const { api } = useApi(); const { ok, err } = useUi()
const cm = computed(() => props.meta[props.child.res])
const rows = ref<any[]>([])
const loading = ref(false)
const cols = computed(() => (cm.value?.fields || []).filter((f: any) => f.list && !f.hidden && f.name !== props.child.fk))
const formFields = computed(() => (cm.value?.fields || []).filter((f: any) => !f.hidden && f.name !== props.child.fk))
const modal = ref<null | { id: number | null; model: Record<string, any>; labels: Record<string, string> }>(null)

async function load() {
  if (!cm.value) return
  loading.value = true
  try { rows.value = (await api(`/r/${props.child.res}`, { query: { [props.child.fk]: props.parentId, limit: 200, sort: 'id', dir: 'asc' } })).rows } catch (e) { err(e) } finally { loading.value = false }
}
onMounted(load)
watch(() => props.parentId, load)

function defaults() {
  const m: Record<string, any> = {}
  for (const f of formFields.value) {
    const d = f.def
    if (d === undefined || d === null || d === '') continue
    if (d === 'today') m[f.name] = todayStr()
    else if (d === 'now') m[f.name] = new Date().toISOString()
    else if (d === 'true') m[f.name] = true
    else if (d === 'false') m[f.name] = false
    else m[f.name] = f.type === 'int' || f.type === 'decimal' || f.type === 'money' ? Number(d) : d
  }
  return m
}
const canCreate = computed(() => props.editable && cm.value?.can.create)
function add() { modal.value = { id: null, model: defaults(), labels: {} } }
function edit(r: any) {
  if (!cm.value.can.edit && !cm.value.can.delete) return
  const labels: Record<string, string> = {}
  for (const k of Object.keys(r)) if (k.endsWith('__label')) labels[k] = r[k]
  modal.value = { id: r.id, model: { ...r }, labels }
}
async function save() {
  if (!modal.value) return
  try {
    const body: any = {}
    for (const f of formFields.value) if (!f.readonly && !f.auto) body[f.name] = modal.value.model[f.name]
    if (modal.value.id) await api(`/r/${props.child.res}/${modal.value.id}`, { method: 'PUT', body })
    else await api(`/r/${props.child.res}`, { method: 'POST', body: { ...body, [props.child.fk]: props.parentId } })
    ok('Saved'); modal.value = null; await load(); emit('changed')
  } catch (e) { err(e) }
}
async function del() {
  if (!modal.value?.id || !confirm('Delete this line?')) return
  try { await api(`/r/${props.child.res}/${modal.value.id}`, { method: 'DELETE' }); ok('Deleted'); modal.value = null; await load(); emit('changed') } catch (e) { err(e) }
}
const cell = (r: any, f: any) => {
  const v = f.type === 'ref' ? r[f.name + '__label'] : r[f.name]
  if (f.type === 'bool') return v ? 'Yes' : 'No'
  if (f.type === 'money') return money(v)
  if (f.type === 'date') return fdate(v)
  if (f.type === 'datetime') return fdt(v)
  return v ?? ''
}
</script>
<template>
  <div v-if="cm" class="card">
    <div class="bar"><h2 style="margin:0">{{ child.label || cm.label }}</h2><div class="sp"></div><button v-if="canCreate" class="p sm" @click="add">+ Add</button></div>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!rows.length" class="muted">No records yet.</div>
    <div v-else class="tbl-wrap" style="max-height:none">
      <table>
        <thead><tr><th v-for="f in cols" :key="f.name" :class="{ num: f.type === 'money' || f.type === 'int' || f.type === 'decimal' }">{{ f.label }}</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="click" @click="edit(r)">
            <td v-for="f in cols" :key="f.name" :class="{ num: f.type === 'money' || f.type === 'int' || f.type === 'decimal' }">
              <span v-if="f.type === 'select' && f.name.includes('status')" class="badge" :class="badgeClass(r[f.name])">{{ r[f.name] }}</span><template v-else>{{ cell(r, f) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="modal" class="modal-bg" @mousedown.self="modal = null">
      <div class="modal">
        <h2>{{ modal.id ? 'Edit' : 'Add' }} — {{ cm.singular || cm.label }}</h2>
        <RecordForm :fields="formFields" :model="modal.model" :labels="modal.labels" :mode="modal.id ? 'edit' : 'create'" :readonly="!!modal.id && !cm.can.edit" />
        <div class="bar" style="margin-top:12px">
          <button v-if="modal.id && cm.can.delete" class="danger" @click="del">Delete</button><div class="sp"></div>
          <button @click="modal = null">Close</button>
          <button v-if="modal.id ? cm.can.edit : cm.can.create" class="p" @click="save">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>
