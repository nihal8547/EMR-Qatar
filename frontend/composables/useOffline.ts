// Offline support: online/offline state + a small outbox for the few writes that are safe to save on the device and send later.
// Everything else (payments, refunds, day close, results, ...) needs a live connection so nothing can be double-posted or lost silently.
export type OutboxItem = { id: string; method: string; path: string; body: any; label: string; at: number; error?: string }
const KEY = 'hms_outbox'
const SAFE: Array<{ re: RegExp; label: (b: any) => string }> = [
  { re: /^\/r\/patients$/, label: (b) => `New patient: ${b?.full_name || ''}` },
  { re: /^\/r\/vitals$/, label: (b) => `Vitals (visit ${b?.visit_id || ''})` },
]
export const queueable = (method: string, path: string) => method === 'POST' && SAFE.some((s) => s.re.test(path))
const read = (): OutboxItem[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }

export function useOffline() {
  const online = useState<boolean>('online', () => true)
  const items = useState<OutboxItem[]>('outbox', () => [])
  const syncing = useState<boolean>('outbox_sync', () => false)
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items.value)) } catch { /* storage full */ } }
  function load() { if (import.meta.client) { items.value = read(); online.value = navigator.onLine } }
  function enqueue(method: string, path: string, body: any) {
    const rule = SAFE.find((s) => s.re.test(path))
    items.value = [...items.value, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, method, path, body, label: rule ? rule.label(body) : path, at: Date.now() }]
    save()
  }
  function discard(id: string) { items.value = items.value.filter((i) => i.id !== id); save() }
  async function sync() {
    if (syncing.value || !items.value.length || !navigator.onLine) return
    syncing.value = true
    const token = localStorage.getItem(TOKEN_KEY)
    try {
      for (const it of [...items.value]) {
        if (it.error) continue                       // failed for a data reason: wait for a person (Retry / Discard)
        try {
          await $fetch(`/api${it.path}`, { method: it.method as any, body: it.body, headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 30000 })
          items.value = items.value.filter((x) => x.id !== it.id); save()
        } catch (e: any) {
          const st = e?.response?.status || e?.statusCode || 0
          if (!st || st >= 500 || st === 401) break  // still offline / server down / signed out: try again later
          const m = e?.data?.error || 'Rejected by the server'
          items.value = items.value.map((x) => (x.id === it.id ? { ...x, error: String(m) } : x)); save()
        }
      }
    } finally { syncing.value = false }
  }
  function retry(id: string) { items.value = items.value.map((x) => (x.id === id ? { ...x, error: undefined } : x)); save(); sync() }
  return { online, items, syncing, load, enqueue, discard, sync, retry }
}
