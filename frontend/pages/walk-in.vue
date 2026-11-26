<script setup lang="ts">
definePageMeta({ perm: 'walkin.create' })
const { api } = useApi(); const { ok, err } = useUi(); const { can } = useAuth()
const cat = ref<any>({ groups: [], panels: [], modalities: [] })
const picks = reactive<Record<string, any>>({})   // selected tests / studies (name + price) kept for the bill preview
const testFetch = async ({ q, group, ids }: any) => { const r: any[] = await api('/walkin/search', { query: { kind: 'test', q, group: group || undefined, ids: ids?.join(',') || undefined } }); r.forEach((t) => (picks['t' + t.id] = t)); return r.map((t) => ({ id: t.id, name: t.name, sub: t.code, group: t.sample_type, price: t.price })) }
const studyFetch = async ({ q, ids }: any) => { const r: any[] = await api('/walkin/search', { query: { kind: 'study', q, ids: ids?.join(',') || undefined } }); r.forEach((t) => (picks['s' + t.id] = t)); return r.map((t) => ({ id: t.id, name: t.name, sub: t.code, price: t.price })) }
const f = reactive<any>({ patient_id: null, referred_by: '', priority: 'Routine', notes: '', test_ids: [] as number[], study_ids: [] as number[], collect: true, method: 'Cash', reference: '', discount_pct: '' })
const pat = ref<any>(null)
const reg = reactive<any>({ on: false, full_name: '', gender: 'Male', dob: '', age: '', phone: '', qid: '', busy: false })
const busy = ref(false); const result = ref<any>(null)
onMounted(async () => { try { cat.value = await api('/walkin/catalog') } catch (e) { err(e) } })
watch(() => f.patient_id, async (id) => { pat.value = null; if (id) { try { pat.value = await api(`/r/patients/${id}`) } catch { /* ignore */ } } })
watch(() => reg.age, (a) => { const n = Number(a); if (n > 0 && n < 120 && !reg.dob) reg.dob = `${new Date().getFullYear() - n}-01-01` })
function addPanel(p: any) { f.test_ids = [...new Set([...f.test_ids, ...(p.test_ids || []).map(Number)])] }
const chosen = computed(() => [
  ...f.test_ids.map((id: number) => { const t = picks['t' + id]; return t && { kind: 'Lab', name: t.name, price: Number(t.price || 0) } }),
  ...f.study_ids.map((id: number) => { const s = picks['s' + id]; return s && { kind: 'X-ray / Imaging', name: s.name, price: Number(s.price || 0) } }),
].filter(Boolean) as any[])
const listTotal = computed(() => chosen.value.reduce((a, c) => a + c.price, 0))
const discPct = computed(() => Math.min(100, Math.max(0, Number(f.discount_pct) || 0)))
const netEst = computed(() => Math.round(listTotal.value * (1 - discPct.value / 100) * 100) / 100)
const canDisc = computed(() => can('billing.discount') || can('billing.approve_discount'))
const canPay = computed(() => can('billing.cashier'))
async function register() {
  reg.busy = true
  try {
    const r: any = await api('/r/patients', { method: 'POST', body: { full_name: reg.full_name.trim(), gender: reg.gender, dob: reg.dob, phone: reg.phone.trim(), qid: reg.qid.trim() || undefined } })
    ok('Patient registered'); f.patient_id = r.id; reg.on = false
    Object.assign(reg, { full_name: '', dob: '', age: '', phone: '', qid: '' })
  } catch (e) { err(e) } finally { reg.busy = false }
}
const valid = computed(() => !!f.patient_id && (f.test_ids.length || f.study_ids.length))
async function submit() {
  busy.value = true
  try {
    result.value = await api('/walkin', { method: 'POST', body: { patient_id: f.patient_id, referred_by: f.referred_by || undefined, priority: f.priority, notes: f.notes || undefined, test_ids: f.test_ids, study_ids: f.study_ids,
      invoice: true, discount_pct: canDisc.value && f.discount_pct !== '' ? Number(f.discount_pct) : undefined, pay: f.collect && canPay.value ? { method: f.method, reference: f.reference } : undefined } })
    ok(`Registered ${result.value.visit_no}` + (result.value.payment ? ` · received ${money(result.value.payment.amount ?? result.value.invoice.balance)}` : ''))
  } catch (e) { err(e) } finally { busy.value = false }
}
function again() { result.value = null; pat.value = null; Object.assign(f, { patient_id: null, referred_by: '', priority: 'Routine', notes: '', test_ids: [], study_ids: [], reference: '', discount_pct: '' }) }
</script>
<template>
  <div>
    <div class="bar"><div><h1>Walk-in Tests / X-ray (Outside)</h1><div class="page-sub">For patients who come only for lab tests or X-rays: register, order, bill and collect payment in one step. No doctor consultation is charged.</div></div></div>

    <div v-if="result" class="card">
      <div class="alert ok"><b>{{ result.visit_no }}</b> registered · token <b>#{{ result.token_no }}</b></div>
      <div class="dv" style="margin:10px 0">
        <div v-if="result.lab_order" class="i"><div class="k">Lab order</div><div class="v">{{ result.lab_order.order_no }}</div></div>
        <div v-for="o in result.imaging_orders" :key="o.id" class="i"><div class="k">X-ray / imaging order</div><div class="v">{{ o.order_no }}</div></div>
        <div v-if="result.invoice" class="i"><div class="k">Bill</div><div class="v">{{ result.invoice.invoice_no }} · net {{ money(result.invoice.net) }}<span v-if="Number(result.invoice.discount) > 0"> (discount {{ money(result.invoice.discount) }})</span></div></div>
        <div v-if="result.payment" class="i"><div class="k">Payment</div><div class="v"><span class="badge green">Received</span> {{ result.payment.receipt_no }}</div></div>
        <div v-else-if="result.invoice" class="i"><div class="k">Payment</div><div class="v"><span class="badge amber">Not collected</span> due {{ money(result.invoice.balance) }}</div></div>
      </div>
      <div class="bar">
        <NuxtLink v-if="result.invoice" :to="`/print/invoice/${result.invoice.id}`" class="btn p">🖨 Print bill / receipt</NuxtLink>
        <NuxtLink v-if="result.lab_order" :to="`/print/lab-slip/${result.lab_order.id}`" class="btn">🖨 Lab collection slip</NuxtLink>
        <NuxtLink v-if="canPay && result.invoice && !result.payment" :to="`/front-payments?visit=${result.visit_id}`" class="btn ok">Collect payment</NuxtLink>
        <button @click="again">Register another walk-in</button>
      </div>
    </div>

    <div v-else class="grid" style="grid-template-columns:2fr 1fr;align-items:start">
      <div>
        <div class="card"><h2>1 · Patient</h2>
          <div class="field"><label class="f">Find patient <span class="req">*</span> <a class="small" style="cursor:pointer" @click="reg.on = !reg.on">{{ reg.on ? '✕ close registration' : '+ register new patient' }}</a></label>
            <LookupSelect v-model="f.patient_id" resource="patients" placeholder="Name, MRN, QID or phone" /></div>
          <div v-if="pat" class="pcard" style="margin-top:8px"><b>{{ pat.full_name }}</b><div class="pchips"><span class="badge">{{ pat.mrn }}</span><span v-if="pat.qid" class="badge grey">QID {{ pat.qid }}</span><span class="badge grey">{{ pat.gender }} · DOB {{ fdate(pat.dob) }}</span><span v-if="pat.phone" class="badge grey">{{ pat.phone }}</span></div></div>
          <div v-if="reg.on && can('patients.create')" class="pcard" style="margin-top:10px"><b>New patient</b>
            <div class="fgrid" style="margin-top:8px">
              <div class="field wide"><label class="f">Full name <span class="req">*</span></label><input v-model="reg.full_name" /></div>
              <div class="field"><label class="f">Gender <span class="req">*</span></label><select v-model="reg.gender"><option>Male</option><option>Female</option></select></div>
              <div class="field"><label class="f">Mobile <span class="req">*</span></label><input v-model="reg.phone" placeholder="+974 …" /></div>
              <div class="field"><label class="f">Date of birth <span class="req">*</span></label><input v-model="reg.dob" type="date" /></div>
              <div class="field"><label class="f">…or age (years)</label><input v-model="reg.age" type="number" min="0" max="119" /></div>
              <div class="field"><label class="f">QID (optional)</label><input v-model="reg.qid" /></div>
            </div>
            <button class="p" :disabled="reg.busy || !reg.full_name.trim() || !reg.phone.trim() || !reg.dob" @click="register">{{ reg.busy ? 'Saving…' : 'Register patient' }}</button>
            <div class="small muted" style="margin-top:4px">Add insurance, address and other details later from Patients.</div>
          </div>
          <div class="fgrid" style="margin-top:10px">
            <div class="field"><label class="f">Referred by (outside doctor / clinic)</label><input v-model="f.referred_by" placeholder="Optional" /></div>
            <div class="field"><label class="f">Priority</label><select v-model="f.priority"><option>Routine</option><option>Urgent</option><option>STAT</option></select></div>
          </div>
        </div>
        <div class="card"><h2>2 · Lab tests</h2>
          <div v-if="cat.panels.length" class="bar" style="gap:4px;flex-wrap:wrap"><span class="small muted">Panels:</span><button v-for="p in cat.panels" :key="p.id" class="sm" type="button" @click="addPanel(p)">+ {{ p.name }}</button></div>
          <SearchPick v-model="f.test_ids" :fetcher="testFetch" :groups="cat.groups" multiple placeholder="Search test name or code (e.g. CBC, glucose, HbA1c)" />
        </div>
        <div class="card"><h2>3 · X-ray / imaging</h2>
          <SearchPick v-model="f.study_ids" :fetcher="studyFetch" multiple placeholder="Search X-ray, CT, MRI, ultrasound… (e.g. chest, knee, abdomen)" />
        </div>
      </div>
      <div>
        <div class="card pay-card"><h2>Bill &amp; payment</h2>
          <div v-if="!chosen.length" class="none-txt">Pick tests or X-rays to see the bill.</div>
          <table v-else class="bill"><tbody><tr v-for="(c, i) in chosen" :key="i"><td>{{ c.name }}<div class="small muted">{{ c.kind }}</div></td><td class="num">{{ money(c.price) }}</td></tr></tbody></table>
          <dl class="totals" style="margin:10px 0"><dt>Total</dt><dd>{{ money(listTotal) }}</dd><template v-if="discPct > 0"><dt>Discount {{ discPct }}%</dt><dd>− {{ money(listTotal - netEst) }}</dd></template><dt class="strong">To pay</dt><dd class="strong">{{ money(netEst) }}</dd></dl>
          <div v-if="canDisc" class="field"><label class="f">Discount % (optional)</label><input v-model="f.discount_pct" type="number" min="0" max="100" step="any" style="max-width:120px" /></div>
          <template v-if="canPay">
            <label class="f" style="display:flex;gap:8px;align-items:center;margin-top:8px"><input v-model="f.collect" type="checkbox" /> Collect payment now</label>
            <div v-if="f.collect" class="fgrid"><div class="field"><label class="f">Method</label><select v-model="f.method"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Online</option></select></div><div class="field"><label class="f">Reference</label><input v-model="f.reference" placeholder="Card slip (optional)" /></div></div>
            <div v-if="f.collect && f.method === 'Cash'" class="small muted">Cash needs your cashier session open (Patient Payments page).</div>
          </template>
          <button class="ok" style="width:100%;margin-top:10px" :disabled="busy || !valid" @click="submit">{{ busy ? 'Working…' : (f.collect && canPay ? 'Register & collect payment' : 'Register & create bill') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
