export type Toast = { id: number; kind: 'ok' | 'err'; text: string }
export function useUi() {
  const toasts = useState<Toast[]>('toasts', () => [])
  let n = 0
  function toast(text: string, kind: 'ok' | 'err' = 'ok') {
    const id = ++n
    toasts.value.push({ id, kind, text })
    setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, kind === 'err' ? 7000 : 3500)
  }
  const ok = (t: string) => toast(t, 'ok')
  const err = (e: any) => toast(typeof e === 'string' ? e : e?.message || 'Something went wrong', 'err')
  return { toasts, toast, ok, err }
}

export const money = (n: any) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
export const fdate = (s: any) => (s ? String(s).slice(0, 10) : '')
export const fdt = (s: any) => {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}
export const todayStr = () => new Date().toISOString().slice(0, 10)

const GREEN = ['paid', 'completed', 'dispensed', 'approved', 'validated', 'active', 'eligible', 'accepted', 'posted', 'closed', 'done', 'reported', 'resulted', 'confirmed', 'arrived', 'applied', 'received', 'normal', 'available', 'resolved', 'released', 'fit']
const RED = ['cancelled', 'rejected', 'failed', 'expired', 'scrub failed', 'not eligible', 'unpaid', 'no-show', 'critical high', 'critical low', 'suspended', 'blocked', 'resigned', 'void']
const AMBER = ['pending', 'draft', 'requested', 'open', 'ordered', 'submitted', 'booked', 'partial', 'partially paid', 'partially dispensed', 'in progress', 'collected', 'registered', 'triage', 'ready', 'appealed', 'scheduled', 'not checked', 'high', 'low', 'on leave', 'partially approved']
export function badgeClass(v: any) {
  const s = String(v ?? '').toLowerCase()
  if (GREEN.includes(s)) return 'green'
  if (RED.includes(s)) return 'red'
  if (AMBER.includes(s)) return 'amber'
  if (['with doctor', 'diagnostics', 'pharmacy', 'billing'].includes(s)) return 'blue'
  return 'grey'
}
