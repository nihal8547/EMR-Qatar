<script setup lang="ts">
// Code 39 barcode as inline SVG (A-Z 0-9 - . space $ / + %)
const props = defineProps<{ value: string; height?: number }>()
const P: Record<string, string> = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn' }
const bars = computed(() => {
  const txt = '*' + String(props.value || '').toUpperCase().replace(/[^0-9A-Z\-. ]/g, '-') + '*'
  const out: { x: number; w: number }[] = []; let x = 0
  for (const ch of txt) { const p = P[ch]; for (let i = 0; i < 9; i++) { const w = p[i] === 'w' ? 3 : 1; if (i % 2 === 0) out.push({ x, w }); x += w } x += 1 }
  return { out, width: x }
})
</script>
<template>
  <svg :viewBox="`0 0 ${bars.width} 40`" :height="height || 44" preserveAspectRatio="none" style="width:100%;max-width:260px"><rect v-for="(b, i) in bars.out" :key="i" :x="b.x" y="0" :width="b.w" height="40" fill="#000" /></svg>
</template>
