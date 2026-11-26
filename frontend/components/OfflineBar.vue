<script setup lang="ts">
const { online, items, syncing, sync, discard, retry } = useOffline()
const open = ref(false)
const failed = computed(() => items.value.filter((i) => i.error).length)
</script>
<template>
  <div class="no-print">
    <div v-if="!online" class="offbar off">● You are offline — you can read what you opened before. New patients and vitals are saved on this device and sent when you are back online; other actions wait for the connection.</div>
    <div v-if="items.length" class="offbar q">
      <b>{{ items.length }}</b> waiting to be sent<span v-if="failed" class="bad"> · {{ failed }} need attention</span>
      <button class="sm" :disabled="syncing || !online" @click="sync">{{ syncing ? 'Sending…' : 'Send now' }}</button>
      <button class="sm" @click="open = !open">{{ open ? 'Hide' : 'Details' }}</button>
      <div v-if="open" class="offlist">
        <div v-for="i in items" :key="i.id" class="row"><span>{{ i.label }}</span><span class="muted small">{{ new Date(i.at).toLocaleString() }}</span><span v-if="i.error" class="bad small">{{ i.error }}</span>
          <button v-if="i.error" class="sm" @click="retry(i.id)">Retry</button><button class="sm danger" @click="confirm('Discard this unsent item? It will never be saved.') && discard(i.id)">Discard</button></div>
      </div>
    </div>
  </div>
</template>
