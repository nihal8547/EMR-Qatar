<script setup lang="ts">
// "Send on WhatsApp" button. type: welcome | result | bill | thanks. The HMS posts to n8n, which sends it through the Evolution API.
const props = defineProps<{ type: 'welcome' | 'result' | 'bill' | 'thanks'; payload: Record<string, any>; label?: string; sm?: boolean }>()
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const busy = ref(false)
async function go() {
  const what = { welcome: 'the welcome message', result: 'the result report', bill: 'the bill', thanks: 'the thank-you message' }[props.type]
  if (!confirm(`Send ${what} to the patient on WhatsApp?`)) return
  busy.value = true
  try { await api('/notify/send', { method: 'POST', body: { type: props.type, ...props.payload } }); ok('Sent on WhatsApp') }
  catch (e: any) { err(e) } finally { busy.value = false }
}
</script>
<template>
  <button v-if="can('notify.send')" class="no-print" :class="{ sm }" :disabled="busy" title="Send on WhatsApp" @click.stop="go">{{ busy ? 'Sending…' : (label || '📲 WhatsApp') }}</button>
</template>
