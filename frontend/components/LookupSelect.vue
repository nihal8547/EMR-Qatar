<script setup lang="ts">
// Searchable dropdown backed by GET /lookup/:resource?q=
const props = defineProps<{ modelValue: any; resource: string; initialLabel?: string; disabled?: boolean; placeholder?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: any): void; (e: 'picked', v: { id: number; label: string } | null): void }>()
const { api } = useApi()
const text = ref(props.initialLabel || '')
const items = ref<{ id: number; label: string }[]>([])
const open = ref(false)
let timer: any = null

async function fetchLabel() {
  if (props.modelValue && !text.value) {
    try { const r: any[] = await api(`/lookup/${props.resource}`, { query: { id: props.modelValue } }); text.value = r[0]?.label || '' } catch { /* ignore */ }
  }
}
onMounted(fetchLabel)
watch(() => props.modelValue, (v) => { if (!v) text.value = ''; else if (!text.value) fetchLabel() })
watch(() => props.initialLabel, (v) => { if (v && !text.value) text.value = v })

async function search() {
  try { items.value = await api(`/lookup/${props.resource}`, { query: { q: text.value } }) } catch { items.value = [] }
}
function onInput() {
  open.value = true
  clearTimeout(timer)
  timer = setTimeout(search, 200)
  if (!text.value) { emit('update:modelValue', null); emit('picked', null) }
}
function onFocus() { open.value = true; search() }
function pick(i: { id: number; label: string }) {
  text.value = i.label
  emit('update:modelValue', i.id)
  emit('picked', i)
  open.value = false
}
function blur() {
  setTimeout(() => {
    open.value = false
    if (!props.modelValue) text.value = ''
    else if (props.initialLabel && !text.value) text.value = props.initialLabel
  }, 160)
}
</script>
<template>
  <div class="lookup">
    <input v-model="text" :disabled="disabled" :placeholder="placeholder || 'Type to search…'" autocomplete="off" @input="onInput" @focus="onFocus" @blur="blur" />
    <div v-if="open && !disabled" class="dd">
      <div v-for="i in items" :key="i.id" @mousedown.prevent="pick(i)">{{ i.label }}</div>
      <div v-if="!items.length" class="muted">No matches</div>
    </div>
  </div>
</template>
