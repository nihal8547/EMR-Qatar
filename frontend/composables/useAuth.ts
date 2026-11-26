type MenuItem = { label: string; to: string }
type MenuGroup = { key: string; label: string; icon: string; items: MenuItem[] }
type AuthState = {
  loaded: boolean
  user: null | { id: number; username: string; full_name: string; role: string; patient_id: number | null; isPortal: boolean; must_change_password?: boolean; mfa_enabled?: boolean; mfa_required?: boolean }
  perms: string[]
  menu: MenuGroup[]
}

export function useAuth() {
  const state = useState<AuthState>('auth', () => ({ loaded: false, user: null, perms: [], menu: [] }))
  const { api } = useApi()

  const can = (p: string) => state.value.perms.includes(p)
  const reset = () => { state.value = { loaded: false, user: null, perms: [], menu: [] } }

  async function load() {
    const me: any = await api('/auth/me')
    state.value = { loaded: true, user: me.user, perms: me.permissions, menu: me.menu }
  }
  async function login(username: string, password: string, code?: string) {
    const r: any = await api('/auth/login', { method: 'POST', body: { username, password, code: code || undefined } })
    clearOfflineData() // never show a previous user's cached patient data
    localStorage.setItem(TOKEN_KEY, r.token)
    await load()
  }
  function logout() {
    if (localStorage.getItem(TOKEN_KEY)) api('/auth/logout', { method: 'POST' }).catch(() => {}) // end the session on the server too
    localStorage.removeItem(TOKEN_KEY)
    clearOfflineData()
    reset()
    navigateTo('/login')
  }
  return { state, can, load, login, logout, reset }
}
