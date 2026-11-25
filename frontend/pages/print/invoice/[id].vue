<script setup lang="ts">
definePageMeta({ perm: 'invoices.view' })
const route = useRoute(); const { api } = useApi(); const { err } = useUi()
const d = ref<any>(null)
onMounted(async () => { try { d.value = await api(`/billing/invoices/${route.params.id}`) } catch (e) { err(e) } })
const printNow = () => window.print()
</script>
<template>
  <div v-if="d" style="max-width:820px;margin:0 auto">
    <div class="bar no-print"><button @click="$router.back()">‹ Back</button><div class="sp"></div><button class="p" @click="printNow">🖨 Print</button></div>
    <div class="card" style="background:#fff">
      <div class="bar"><div><h1 style="margin:0">{{ d.centre.centre_name || 'Medical Centre' }}</h1><div class="small muted">{{ d.centre.centre_address }} · {{ d.centre.centre_phone }}</div></div><div class="sp"></div><div class="right"><h2 style="margin:0">TAX INVOICE / BILL</h2><div>{{ d.invoice.invoice_no }}</div><div class="small muted">{{ fdate(d.invoice.invoice_date) }}</div></div></div>
      <hr />
      <div class="grid g2"><div><b>{{ d.invoice.full_name }}</b><div class="small">MRN {{ d.invoice.mrn }} · {{ d.invoice.phone }}</div><div class="small">Visit {{ d.invoice.visit_no }}</div></div>
        <div class="small"><div>Payer: {{ d.invoice.payer_type }}</div><div v-if="d.invoice.payer_name">{{ d.invoice.payer_name }} · Policy {{ d.invoice.policy_no }} · Member {{ d.invoice.member_id }}</div><div v-if="d.invoice.corporate_name">{{ d.invoice.corporate_name }}</div></div></div>
      <table style="margin-top:12px"><thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount (QAR)</th></tr></thead><tbody><tr v-for="(l, i) in d.lines" :key="l.id"><td>{{ i + 1 }}</td><td>{{ l.description }}</td><td class="num">{{ l.qty }}</td><td class="num">{{ money(l.unit_price) }}</td><td class="num">{{ money(l.amount) }}</td></tr></tbody></table>
      <dl class="kv" style="margin:12px 0 0 auto;max-width:340px"><dt>Gross</dt><dd class="right">{{ money(d.invoice.gross) }}</dd><dt>Discount</dt><dd class="right">{{ money(d.invoice.discount) }}</dd><dt><b>Net</b></dt><dd class="right"><b>{{ money(d.invoice.net) }}</b></dd><dt v-if="d.invoice.payer_type !== 'Cash'">Payer share</dt><dd v-if="d.invoice.payer_type !== 'Cash'" class="right">{{ money(d.invoice.payer_share) }}</dd><dt>Patient share</dt><dd class="right">{{ money(d.invoice.patient_share) }}</dd><dt>Paid</dt><dd class="right">{{ money(d.invoice.paid) }}</dd><dt><b>Balance</b></dt><dd class="right"><b>{{ money(d.invoice.balance) }}</b></dd></dl>
      <h3 style="margin-top:14px">Payments</h3><table><tbody><tr v-for="p in d.payments" :key="p.id"><td>{{ p.receipt_no }}</td><td>{{ fdt(p.paid_at) }}</td><td>{{ p.method }}</td><td class="num">{{ p.kind === 'Refund' ? '-' : '' }}{{ money(p.amount) }}</td></tr></tbody></table>
      <p class="small muted" style="margin-top:16px">{{ d.centre.tax_note }}</p>
    </div>
  </div>
  <div v-else class="empty">Loading…</div>
</template>
