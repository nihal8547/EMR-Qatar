<script setup lang="ts">
definePageMeta({ perm: 'dashboard.view' })
const { api } = useApi(); const { err } = useUi(); const { state } = useAuth()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api('/dashboard') } catch (e) { err(e) } })
const fmt = (c: any) => (c.fmt === 'money' ? money(c.value) : c.value)
const groups: [string, string[]][] = [
  ['Patient flow', ['visits_today', 'waiting', 'with_doctor', 'appts_today']],
  ['Revenue', ['collected_today', 'patient_due']],
  ['Diagnostics & pharmacy', ['lab_pending', 'lab_critical', 'imaging_pending', 'rx_pending']],
]
const sections = computed(() => {
  const cards = d.value?.cards || []; const used = new Set<string>(); const out: any[] = []
  for (const [t, keys] of groups) { const cs = cards.filter((c: any) => keys.includes(c.key)); cs.forEach((c: any) => used.add(c.key)); if (cs.length) out.push({ t, cs }) }
  const rest = cards.filter((c: any) => !used.has(c.key)); if (rest.length) out.push({ t: 'Other', cs: rest })
  return out
})
const hour = new Date().getHours(); const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
const max = computed(() => Math.max(1, ...((d.value?.lists.revenue_7d || []).map((r: any) => Number(r.amount)))))
</script>
<template>
  <div>
    <div class="bar"><div><h1>{{ greet }}, {{ state.user?.full_name }}</h1><div class="page-sub">Here is what is happening at the centre today.</div></div></div>
    <div v-if="!d" class="empty loading">Loading…</div>
    <template v-else>
      <template v-for="g in sections" :key="g.t"><div class="sect">{{ g.t }}</div>
        <div class="cards"><div v-for="c in g.cs" :key="c.key" class="kpi"><div class="v">{{ fmt(c) }}</div><div class="l">{{ c.label }}</div></div></div></template>
      <div class="sect">Activity</div>
      <div class="grid g2">
        <div v-if="d.lists.revenue_7d" class="card">
          <h2>Net collections, last 7 days (QAR)</h2>
          <div v-for="r in d.lists.revenue_7d" :key="r.day" style="display:flex;gap:8px;align-items:center;margin:4px 0">
            <span class="small muted" style="width:78px">{{ r.day }}</span>
            <div style="flex:1;background:#efefef;border-radius:6px;height:14px"><div :style="{ width: (Number(r.amount) / max * 100) + '%', background: 'var(--maroon)', height: '14px', borderRadius: '6px' }"></div></div>
            <span class="small" style="width:80px;text-align:right">{{ money(r.amount) }}</span>
          </div>
        </div>
        <div v-if="d.lists.recent_visits" class="card">
          <h2>Recent visits</h2>
          <table><tbody><tr v-for="v in d.lists.recent_visits" :key="v.id"><td>{{ v.visit_no }}</td><td>{{ v.full_name }}<div class="small muted">{{ v.mrn }}</div></td><td>{{ v.doctor }}</td><td><span class="badge">{{ v.status }}</span></td></tr></tbody></table>
        </div>
      </div>
    </template>
  </div>
</template>
