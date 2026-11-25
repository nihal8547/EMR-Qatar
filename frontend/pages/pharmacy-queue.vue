<script setup lang="ts">
definePageMeta({ perm: 'pharmacy.dispense' })
const { api } = useApi(); const { ok, err } = useUi()
const rows = ref<any[]>([]); const open = ref<number | null>(null)
const qty = reactive<Record<number, number>>({}); const witness = ref(''); const override = ref(false); const busy = ref(false)
const allergyHit = ref('')
async function load() { try { rows.value = await api('/pharmacy/queue') } catch (e) { err(e) } }
let t: any; onMounted(() => { load(); t = setInterval(load, 30000) }); onBeforeUnmount(() => clearInterval(t))
const cur = computed(() => rows.value.find((r) => r.id === open.value))
watch(cur, (c) => { witness.value = ''; override.value = false; allergyHit.value = ''; if (c) for (const i of c.items) qty[i.id] = Math.max(0, Math.min(i.qty - i.dispensed, i.stock)) })
const hasNarcotic = computed(() => cur.value?.items.some((i: any) => i.schedule === 'Narcotic'))
async function dispense() {
  const c = cur.value; if (!c) return
  const items = c.items.filter((i: any) => qty[i.id] > 0).map((i: any) => ({ prescription_item_id: i.id, qty: qty[i.id] }))
  busy.value = true
  try {
    const r = await api('/pharmacy/dispense', { method: 'POST', body: { prescription_id: c.id, items, witness: witness.value, override_allergy: override.value } })
    ok(`Dispensed ${r.dispense_no || ''}. Total ${money(r.total)}`); open.value = null; await load()
  } catch (e: any) { if (e.extra?.allergy) allergyHit.value = e.message; else err(e) } finally { busy.value = false }
}
</script>
<template>
  <div>
    <div class="bar"><h1>Dispensing Queue</h1><div class="sp"></div><button @click="load">↻ Refresh</button></div>
    <div class="split">
      <div class="card flush" style="max-height:75vh;overflow:auto">
        <div v-for="r in rows" :key="r.id" class="list-item" :class="{ on: open === r.id }" @click="open = r.id">
          <b>{{ r.rx_no }}</b> <span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span><div>{{ r.full_name }} <span class="small muted">{{ r.mrn }}</span></div>
          <div class="small muted">{{ r.items.length }} item(s) · Dr. {{ r.doctor }} · {{ r.payer_type }}</div>
          <div v-if="r.allergies.length" class="small" style="color:var(--bad)">⚠ {{ r.allergies.join(', ') }}</div>
        </div>
        <div v-if="!rows.length" class="empty">No prescriptions waiting.</div>
      </div>
      <div v-if="cur" class="card">
        <h2>{{ cur.rx_no }} — {{ cur.full_name }}</h2>
        <div v-if="cur.allergies.length" class="alert err"><b>Allergies:</b> {{ cur.allergies.join(', ') }}</div>
        <table><thead><tr><th>Medicine</th><th>Directions</th><th class="num">Prescribed</th><th class="num">Given</th><th class="num">In stock</th><th style="width:100px">Dispense now</th></tr></thead>
          <tbody><tr v-for="i in cur.items" :key="i.id"><td>{{ i.drug }}<span v-if="i.schedule !== 'Normal'" class="badge red" style="margin-left:6px">{{ i.schedule }}</span></td><td>{{ i.dose }} {{ i.frequency }} × {{ i.days }}d</td><td class="num">{{ i.qty }}</td><td class="num">{{ i.dispensed }}</td>
            <td class="num" :style="{ color: i.stock < i.qty - i.dispensed ? 'var(--bad)' : '' }">{{ i.stock }}</td><td><input type="number" min="0" :max="i.qty - i.dispensed" v-model.number="qty[i.id]" :disabled="i.qty - i.dispensed <= 0" /></td></tr></tbody></table>
        <div v-if="hasNarcotic" class="field" style="margin-top:8px"><label class="f">Witness name (required for narcotics)</label><input v-model="witness" /></div>
        <div v-if="allergyHit" class="alert err">{{ allergyHit }}<div><label><input type="checkbox" v-model="override" /> I have confirmed with the prescriber – override</label></div></div>
        <div class="bar" style="margin-top:10px"><button class="p" :disabled="busy" @click="dispense">Dispense</button><span class="muted small">Stock is taken from the batch expiring first (FEFO). The charge is added to the visit bill.</span></div>
      </div>
      <div v-else class="card empty">Select a prescription.</div>
    </div>
  </div>
</template>
