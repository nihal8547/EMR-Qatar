<script setup lang="ts">
const { api } = useApi(); const { ok, err } = useUi(); const { state, load, logout } = useAuth()
const f = reactive({ current_password: '', new_password: '', again: '' })
const forced = computed(() => !!state.value.user?.must_change_password)
async function save() {
  if (f.new_password !== f.again) return err('The new passwords do not match')
  try {
    await api('/auth/change-password', { method: 'POST', body: { current_password: f.current_password, new_password: f.new_password } })
    ok('Password changed. Other devices were signed out.'); Object.assign(f, { current_password: '', new_password: '', again: '' }); await load()
    if (!state.value.user?.mfa_required) navigateTo('/')
  } catch (e) { err(e) }
}
/* two-factor */
const setup = ref<any>(null); const mfaCode = ref(''); const off = reactive({ password: '', code: '' })
async function startMfa() { try { setup.value = await api('/auth/mfa/setup', { method: 'POST' }) } catch (e) { err(e) } }
async function enableMfa() {
  try { await api('/auth/mfa/enable', { method: 'POST', body: { code: mfaCode.value } }); ok('Two-factor authentication is on'); setup.value = null; mfaCode.value = ''; await load(); if (!forced.value) navigateTo('/') } catch (e) { err(e) }
}
async function disableMfa() {
  try { await api('/auth/mfa/disable', { method: 'POST', body: { ...off } }); ok('Two-factor authentication is off'); off.password = ''; off.code = ''; await load() } catch (e) { err(e) }
}
async function everywhere() { try { await api('/auth/logout-all', { method: 'POST' }); ok('Signed out everywhere'); logout() } catch (e) { err(e) } }
</script>
<template>
  <div>
    <h1>My account</h1>
    <div v-if="forced" class="alert err" style="max-width:460px">You must set a new password before you can continue.</div>
    <div v-else-if="state.user?.mfa_required" class="alert err" style="max-width:460px">Your role requires two-factor authentication. Set it up below to continue.</div>
    <div class="card" style="max-width:460px">
      <p><b>{{ state.user?.full_name }}</b> · {{ state.user?.username }} · <span class="badge blue">{{ state.user?.role }}</span></p>
      <h3>Change password</h3>
      <div class="field"><label class="f">Current password</label><input type="password" v-model="f.current_password" autocomplete="current-password" /></div>
      <div class="field"><label class="f">New password (10+ characters, letters and numbers)</label><input type="password" v-model="f.new_password" autocomplete="new-password" /></div>
      <div class="field"><label class="f">Repeat new password</label><input type="password" v-model="f.again" autocomplete="new-password" /></div>
      <button class="p" @click="save">Change password</button>
    </div>
    <div class="card" style="max-width:460px;margin-top:14px">
      <h3>Two-factor authentication</h3>
      <template v-if="state.user?.mfa_enabled">
        <p class="muted">On. You enter a 6-digit code from your authenticator app at sign in.</p>
        <div class="field"><label class="f">Password</label><input type="password" v-model="off.password" autocomplete="current-password" /></div>
        <div class="field"><label class="f">Current code</label><input v-model="off.code" inputmode="numeric" maxlength="6" /></div>
        <button @click="disableMfa">Turn off</button>
      </template>
      <template v-else-if="setup">
        <p class="muted">Scan with Google Authenticator, Microsoft Authenticator or similar, then enter the code it shows.</p>
        <img :src="setup.qr" alt="QR code" width="200" height="200" style="background:#fff;border:1px solid var(--line,#ddd);border-radius:8px" />
        <p class="muted" style="word-break:break-all">Or type this key: <b>{{ setup.secret }}</b></p>
        <div class="field"><label class="f">6-digit code</label><input v-model="mfaCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" /></div>
        <button class="p" :disabled="mfaCode.length !== 6" @click="enableMfa">Turn on</button>
      </template>
      <template v-else>
        <p class="muted">Adds a second step at sign in. Strongly recommended for administrators and accountants.</p>
        <button class="p" @click="startMfa">Set up</button>
      </template>
    </div>
    <div class="card" style="max-width:460px;margin-top:14px">
      <h3>Sessions</h3>
      <p class="muted">Lost a device or used a shared computer? Sign out everywhere.</p>
      <button @click="everywhere">Sign out of all devices</button>
    </div>
  </div>
</template>
