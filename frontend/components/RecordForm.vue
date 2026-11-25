<script setup lang="ts">
// Renders the fields of a resource as a form. `model` is mutated in place.
const props = defineProps<{ fields: any[]; model: Record<string, any>; labels?: Record<string, string>; mode: 'create' | 'edit'; readonly?: boolean; skip?: string[] }>()
const shown = computed(() => props.fields.filter((f) => !f.hidden && !(props.skip || []).includes(f.name) && !(f.type === 'password' && props.readonly)))
const isOff = (f: any) => props.readonly || f.readonly || (f.auto && props.mode === 'create') || (f.auto && props.mode === 'edit')
const wide = (f: any) => f.type === 'textarea' || f.type === 'json'
</script>
<template>
  <div class="fgrid">
    <div v-for="f in shown" :key="f.name" class="field" :class="{ wide: wide(f) }">
      <label class="f">{{ f.label }}<span v-if="f.required && !isOff(f)" class="req"> *</span><span v-if="f.auto && mode === 'create'" class="muted"> (auto)</span></label>
      <FieldInput :field="f" v-model="model[f.name]" :label="labels?.[f.name + '__label']" :disabled="isOff(f)" />
    </div>
  </div>
</template>
