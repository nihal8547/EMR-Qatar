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

export function useApi() {
  async function api<T = any>(path: string, opts: { method?: string; body?: any; query?: Record<string, any>; raw?: boolean } = {}): Promise<T> {
    const token = import.meta.client ? localStorage.getItem(TOKEN_KEY) : null
    const query: Record<string, any> = {}
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== null && v !== '') query[k] = v
    try {
      return await $fetch<T>(`/api${path}`, {
        method: (opts.method || 'GET') as any,
        body: opts.body,
        query,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: opts.raw ? 'blob' : undefined,
      } as any) as T
    } catch (e: any) {
      const status = e?.response?.status || e?.statusCode || 0
      const data = e?.data || e?.response?._data
      if (status === 401 && path !== '/auth/login') {
        if (import.meta.client) localStorage.removeItem(TOKEN_KEY)
        useAuth().reset()
        await navigateTo('/login')
      }
      const msg = (data && typeof data === 'object' && data.error) || (status === 0 ? 'Cannot reach the server. Check your connection.' : 'Request failed')
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
