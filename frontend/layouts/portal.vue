<script setup lang="ts">
const { state, logout } = useAuth(); const { toasts } = useUi()
</script>
<template>
  <div><header class="top"><b>Patient Portal</b><div style="flex:1"></div><span>{{ state.user?.full_name }}</span><button class="sm" @click="logout">Log out</button></header>
    <main class="content"><slot /></main><div class="toasts"><div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div></div></div>
</template>
