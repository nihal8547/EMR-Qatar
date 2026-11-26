<script setup lang="ts">
definePageMeta({ perm: 'payments.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/print/payments/${route.params.id}`) } catch (e) { err(e) } })
const printNow = () => window.print()
const refund = computed(() => d.value?.record.kind === 'Refund')
</script>
<template>
  <div v-if="d" style="max-width:420px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div style="text-align:center"><h3 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h3><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><hr />
      <h2 style="margin:0;text-align:center">{{ refund ? 'REFUND VOUCHER' : 'PAYMENT RECEIPT' }}</h2>
      <dl class="kv" style="margin-top:10px"><dt>Receipt no</dt><dd><b>{{ d.record.receipt_no }}</b></dd><dt>Date</dt><dd>{{ fdt(d.record.paid_at) }}</dd><dt>Patient</dt><dd>{{ d.patient?.full_name }} <span class="muted">({{ d.patient?.mrn }})</span></dd><dt>Invoice</dt><dd>{{ d.record.invoice_id__label }}</dd><dt>Method</dt><dd>{{ d.record.method }}<template v-if="d.record.reference"> · {{ d.record.reference }}</template></dd><dt>Received by</dt><dd>{{ d.record.cashier_id__label }}</dd></dl>
      <div style="text-align:center;margin:14px 0;padding:10px;border:1px solid #111;border-radius:8px"><div class="small muted">{{ refund ? 'AMOUNT REFUNDED' : 'AMOUNT RECEIVED' }}</div><div style="font-size:28px;font-weight:800">QAR {{ money(d.record.amount) }}</div></div>
      <p class="small muted" style="text-align:center">Thank you. This is a computer generated receipt.</p>
    </div>
  </div>
  <div v-else class="empty loading">Loading…</div>
</template>
