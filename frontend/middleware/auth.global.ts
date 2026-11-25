export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const { state, load, can } = useAuth()
  const token = localStorage.getItem(TOKEN_KEY)
  if (to.path === '/login') {
    if (token) { try { if (!state.value.loaded) await load(); return navigateTo(state.value.user?.isPortal ? '/portal' : '/') } catch { localStorage.removeItem(TOKEN_KEY) } }
    return
  }
  if (!token) return navigateTo('/login')
  if (!state.value.loaded) {
    try { await load() } catch { localStorage.removeItem(TOKEN_KEY); return navigateTo('/login') }
  }
  const u = state.value.user
  if (u?.isPortal && to.path !== '/portal') return navigateTo('/portal')
  const need = to.meta.perm as string | undefined
  if (need && !can(need)) return navigateTo(u?.isPortal ? '/portal' : '/forbidden')
})
