<script setup lang="ts">
definePageMeta({ perm: 'admin.roles' })
const { api } = useApi(); const { ok, err } = useUi(); const { ensure, meta } = useMeta()
const data = ref<any>(null); const roleId = ref<number | null>(null); const sel = ref<Set<string>>(new Set()); const dirty = ref(false); const filter = ref(''); const busy = ref(false)
async function load() { try { data.value = await api('/admin/matrix'); await ensure(); if (!roleId.value) roleId.value = data.value.roles[0]?.id ?? null; pick() } catch (e) { err(e) } }
function pick() { sel.value = new Set(data.value?.granted[roleId.value as number] || []); dirty.value = false }
onMounted(load); watch(roleId, () => { if (dirty.value && !confirm('Discard unsaved changes?')) return; pick() })
const BASIC = ['view', 'create', 'edit', 'delete']
const groups = computed(() => {
  const g: Record<string, any> = {}
  for (const p of data.value?.permissions || []) { (g[p.group] = g[p.group] || { key: p.group, perms: {} }).perms[p.action] = p }
  const f = filter.value.trim().toLowerCase()
  return Object.values(g).filter((x: any) => !f || x.key.includes(f) || (meta.value?.[x.key]?.label || '').toLowerCase().includes(f)).map((x: any) => ({ ...x, label: meta.value?.[x.key]?.label || x.key, other: Object.keys(x.perms).filter((a) => !BASIC.includes(a)) }))
})
const has = (c: string) => sel.value.has(c)
function toggle(c: string) { const s = new Set(sel.value); if (s.has(c)) s.delete(c); else s.add(c); sel.value = s; dirty.value = true }
function rowAll(g: any, on: boolean) { const s = new Set(sel.value); for (const a of Object.keys(g.perms)) { const c = g.perms[a].code; if (on) s.add(c); else s.delete(c) } sel.value = s; dirty.value = true }
function colAll(a: string, on: boolean) { const s = new Set(sel.value); for (const g of groups.value) if (g.perms[a]) { if (on) s.add(g.perms[a].code); else s.delete(g.perms[a].code) } sel.value = s; dirty.value = true }
async function save() { busy.value = true; try { await api(`/admin/roles/${roleId.value}/permissions`, { method: 'PUT', body: { permissions: [...sel.value] } }); ok('Saved. The change applies to users of this role within about 30 seconds.'); await load() } catch (e) { err(e) } finally { busy.value = false } }
const role = computed(() => data.value?.roles.find((r: any) => r.id === roleId.value))
</script>
<template>
  <div v-if="data">
    <div class="bar"><h1>Role & Permission Matrix</h1><div class="sp"></div><NuxtLink to="/r/roles/new" class="btn">+ New role</NuxtLink><NuxtLink to="/r/users" class="btn">Users</NuxtLink></div>
    <div class="card"><div class="bar" style="margin:0"><label class="f" style="margin:0">Role</label><select v-model.number="roleId" style="width:240px"><option v-for="r in data.roles" :key="r.id" :value="r.id">{{ r.name }}</option></select><span class="muted small">{{ role?.description }}</span><div class="sp"></div>
      <input v-model="filter" placeholder="Filter resources…" style="width:200px" /><span class="small muted">{{ sel.size }} permission(s)</span><button class="p" :disabled="!dirty || busy" @click="save">Save changes</button></div></div>
    <div class="card flush"><div class="tbl-wrap"><table>
      <thead><tr><th>Area</th><th v-for="a in BASIC" :key="a" class="nowrap">{{ a }} <button class="sm" @click="colAll(a, true)">all</button> <button class="sm" @click="colAll(a, false)">none</button></th><th>Special actions</th><th></th></tr></thead>
      <tbody><tr v-for="g in groups" :key="g.key"><td><b>{{ g.label }}</b><div class="small muted">{{ g.key }}</div></td>
        <td v-for="a in BASIC" :key="a"><input v-if="g.perms[a]" type="checkbox" :checked="has(g.perms[a].code)" @change="toggle(g.perms[a].code)" /></td>
        <td><label v-for="a in g.other" :key="a" style="margin-right:12px" :title="g.perms[a].description"><input type="checkbox" :checked="has(g.perms[a].code)" @change="toggle(g.perms[a].code)" /> {{ a }}</label></td>
        <td class="nowrap"><button class="sm" @click="rowAll(g, true)">all</button> <button class="sm" @click="rowAll(g, false)">none</button></td></tr></tbody></table></div></div>
    <p class="muted small">Pages and sidebar items appear only when the role has the matching permission. The server enforces the same rules on every request.</p>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
