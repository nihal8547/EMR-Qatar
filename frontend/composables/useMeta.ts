// Resource metadata (fields, actions, what this role may do). Cached for the session.
export function useMeta() {
  const meta = useState<Record<string, any> | null>('meta', () => null)
  const { api } = useApi()
  async function ensure() {
    if (!meta.value) meta.value = await api('/meta')
    return meta.value as Record<string, any>
  }
  const clear = () => { meta.value = null }
  return { meta, ensure, clear }
}
