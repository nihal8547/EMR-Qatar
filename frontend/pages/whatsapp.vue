<script setup lang="ts">
definePageMeta({ perm: 'whatsapp.manage' })
const { api } = useApi(); const { ok, err } = useUi()
const cfg = ref<any>(null); const st = ref<any>({ state: 'checking' }); const qr = ref<string | null>(null); const pairing = ref<string | null>(null)
const busy = ref(false); const key = ref(''); const testPhone = ref(''); const recent = ref<any[]>([])
let timer: any = null
async function loadCfg() { cfg.value = await api('/whatsapp/config') }
async function loadStatus() { try { st.value = await api('/whatsapp/status') } catch (e: any) { st.value = { state: 'error', detail: e?.message } } if (st.value.state === 'open') { qr.value = null; pairing.value = null; stop() } }
async function loadRecent() { try { recent.value = (await api('/notify/status')).recent } catch { recent.value = [] } }
function poll() { stop(); timer = setInterval(loadStatus, 3000) }
function stop() { if (timer) { clearInterval(timer); timer = null } }
onMounted(async () => { try { await loadCfg(); await loadStatus(); await loadRecent() } catch (e) { err(e) } })
onBeforeUnmount(stop)
async function saveCfg() {
  busy.value = true
  try { const b: any = { ...cfg.value }; if (key.value) b.evolution_api_key = key.value; await api('/whatsapp/config', { method: 'PUT', body: b }); key.value = ''; ok('Saved'); await loadCfg(); await loadStatus() } catch (e) { err(e) } finally { busy.value = false }
}
async function connect() {
  busy.value = true
  try { const r = await api('/whatsapp/connect', { method: 'POST', body: {} }); if (r.state === 'open') { ok('WhatsApp is already connected'); await loadStatus() } else { qr.value = r.qr; pairing.value = r.pairing_code; poll() } } catch (e) { err(e) } finally { busy.value = false }
}
async function disconnect() {
  if (!confirm('Disconnect the WhatsApp number? Messages stop until it is connected again.')) return
  busy.value = true
  try { await api('/whatsapp/disconnect', { method: 'POST', body: {} }); ok('Disconnected'); qr.value = null; await loadStatus() } catch (e) { err(e) } finally { busy.value = false }
}
async function sendTest() {
  busy.value = true
  try { await api('/whatsapp/test', { method: 'POST', body: { phone: testPhone.value } }); ok('Test message sent') } catch (e) { err(e) } finally { busy.value = false }
}
const label = computed(() => ({ open: 'Connected', connecting: 'Waiting for QR scan', close: 'Not connected', 'no-instance': 'Not created yet', 'not-configured': 'Not configured', error: 'Error', checking: 'Checking…' } as any)[st.value.state] || st.value.state)
const badge = computed(() => (st.value.state === 'open' ? 'green' : st.value.state === 'error' ? 'red' : 'amber'))
const qrSrc = computed(() => (qr.value ? (qr.value.startsWith('data:') ? qr.value : `data:image/png;base64,${qr.value}`) : ''))
</script>
<template>
  <div>
    <div class="bar"><h1>WhatsApp Connect <span class="muted small">· the centre number used for patient messages</span></h1><div class="sp"></div><button @click="loadStatus(); loadRecent()">↻ Refresh</button></div>
    <div v-if="cfg" class="grid2">
      <div class="card">
        <div class="bar" style="margin:0"><h2 style="margin:0">Connection</h2><div class="sp"></div><span class="badge" :class="badge">{{ label }}</span></div>
        <p class="muted small">Instance <b>{{ cfg.whatsapp_instance }}</b>. Open WhatsApp on the centre phone → Linked devices → Link a device, then scan the QR.</p>
        <div v-if="st.detail" class="alert err">{{ st.detail }}</div>
        <div class="bar">
          <button v-if="st.state !== 'open'" class="p" :disabled="busy || st.state === 'not-configured'" @click="connect">📲 Connect WhatsApp (show QR)</button>
          <button v-if="st.state === 'open'" class="danger" :disabled="busy" @click="disconnect">Disconnect</button>
        </div>
        <div v-if="qrSrc" style="text-align:center;margin-top:8px"><img :src="qrSrc" alt="WhatsApp QR" style="width:260px;height:260px;background:#fff;padding:8px;border:1px solid #000" /><div v-if="pairing" class="small">Pairing code: <b>{{ pairing }}</b></div><div class="muted small">The code refreshes; this page checks the link every 3 seconds.</div></div>
        <div v-if="st.state === 'open'" class="bar" style="margin-top:12px"><input v-model="testPhone" placeholder="Mobile for a test message, e.g. 55123456" style="max-width:280px" /><button :disabled="busy || !testPhone" @click="sendTest">Send test</button></div>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Settings</h2>
        <label>Evolution API URL<input v-model="cfg.evolution_base_url" placeholder="https://evolution.example.com" /></label>
        <label>Instance name<input v-model="cfg.whatsapp_instance" placeholder="qatar-hms" /></label>
        <label>Evolution API key <span class="muted small">{{ cfg.key_from_env ? '(set by server environment)' : cfg.evolution_api_key_set ? '(saved – leave empty to keep)' : '(not set)' }}</span><input v-model="key" type="password" autocomplete="new-password" :disabled="cfg.key_from_env" /></label>
        <h3>Automatic messages (n8n)</h3>
        <label class="chk"><input type="checkbox" v-model="cfg.n8n_enabled" /> Send WhatsApp messages (welcome, result ready, thank-you)</label>
        <label class="chk"><input type="checkbox" v-model="cfg.n8n_send_bill_on_complete" /> Attach the bill to the thank-you message</label>
        <label>n8n webhook base URL<input v-model="cfg.n8n_webhook_base" placeholder="https://n8n.example.com/webhook/hms" /></label>
        <label>Public URL of this HMS <span class="muted small">(PDF links; must open from the internet)</span><input v-model="cfg.public_base_url" placeholder="https://hms.example.com" /></label>
        <div v-if="!cfg.n8n_secret_set" class="alert warn">Server environment N8N_WEBHOOK_SECRET is not set. Set it (same value as in the n8n workflows) and restart.</div>
        <div class="bar"><button class="p" :disabled="busy" @click="saveCfg">Save settings</button></div>
      </div>
    </div>
    <div class="card" v-if="recent.length"><h2 style="margin-top:0">Recent messages</h2>
      <table><thead><tr><th>When</th><th>Event</th><th>Status</th><th>Detail</th></tr></thead><tbody><tr v-for="r in recent" :key="r.id"><td>{{ fdt(r.created_at) }}</td><td>{{ r.reference }}</td><td><span class="badge" :class="r.status === 'sent' ? 'green' : 'amber'">{{ r.status }}</span></td><td class="small">{{ r.message }}</td></tr></tbody></table></div>
  </div>
</template>
