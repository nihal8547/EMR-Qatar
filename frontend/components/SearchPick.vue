<script setup lang="ts">
// Searchable picker over a local list. multiple => v-model is an array of ids, else a single id.
const props = defineProps<{ modelValue: any; items: { id: number; name: string; sub?: string; price?: any; group?: string }[]; multiple?: boolean; placeholder?: string; disabled?: boolean; groups?: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: any): void }>()
const q = ref(''); const group = ref('')
const sel = computed<number[]>(() => props.multiple ? (props.modelValue || []) : (props.modelValue ? [props.modelValue] : []))
const filtered = computed(() => {
  const t = q.value.trim().toLowerCase()
  return props.items.filter((i) => (!group.value || i.group === group.value) && (!t || `${i.name} ${i.sub || ''} ${i.group || ''}`.toLowerCase().includes(t))).slice(0, 80)
})
const byId = (id: number) => props.items.find((i) => i.id === id)
function toggle(id: number) {
  if (props.disabled) return
  if (props.multiple) { const a = [...sel.value]; const k = a.indexOf(id); if (k >= 0) a.splice(k, 1); else a.push(id); emit('update:modelValue', a) }
  else emit('update:modelValue', sel.value[0] === id ? null : id)
}
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
      <div v-if="!filtered.length" class="muted small" style="padding:8px">No matches</div>
    </div>
  </div>
</template>
<style scoped>
.sp-box{display:flex;flex-direction:column;gap:6px}.sp-chips{display:flex;flex-wrap:wrap;gap:4px}.sp-x{cursor:pointer;margin-left:2px}
.sp-groups{display:flex;flex-wrap:wrap;gap:4px}.sp-list{max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
.sp-row{display:flex;gap:8px;align-items:center;padding:6px 10px;cursor:pointer;border-bottom:1px solid #f1f3f5}.sp-row:hover{background:#f6f7f9}.sp-row.on{background:#eef3ff}.sp-name{flex:1}.sp-mark{width:16px;color:#555}
</style>
