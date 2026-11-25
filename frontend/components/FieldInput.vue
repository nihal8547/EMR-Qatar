<script setup lang="ts">
const props = defineProps<{ field: any; modelValue: any; label?: string; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: any): void }>()
const f = computed(() => props.field)
const set = (v: any) => emit('update:modelValue', v)
const onNum = (e: Event) => { const v = (e.target as HTMLInputElement).value; set(v === '' ? null : Number(v)) }
// datetime: model is an ISO string; the input shows local time
const dtLocal = computed(() => {
  if (!props.modelValue) return ''
  const d = new Date(props.modelValue)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
})
const onDt = (e: Event) => { const v = (e.target as HTMLInputElement).value; set(v ? new Date(v).toISOString() : null) }
</script>
<template>
  <LookupSelect v-if="f.type === 'ref'" :model-value="modelValue" :resource="f.ref" :initial-label="label" :disabled="disabled" @update:model-value="set" />
  <select v-else-if="f.type === 'select'" :value="modelValue ?? ''" :disabled="disabled" @change="set(($event.target as HTMLSelectElement).value || null)">
    <option value="">—</option>
    <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
  </select>
  <input v-else-if="f.type === 'bool'" type="checkbox" :checked="!!modelValue" :disabled="disabled" @change="set(($event.target as HTMLInputElement).checked)" />
  <textarea v-else-if="f.type === 'textarea' || f.type === 'json'" :value="modelValue ?? ''" :disabled="disabled" @input="set(($event.target as HTMLTextAreaElement).value)"></textarea>
  <input v-else-if="f.type === 'int'" type="number" step="1" :value="modelValue ?? ''" :disabled="disabled" @input="onNum" />
  <input v-else-if="f.type === 'decimal' || f.type === 'money'" type="number" step="any" :value="modelValue ?? ''" :disabled="disabled" @input="onNum" />
  <input v-else-if="f.type === 'date'" type="date" :value="modelValue ? String(modelValue).slice(0, 10) : ''" :disabled="disabled" @input="set(($event.target as HTMLInputElement).value || null)" />
  <input v-else-if="f.type === 'time'" type="time" :value="modelValue ? String(modelValue).slice(0, 5) : ''" :disabled="disabled" @input="set(($event.target as HTMLInputElement).value || null)" />
  <input v-else-if="f.type === 'datetime'" type="datetime-local" :value="dtLocal" :disabled="disabled" @input="onDt" />
  <input v-else-if="f.type === 'password'" type="password" autocomplete="new-password" :value="modelValue ?? ''" :disabled="disabled" @input="set(($event.target as HTMLInputElement).value)" />
  <input v-else :type="f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'" :value="modelValue ?? ''" :disabled="disabled" @input="set(($event.target as HTMLInputElement).value)" />
</template>
