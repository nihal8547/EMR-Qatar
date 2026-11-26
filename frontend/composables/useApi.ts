// Thin fetch wrapper: adds the JWT, turns API errors into readable Error objects, logs out on 401.
export class ApiError extends Error {
  status: number
  extra: any
  constructor(message: string, status: number, extra?: any) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const TOKEN_KEY = 'hms_token'

/** Forget every cached answer (called at logout: patient data must not stay on a shared computer). */
export function clearOfflineData() {
  if (import.meta.client) navigator.serviceWorker?.controller?.postMessage('clear-data')
}

export function useApi() {
  async function api<T = any>(path: string, opts: { method?: string; body?: any; query?: Record<string, any>; raw?: boolean } = {}): Promise<T> {
    const token = import.meta.client ? localStorage.getItem(TOKEN_KEY) : null
    const query: Record<string, any> = {}
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== null && v !== '') query[k] = v
    const method = (opts.method || 'GET').toUpperCase()
    try {
      // Reads are retried (twice) on network drops / gateway errors; writes are never retried (no double posting).
      return await $fetch<T>(`/api${path}`, {
        method: method as any,
        body: opts.body,
        query,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: opts.raw ? 'blob' : undefined,
        timeout: opts.raw ? 120000 : 40000,
        retry: method === 'GET' ? 2 : 0,
        retryDelay: 400,
        retryStatusCodes: [502, 503, 504],
      } as any) as T
    } catch (e: any) {
      const status = e?.response?.status || e?.statusCode || 0
      const data = e?.data || e?.response?._data
      const offline = import.meta.client && (!navigator.onLine || (status === 0 && !/timeout|aborted/i.test(String(e?.message)) && e?.name !== 'TimeoutError'))
      if (offline && method !== 'GET') {
        if (queueable(method, path)) { useOffline().enqueue(method, path, opts.body); return { queued: true } as any }   // saved on this device, sent when online
        throw new ApiError('You are offline. This action needs a connection, so nothing was saved. Try again when the connection is back.', 0)
      }
      // Restricted roles (doctor, nurse) opening a record of a patient who is not theirs: ask for a reason once (written to the audit log) and retry.
      if (status === 403 && data?.extra?.breakglass && method === 'GET' && import.meta.client && !opts.query?.breakglass && !path.startsWith('/patients/')) {
        const reason = window.prompt('This patient is not under your care.\nEnter the reason for opening this record (at least 8 characters). It is recorded in the audit log.')
        if (reason && reason.trim().length >= 8) return await api<T>(path, { ...opts, query: { ...(opts.query || {}), breakglass: reason.trim() } })
      }
      if (status === 401 && path !== '/auth/login') {
        if (import.meta.client) localStorage.removeItem(TOKEN_KEY)
        clearOfflineData()
        useAuth().reset()
        await navigateTo('/login')
      }
      const msg = (data && typeof data === 'object' && data.error) || (status === 0 ? (import.meta.client && !navigator.onLine ? 'You are offline. Showing only what was opened before.' : e?.name === 'TimeoutError' || /timeout|aborted/i.test(String(e?.message)) ? 'The server took too long to answer. Please try again.' : 'Cannot reach the server. Check your connection.') : status >= 500 ? 'Server problem. Please try again in a moment.' : 'Request failed')
      throw new ApiError(String(msg), status, data && data.extra)
    }
  }
  return { api }
}

export async function downloadCsv(path: string, query: Record<string, any>, filename: string) {
  const { api } = useApi()
  const blob: any = await api(path, { query: { ...query, format: 'csv' }, raw: true })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
