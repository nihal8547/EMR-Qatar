// After `nuxt generate`: list every built file so the service worker can cache the whole app for offline use.
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root = '.output/public'
const out = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else out.push('/' + p.slice(root.length + 1).replace(/\\/g, '/')) } }
walk(join(root, '_nuxt'))
for (const f of ['/favicon.ico', '/icon-512.png']) out.push(f)
writeFileSync(join(root, 'precache.json'), JSON.stringify(out.filter((u) => !u.endsWith('.map'))))
console.log(`precache list: ${out.length} files`)
