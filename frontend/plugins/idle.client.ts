// Signs the user out after a period of inactivity (default 30 min; set NUXT_PUBLIC_IDLE_MIN to change, 0 = off).
export default defineNuxtPlugin(() => {
  const mins = Number((useRuntimeConfig().public as any).idleMin ?? 30)
  if (!mins) return
  let last = Date.now()
  const bump = () => { last = Date.now() }
  for (const ev of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']) window.addEventListener(ev, bump, { passive: true })
  setInterval(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    if (Date.now() - last > mins * 60000) { useUi().err('Signed out after inactivity'); useAuth().logout() }
  }, 15000)
})
