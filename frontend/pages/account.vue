<script setup lang="ts">
const { api } = useApi(); const { ok, err } = useUi(); const { state } = useAuth()
const f = reactive({ current_password: '', new_password: '', again: '' })
async function save() {
  if (f.new_password !== f.again) return err('The new passwords do not match')
  try { await api('/auth/change-password', { method: 'POST', body: { current_password: f.current_password, new_password: f.new_password } }); ok('Password changed'); Object.assign(f, { current_password: '', new_password: '', again: '' }) } catch (e) { err(e) }
}
</script>
<template>
  <div>
    <h1>My account</h1>
    <div class="card" style="max-width:460px">
      <p><b>{{ state.user?.full_name }}</b> · {{ state.user?.username }} · <span class="badge blue">{{ state.user?.role }}</span></p>
      <h3>Change password</h3>
      <div class="field"><label class="f">Current password</label><input type="password" v-model="f.current_password" /></div>
      <div class="field"><label class="f">New password (8+ characters)</label><input type="password" v-model="f.new_password" /></div>
      <div class="field"><label class="f">Repeat new password</label><input type="password" v-model="f.again" /></div>
      <button class="p" @click="save">Change password</button>
    </div>
  </div>
</template>
