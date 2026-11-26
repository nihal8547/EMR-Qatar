<script setup lang="ts">
const { state, logout } = useAuth()
const { toasts } = useUi()
const route = useRoute()
const open = ref(false)
const q = ref('')
const closed = ref<Record<string, boolean>>({})
const menu = computed(() => {
  const s = q.value.trim().toLowerCase()
  return state.value.menu
    .map((g) => ({ ...g, items: s ? g.items.filter((i) => i.label.toLowerCase().includes(s)) : g.items }))
    .filter((g) => g.items.length)
})
const active = (to: string) => (to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(to + '/'))
// the group holding the current page stays open
const holdsActive = (g: any) => g.items.some((i: any) => active(i.to))
const showItems = (g: any) => (q.value ? true : closed.value[g.key] === undefined ? holdsActive(g) : closed.value[g.key] === false)
const initials = computed(() => (state.value.user?.full_name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase())
const crumb = computed(() => { for (const g of state.value.menu) for (const i of g.items) if (active(i.to)) return { mod: g.key === 'dashboard' ? '' : g.label, page: i.label }; const p = route.path
  if (p.startsWith('/patient/')) return { mod: 'Front Office', page: 'Patient 360' }
  if (p.startsWith('/print/lab-labels')) return { mod: 'Laboratory', page: 'Tube labels' }
  if (p.startsWith('/print/')) return { mod: '', page: 'Print' }
  return { mod: '', page: '' } })
watch(() => route.path, () => { open.value = false })
// Paper size for every print page (A4 / A5 / as designed). Remembered per browser.
const isPrint = computed(() => route.path.startsWith('/print/') && !route.path.startsWith('/print/lab-labels'))
const paper = ref<'auto' | 'a4' | 'a5'>('auto')
const orient = ref<'portrait' | 'landscape'>('portrait')
onMounted(() => { try { const v = localStorage.getItem('hms.paper'); if (v === 'a4' || v === 'a5' || v === 'auto') paper.value = v; if (localStorage.getItem('hms.orient') === 'landscape') orient.value = 'landscape' } catch { /* storage unavailable */ } })
watch([paper, orient], () => { try { localStorage.setItem('hms.paper', paper.value); localStorage.setItem('hms.orient', orient.value) } catch { /* ignore */ } })
const paperCls = computed(() => (isPrint.value && paper.value !== 'auto' ? `paper-${paper.value} ${orient.value}` : ''))
useHead({ style: [{ key: 'paper', innerHTML: computed(() => (isPrint.value && paper.value !== 'auto' ? `@media print{@page{size:${paper.value.toUpperCase()} ${orient.value};margin:8mm}}` : '')) }] })
</script>
<template>
  <div class="app">
    <div v-if="open" class="scrim" @click="open = false"></div>
    <aside class="side" :class="{ open }">
      <div class="brand">
        <div class="logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>
        <div><div class="bname">Qatar HMS</div><div class="bsub">Medical Centre</div></div>
      </div>
      <div class="side-search"><input v-model="q" placeholder="Search menu" /></div>
      <nav class="nav">
        <NuxtLink to="/" class="nav-item top" :class="{ active: route.path === '/' }" v-if="state.menu.find((g) => g.key === 'dashboard')"><NavIcon name="dashboard" /><span>Dashboard</span></NuxtLink>
        <template v-for="g in menu.filter((x) => x.key !== 'dashboard')" :key="g.key">
          <button class="grp" :class="{ has: holdsActive(g) }" @click="closed[g.key] = showItems(g) ? true : false">
            <NavIcon :name="g.key" /><span class="gl">{{ g.label }}</span>
            <svg class="chev" :class="{ rot: showItems(g) }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
          </button>
          <div v-show="showItems(g)" class="sub">
            <NuxtLink v-for="i in g.items" :key="i.to" :to="i.to" class="nav-sub" :class="{ active: active(i.to) }">{{ i.label }}</NuxtLink>
          </div>
        </template>
      </nav>
      <div class="side-foot">
        <NuxtLink to="/account" class="me"><div class="av">{{ initials }}</div><div class="who"><div class="wn">{{ state.user?.full_name }}</div><div class="wr">{{ state.user?.role }}</div></div></NuxtLink>
        <button class="out" title="Log out" @click="logout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="burger" @click="open = !open" aria-label="Menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <div class="crumb"><template v-if="crumb.mod"><span class="mod">{{ crumb.mod }}</span><span class="sep mod">›</span></template><b>{{ crumb.page }}</b></div>
        <div class="sp"></div>
        <span class="chip">{{ new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
      </header>
      <main class="content" :class="paperCls"><slot /></main>
      <div v-if="isPrint" class="paperbar no-print"><span class="small">Paper</span>
        <button v-for="o in ['auto', 'a4', 'a5']" :key="o" class="sm" :class="{ p: paper === o }" @click="paper = o as any">{{ o === 'auto' ? 'As designed' : o.toUpperCase() }}</button>
        <template v-if="paper !== 'auto'"><span class="small">·</span><button class="sm" :class="{ p: orient === 'portrait' }" @click="orient = 'portrait'">Portrait</button><button class="sm" :class="{ p: orient === 'landscape' }" @click="orient = 'landscape'">Landscape</button></template></div>
    </div>
    <div class="toasts"><div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div></div>
  </div>
</template>
