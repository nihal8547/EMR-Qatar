<script setup lang="ts">
/** WHO growth chart (SVG): reference curves at -3, -2, median, +2, +3 SD with the child's measurements plotted on top. */
const props = defineProps<{ curves: Record<string, [number, number][]>; points: { age: number; v: number; label: string }[]; unit: string; title: string; maxAge: number }>()
const W = 760, H = 440, L = 56, R = 46, T = 20, B = 46
const lines = [['3', '#b42318', '5 4'], ['2', '#d97706', ''], ['0', '#111827', ''], ['-2', '#d97706', ''], ['-3', '#b42318', '5 4']] as const
const cut = (a: [number, number][]) => a.filter(([m]) => m <= props.maxAge)
const ys = computed(() => {
  const v: number[] = []
  for (const k of ['3', '-3']) for (const [, y] of cut(props.curves[k] || [])) v.push(y)
  for (const p of props.points) if (p.age <= props.maxAge) v.push(p.v)
  const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.04
  return [Math.floor(lo - pad), Math.ceil(hi + pad)]
})
const sx = (m: number) => L + (m / props.maxAge) * (W - L - R)
const sy = (y: number) => H - B - ((y - ys.value[0]) / (ys.value[1] - ys.value[0])) * (H - T - B)
const path = (a: [number, number][]) => cut(a).map(([m, y], i) => `${i ? 'L' : 'M'}${sx(m).toFixed(1)},${sy(y).toFixed(1)}`).join('')
const xticks = computed(() => (props.maxAge <= 24 ? Array.from({ length: 9 }, (_, i) => i * 3) : Array.from({ length: 11 }, (_, i) => i * 6)))
const yticks = computed(() => { const [a, b] = ys.value, step = (b - a) > 60 ? 10 : (b - a) > 30 ? 5 : (b - a) > 12 ? 2 : 1; const o: number[] = []; for (let y = Math.ceil(a / step) * step; y <= b; y += step) o.push(y); return o })
const shown = computed(() => props.points.filter((p) => p.age <= props.maxAge).sort((a, b) => a.age - b.age))
const ptsPath = computed(() => shown.value.map((p, i) => `${i ? 'L' : 'M'}${sx(p.age).toFixed(1)},${sy(p.v).toFixed(1)}`).join(''))
const endLabel = (k: string) => (k === '0' ? 'Median' : (+k > 0 ? '+' : '−') + Math.abs(+k))
</script>
<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="gchart" role="img" :aria-label="title">
    <rect x="0" y="0" :width="W" :height="H" fill="#fff" />
    <g stroke="#e5e7eb" stroke-width="1">
      <line v-for="m in xticks" :key="'x' + m" :x1="sx(m)" :x2="sx(m)" :y1="T" :y2="H - B" />
      <line v-for="y in yticks" :key="'y' + y" :x1="L" :x2="W - R" :y1="sy(y)" :y2="sy(y)" />
    </g>
    <g font-size="11" fill="#4b5563">
      <text v-for="m in xticks" :key="'xt' + m" :x="sx(m)" :y="H - B + 16" text-anchor="middle">{{ maxAge <= 24 ? m : m / 12 }}</text>
      <text v-for="y in yticks" :key="'yt' + y" :x="L - 8" :y="sy(y) + 4" text-anchor="end">{{ y }}</text>
      <text :x="(L + W - R) / 2" :y="H - 8" text-anchor="middle" font-size="12">{{ maxAge <= 24 ? 'Age (months)' : 'Age (years)' }}</text>
      <text :transform="`translate(14 ${(T + H - B) / 2}) rotate(-90)`" text-anchor="middle" font-size="12">{{ title }} ({{ unit }})</text>
    </g>
    <g fill="none">
      <path v-for="[k, c, d] in lines" :key="k" :d="path(curves[k] || [])" :stroke="c" :stroke-dasharray="d" :stroke-width="k === '0' ? 2 : 1.4" />
    </g>
    <g font-size="10.5" font-weight="600">
      <text v-for="[k, c] in lines" :key="'l' + k" :x="W - R + 4" :y="sy((curves[k] || []).filter(([m]) => m <= maxAge).slice(-1)[0]?.[1] ?? 0) + 3" :fill="c">{{ endLabel(k) }}</text>
    </g>
    <path :d="ptsPath" fill="none" stroke="#111" stroke-width="1.6" />
    <g v-for="(p, i) in shown" :key="i"><circle :cx="sx(p.age)" :cy="sy(p.v)" r="5" fill="#111" stroke="#fff" stroke-width="1.5"><title>{{ p.label }}</title></circle></g>
  </svg>
</template>
<style scoped>
.gchart { width: 100%; height: auto; border: 1px solid var(--line, #e5e7eb); border-radius: 8px; background: #fff; }
</style>
