<script setup lang="ts">
definePageMeta({ perm: 'dashboard.view' })
const { api } = useApi(); const { err } = useUi(); const { state } = useAuth()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api('/dashboard') } catch (e) { err(e) } })
const fmt = (c: any) => (c.fmt === 'money' ? money(c.value) : c.value)
const max = computed(() => Math.max(1, ...((d.value?.lists.revenue_7d || []).map((r: any) => Number(r.amount)))))
</script>
<template>
  <div>
    <h1>Dashboard</h1>
    <p class="muted">Welcome, {{ state.user?.full_name }}.</p>
    <div v-if="!d" class="empty">Loading…</div>
    <template v-else>
      <div class="cards"><div v-for="c in d.cards" :key="c.key" class="kpi"><div class="v">{{ fmt(c) }}</div><div class="l">{{ c.label }}</div></div></div>
      <div class="grid g2">
        <div v-if="d.lists.revenue_7d" class="card">
          <h2>Net collections, last 7 days (QAR)</h2>
          <div v-for="r in d.lists.revenue_7d" :key="r.day" style="display:flex;gap:8px;align-items:center;margin:4px 0">
            <span class="small muted" style="width:78px">{{ r.day }}</span>
            <div style="flex:1;background:#eef1f5;border-radius:4px;height:16px"><div :style="{ width: (Number(r.amount) / max * 100) + '%', background: 'var(--maroon)', height: '16px', borderRadius: '4px' }"></div></div>
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
