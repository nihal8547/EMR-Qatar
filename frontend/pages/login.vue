<script setup lang="ts">
definePageMeta({ layout: false })
const { login, state } = useAuth()
const username = ref('')
const password = ref('')
const err = ref('')
const busy = ref(false)
async function go() {
  err.value = ''
  busy.value = true
  try {
    await login(username.value, password.value)
    await navigateTo(state.value.user?.isPortal ? '/portal' : '/')
  } catch (e: any) { err.value = e.message } finally { busy.value = false }
}
</script>
<template>
  <div class="login-wrap">
    <form class="login" @submit.prevent="go">
      <h1>Qatar HMS</h1>
      <p class="muted">Sign in to continue</p>
      <div v-if="err" class="alert err">{{ err }}</div>
      <div class="field"><label class="f">Username</label><input v-model="username" autocomplete="username" autofocus /></div>
      <div class="field"><label class="f">Password</label><input v-model="password" type="password" autocomplete="current-password" /></div>
      <button class="p" style="width:100%" :disabled="busy || !username || !password">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </div>
</template>
