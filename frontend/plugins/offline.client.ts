// Registers the service worker, tracks online/offline and syncs the outbox when the connection returns.
export default defineNuxtPlugin(() => {
  const { online, load, sync } = useOffline()
  load()
  window.addEventListener('online', () => { online.value = true; sync() })
  window.addEventListener('offline', () => { online.value = false })
  setInterval(() => { if (navigator.onLine) sync() }, 30000)
  setTimeout(sync, 3000)
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)
  if (secure && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
})
