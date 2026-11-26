<script setup lang="ts">
definePageMeta({ layout: false })
const { login, state } = useAuth()
const username = ref('')
const password = ref('')
const err = ref('')
const busy = ref(false)
const show = ref(false)
const caps = ref(false)
const code = ref('')
const needCode = ref(false)
const remember = ref(true)
onMounted(() => { try { const u = localStorage.getItem('hms_last_user'); if (u) username.value = u } catch { /* storage unavailable */ } })
const keyCheck = (e: KeyboardEvent) => { caps.value = !!e.getModifierState?.('CapsLock') }
async function go() {
  err.value = ''
  busy.value = true
  try {
    await login(username.value.trim(), password.value, code.value.trim())
    try { if (remember.value) localStorage.setItem('hms_last_user', username.value.trim()); else localStorage.removeItem('hms_last_user') } catch { /* ignore */ }
    await navigateTo(state.value.user?.isPortal ? '/portal' : '/')
  } catch (e: any) {
    if (e?.extra?.mfa_required) { needCode.value = true; err.value = code.value ? e.message : ''; code.value = '' } else { err.value = e.message; password.value = '' }
  } finally { busy.value = false }
}
const points = [
  ['Front desk to pharmacy', 'Registration, visits, lab, imaging, billing and dispensing in one flow'],
  ['Role based access', 'Every user sees only what their job needs'],
  ['Works with WhatsApp', 'Results and bills reach patients automatically'],
]
</script>
<template>
  <div class="lg">
    <aside class="lg-brand">
      <div class="lg-logo"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg></div>
      <div class="lg-mid">
        <h1>Qatar HMS</h1>
        <p class="lg-tag">The complete system for your medical centre in Qatar.</p>
        <ul><li v-for="p in points" :key="p[0]"><span class="lg-dot"></span><div><b>{{ p[0] }}</b><span>{{ p[1] }}</span></div></li></ul>
      </div>
      <div class="lg-foot">Secure sign in · Your activity is logged</div>
    </aside>
    <main class="lg-form">
      <form class="lg-card" @submit.prevent="go" novalidate>
        <div class="lg-mobile-logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg></div>
        <h2>Welcome back</h2>
        <p class="muted">Sign in to your account</p>
        <div v-if="err" class="alert err" role="alert">{{ err }}</div>
        <label class="lg-l" for="lg-u">Username</label>
        <div class="lg-in"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
          <input id="lg-u" v-model="username" autocomplete="username" autofocus placeholder="Enter your username" /></div>
        <label class="lg-l" for="lg-p">Password</label>
        <div class="lg-in"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <input id="lg-p" v-model="password" :type="show ? 'text' : 'password'" autocomplete="current-password" placeholder="Enter your password" @keydown="keyCheck" @keyup="keyCheck" />
          <button type="button" class="lg-eye" :aria-label="show ? 'Hide password' : 'Show password'" @click="show = !show">{{ show ? 'Hide' : 'Show' }}</button></div>
        <div v-if="caps" class="lg-caps">Caps Lock is on</div>
        <template v-if="needCode">
          <label class="lg-l" for="lg-c">Authenticator code</label>
          <div class="lg-in"><input id="lg-c" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code from your app" autofocus /></div>
        </template>
        <label class="lg-rem"><input type="checkbox" v-model="remember" /> Remember my username on this device</label>
        <button class="p lg-go" :disabled="busy || !username || !password || (needCode && code.length !== 6)">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
        <p class="lg-help">Forgot your password? Ask your administrator to reset it.</p>
      </form>
      <p class="lg-copy">© Qatar HMS</p>
    </main>
  </div>
</template>
