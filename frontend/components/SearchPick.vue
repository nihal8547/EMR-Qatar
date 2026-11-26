<script setup lang="ts">
// Searchable picker. Either a local list (items) or server-side (fetcher: called with { q, group, ids } and returns the matching items).
type Item = { id: number; name: string; sub?: string; price?: any; group?: string }
const props = defineProps<{ modelValue: any; items?: Item[]; fetcher?: (a: { q: string; group: string; ids?: number[] }) => Promise<Item[]>; multiple?: boolean; placeholder?: string; disabled?: boolean; groups?: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: any): void; (e: 'picked', v: Item[]): void }>()
const q = ref(''); const group = ref(''); const remote = ref<Item[]>([]); const loading = ref(false)
const known = reactive<Record<number, Item>>({})
const sel = computed<number[]>(() => props.multiple ? (props.modelValue || []) : (props.modelValue ? [props.modelValue] : []))
const localFiltered = computed(() => {
  const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return (props.items || []).filter((i) => (!group.value || i.group === group.value) && words.every((w) => `${i.name} ${i.sub || ''} ${i.group || ''}`.toLowerCase().includes(w))).slice(0, 80)
})
const filtered = computed(() => (props.fetcher ? remote.value : localFiltered.value))
let seq = 0; let timer: any
async function search() {
  if (!props.fetcher) return
  const my = ++seq; loading.value = true
  try { const r = await props.fetcher({ q: q.value.trim(), group: group.value }); if (my !== seq) return; remote.value = r; for (const i of r) known[i.id] = i } catch { if (my === seq) remote.value = [] } finally { if (my === seq) loading.value = false }
}
watch([q, group], () => { clearTimeout(timer); timer = setTimeout(search, 250) })
onMounted(async () => {
  if (!props.fetcher) return
  search()
  const miss = sel.value.filter((id) => !known[id])
  if (miss.length) { try { for (const i of await props.fetcher({ q: '', group: '', ids: miss })) known[i.id] = i } catch { /* ignore */ } }
})
const byId = (id: number) => known[id] || (props.items || []).find((i) => i.id === id)
function toggle(id: number) {
  if (props.disabled) return
  const it = filtered.value.find((i) => i.id === id); if (it) known[id] = it
  if (props.multiple) { const a = [...sel.value]; const k = a.indexOf(id); if (k >= 0) a.splice(k, 1); else a.push(id); emit('update:modelValue', a) }
  else emit('update:modelValue', sel.value[0] === id ? null : id)
  emit('picked', sel.value.concat(id).map((x) => byId(x)).filter(Boolean) as Item[])
}
defineExpose({ known })
</script>
<template>
  <div class="sp-box">
    <div v-if="sel.length" class="sp-chips"><span v-for="id in sel" :key="id" class="badge blue">{{ byId(id)?.name || id }}<a v-if="!disabled" class="sp-x" @click="toggle(id)"> ✕</a></span></div>
    <input v-model="q" :placeholder="placeholder || 'Search…'" :disabled="disabled" />
    <div v-if="groups?.length" class="sp-groups"><button class="sm" :class="{ p: !group }" @click="group = ''">All</button><button v-for="g in groups" :key="g" class="sm" :class="{ p: group === g }" @click="group = g">{{ g }}</button></div>
    <div class="sp-list">
      <div v-for="i in filtered" :key="i.id" class="sp-row" :class="{ on: sel.includes(i.id) }" @click="toggle(i.id)">
        <span class="sp-mark">{{ sel.includes(i.id) ? '✔' : '＋' }}</span><span class="sp-name">{{ i.name }}<span v-if="i.sub" class="muted small"> · {{ i.sub }}</span></span><span v-if="i.price !== undefined && i.price !== null" class="small muted">{{ money(i.price) }}</span>
      </div>
      <div v-if="loading" class="muted small" style="padding:8px">Searching…</div><div v-else-if="!filtered.length" class="muted small" style="padding:8px">No matches</div>
    </div>
  </div>
</template>
<style scoped>
.sp-box{display:flex;flex-direction:column;gap:6px}.sp-chips{display:flex;flex-wrap:wrap;gap:4px}.sp-x{cursor:pointer;margin-left:2px}
.sp-groups{display:flex;flex-wrap:wrap;gap:4px}.sp-list{max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
.sp-row{display:flex;gap:8px;align-items:center;padding:6px 10px;cursor:pointer;border-bottom:1px solid #f1f3f5}.sp-row:hover{background:#f6f7f9}.sp-row.on{background:#eef3ff}.sp-name{flex:1}.sp-mark{width:16px;color:#555}
</style>
