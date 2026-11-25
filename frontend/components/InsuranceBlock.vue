<script setup lang="ts">
// Optional insurance policies entered together with a new patient. v-model = array of policy objects.
const model = defineModel<any[]>({ default: () => [] })
const { api } = useApi()
const open = ref(false)
const plans = reactive<Record<number, any>>({})
const blank = () => ({ payer_id: null, plan_id: null, policy_no: '', member_id: '', relation: 'Self', valid_from: todayStr(), valid_to: '', corporate_id: null })
function toggle() { open.value = !open.value; if (open.value && !model.value.length) model.value = [blank()] ; if (!open.value) model.value = [] }
function add() { if (model.value.length < 5) model.value = [...model.value, blank()] }
function remove(i: number) { model.value = model.value.filter((_, k) => k !== i); if (!model.value.length) open.value = false }
async function loadPlan(p: any, i: number) { if (!p.plan_id) { delete plans[i]; return } try { plans[i] = await api(`/r/plans/${p.plan_id}`) } catch { delete plans[i] } }
function payerChanged(p: any, i: number) { p.plan_id = null; delete plans[i] }
const status = (p: any) => (p.valid_to && p.valid_to < todayStr() ? 'Expired - visit would be billed as cash' : '')
</script>
<template>
  <div class="card" style="margin-top:12px">
    <label class="f" style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" :checked="open" style="width:auto" @change="toggle" /> <b>Patient has insurance</b> <span class="muted small">(optional — can also be added later under Insurance policies)</span></label>
    <template v-if="open">
      <div v-for="(p, i) in model" :key="i" class="card" style="background:#fafafa;margin:10px 0 0">
        <div class="bar"><b>Policy {{ i + 1 }}</b><div class="sp"></div><button type="button" class="sm danger" @click="remove(i)">Remove</button></div>
        <div class="fgrid">
          <div class="field"><label class="f">Insurance company <span class="req">*</span></label><LookupSelect v-model="p.payer_id" resource="payers" @update:model-value="payerChanged(p, i)" /></div>
          <div class="field"><label class="f">Plan</label><LookupSelect :key="p.payer_id" v-model="p.plan_id" resource="plans" :filter="{ payer_id: p.payer_id }" :disabled="!p.payer_id" placeholder="Choose insurer first" @update:model-value="loadPlan(p, i)" /></div>
          <div class="field"><label class="f">Policy number <span class="req">*</span></label><input v-model="p.policy_no" maxlength="40" /></div>
          <div class="field"><label class="f">Member ID <span class="req">*</span></label><input v-model="p.member_id" maxlength="40" /></div>
          <div class="field"><label class="f">Patient is</label><select v-model="p.relation"><option>Self</option><option>Spouse</option><option>Child</option><option>Parent</option></select></div>
          <div class="field"><label class="f">Sponsor (corporate)</label><LookupSelect v-model="p.corporate_id" resource="corporate_accounts" /></div>
          <div class="field"><label class="f">Valid from</label><input v-model="p.valid_from" type="date" /></div>
          <div class="field"><label class="f">Valid to <span class="req">*</span></label><input v-model="p.valid_to" type="date" /></div>
        </div>
        <div v-if="plans[i]" class="small muted">Plan <b>{{ plans[i].name }}</b>: patient co-pays {{ plans[i].copay_pct }}%<span v-if="Number(plans[i].copay_max)"> (max {{ money(plans[i].copay_max) }} per visit)</span><span v-if="plans[i].annual_limit"> · annual limit {{ money(plans[i].annual_limit) }}</span><span v-if="plans[i].network"> · {{ plans[i].network }}</span></div>
        <div v-if="status(p)" class="small warn-text">{{ status(p) }}</div>
      </div>
      <p v-if="model.length < 5"><button type="button" class="sm" @click="add">+ Add another policy</button></p>
    </template>
  </div>
</template>
