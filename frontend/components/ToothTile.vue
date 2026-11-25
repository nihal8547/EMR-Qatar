<script setup lang="ts">
// One tooth: five occlusal zones (B, L, M, D, O) coloured by the latest chart entry.
const props = defineProps<{ no: string; zones: Record<string, string>; whole?: string; upper: boolean; mesialRight: boolean; selected?: boolean; plan?: boolean }>()
defineEmits<{ (e: 'pick'): void }>()
const COLORS: Record<string, string> = {
  Healthy: '#ffffff', Caries: '#d64545', Filling: '#3b82c4', Crown: '#c9a227', Bridge: '#c9a227', 'Root canal': '#8b5cf6', Implant: '#0f9d8a', Missing: '#e5e7eb',
  Extracted: '#e5e7eb', Fractured: '#e8833a', Impacted: '#6b7280', Sealant: '#7fc8a9', Veneer: '#e9d8a6', Mobility: '#f2b8c6', 'Periapical lesion': '#b45309', 'Planned extraction': '#f59e0b',
}
const col = (z: string) => COLORS[props.zones[z] || 'Healthy'] || '#fff'
const gone = computed(() => ['Missing', 'Extracted'].includes(props.whole || ''))
const top = computed(() => (props.upper ? 'B' : 'L'))
const bottom = computed(() => (props.upper ? 'L' : 'B'))
const left = computed(() => (props.mesialRight ? 'D' : 'M'))
const right = computed(() => (props.mesialRight ? 'M' : 'D'))
</script>
<template>
  <button class="tooth" :class="{ sel: selected }" :title="`Tooth ${no}${whole ? ' - ' + whole : ''}`" @click="$emit('pick')">
    <span v-if="upper" class="tn">{{ no }}</span>
    <svg viewBox="0 0 40 40" width="32" height="32">
      <g stroke="#111" stroke-width="1" :opacity="gone ? 0.45 : 1">
        <polygon points="0,0 40,0 28,12 12,12" :fill="col(top)" />
        <polygon points="0,40 40,40 28,28 12,28" :fill="col(bottom)" />
        <polygon points="0,0 12,12 12,28 0,40" :fill="col(left)" />
        <polygon points="40,0 28,12 28,28 40,40" :fill="col(right)" />
        <rect x="12" y="12" width="16" height="16" :fill="col('O')" />
      </g>
      <g v-if="gone" stroke="#111" stroke-width="2"><line x1="4" y1="4" x2="36" y2="36" /><line x1="36" y1="4" x2="4" y2="36" /></g>
    </svg>
    <span v-if="!upper" class="tn">{{ no }}</span>
    <i v-if="plan" class="pl" title="Planned treatment" />
  </button>
</template>
<style scoped>
.tooth{display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px;border:1px solid transparent;border-radius:8px;background:none;position:relative;cursor:pointer}
.tooth:hover{background:#f1f1f1}.tooth.sel{border-color:#111;background:#f5f5f5}
.tn{font-size:10px;color:#555;font-variant-numeric:tabular-nums}
.pl{position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:#f59e0b;border:1px solid #fff}
</style>
