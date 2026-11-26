'use strict';
/* Billing + Insurance & Credit */
module.exports = (R) => {
  /* ================= BILLING ================= */
  R('services', 'billing', 'Service Master & Prices', [
    'code:text::req,list,search,uniq',
    'name:text::req,list,search',
    'category:select=Consultation/Lab/Radiology/Procedure/Dental/Pharmacy/Package/Other:Category:req,list,filter',
    'department_id:ref=departments:Department:list',
    'price:money:Cash price (QAR):req,list',
    'covered:bool:Insurance covered:list,def=true',
    'needs_preauth:bool:Needs pre-authorisation:list,def=false',
    'taxable:bool:Taxable:def=false',
    'active:bool:Active:list,def=true',
  ], { schema: 'billing', disp: ['code', 'name'] });

  R('price_lists', 'billing', 'Price Lists (Payer / Corporate)', [
    'name:text::req,list,search',
    'payer_id:ref=payers:Insurance payer:list',
    'corporate_id:ref=corporate_accounts:Corporate account:list',
    'discount_pct:decimal:Default discount %:list,def=0',
    'active:bool:Active:list,def=true',
  ], { schema: 'billing', children: [['price_list_items', 'price_list_id', 'Special prices']], help: 'Special prices override the cash price; the default discount applies to services without a special price.' });

  R('price_list_items', 'billing', 'Price List Items', [
    'price_list_id:ref=price_lists:Price list:req',
    'service_id:ref=services:Service:req,list',
    'price:money:Price (QAR):req,list',
  ], { schema: 'billing', menu: false, disp: ['id'] });

  R('packages', 'billing', 'Packages & Bundles', [
    'name:text::req,list,search',
    'price:money:Package price:req,list',
    'description:text::list',
    'active:bool:Active:list,def=true',
  ], { schema: 'billing', children: [['package_items', 'package_id', 'Included services']] });

  R('package_items', 'billing', 'Package Items', [
    'package_id:ref=packages:Package:req',
    'service_id:ref=services:Service:req,list',
    'qty:int:Qty:list,def=1',
  ], { schema: 'billing', menu: false, disp: ['id'] });

  R('charges', 'billing', 'Charges (Bill Lines)', [
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient:list',
    'service_id:ref=services:Service:req,list',
    'description:text:Description:list',
    'qty:decimal:Qty:list,def=1',
    'unit_price:money:Unit price:list',
    'amount:money:Amount:ro,list',
    'source:select=Consultation/Lab/Radiology/Procedure/Pharmacy/Manual:Source:list,filter,def=Manual',
    'source_id:int:Source record id:ro',
    'status:select=Pending/Invoiced/Cancelled:Status:ro,list,filter,def=Pending',
    'invoice_id:ref=invoices:Invoice:ro,list',
  ], { schema: 'billing', fromVisit: true, disp: ['description'], hooks: { before: 'chargeBefore' }, help: 'Charges post automatically from orders and dispensing. Add manual charges here if needed.' });

  R('invoices', 'billing', 'Invoices', [
    'invoice_no:text:Invoice no:list,search,uniq,auto=INV/6',
    'visit_id:ref=visits:Visit:list',
    'patient_id:ref=patients:Patient:list',
    'payer_type:select=Cash/Insurance/Corporate:Payer type:list,filter',
    'payer_id:ref=payers:Insurance payer',
    'policy_id:ref=policy_members:Policy',
    'corporate_id:ref=corporate_accounts:Corporate account',
    'invoice_date:date:Date:list,def=today',
    'gross:money:Gross:ro,list',
    'discount:money:Discount:ro,list',
    'net:money:Net:ro,list',
    'patient_share:money:Patient share:ro,list',
    'payer_share:money:Payer share:ro,list',
    'paid:money:Patient paid:ro,list',
    'balance:money:Patient balance:ro,list',
    'payer_paid:money:Payer paid / written off:ro',
    'status:select=Draft/Issued/Partially Paid/Paid/Cancelled:Status:ro,list,filter,def=Draft',
    'notes:text',
  ], {
    schema: 'billing', noCreate: true, noEdit: true, noDelete: true, disp: ['invoice_no'],
    children: [['charges', 'invoice_id', 'Bill lines'], ['payments', 'invoice_id']],
    help: 'Invoices are created in Cashier Desk from the visit charges.',
  });

  R('payments', 'billing', 'Payments & Receipts', [
    'receipt_no:text:Receipt no:list,search,uniq,auto=RCP/6',
    'invoice_id:ref=invoices:Invoice:list',
    'patient_id:ref=patients:Patient:list',
    'kind:select=Payment/Refund:Kind:list,filter',
    'amount:money:Amount:list',
    'method:select=Cash/Card/Bank transfer/Deposit/Online:Method:list,filter',
    'reference:text:Reference',
    'cashier_id:ref=users:Cashier:list',
    'session_id:ref=cashier_sessions:Cashier session',
    'paid_at:datetime:Date / time:list',
  ], { schema: 'billing', readonly: true, disp: ['receipt_no'] });

  R('deposits', 'billing', 'Advance Deposits', [
    'patient_id:ref=patients:Patient:req,list',
    'amount:money:Amount:req,list',
    'method:select=Cash/Card/Bank transfer:Method:list,def=Cash',
    'used:money:Used:ro,list,def=0',
    'status:select=Open/Used/Refunded:Status:ro,list,def=Open',
    'received_at:datetime:Received at:list,def=now',
  ], { schema: 'billing' });

  R('refunds', 'billing', 'Refund Requests', [
    'refund_no:text:Refund no:list,search,uniq,auto=RFD/6',
    'invoice_id:ref=invoices:Invoice:req,list',
    'amount:money:Amount:req,list',
    'reason:text:Reason:req,list',
    'status:select=Requested/Approved/Rejected:Status:ro,list,filter,def=Requested',
    'requested_by:ref=users:Requested by:ro,list',
    'approved_by:ref=users:Approved by:ro',
  ], {
    schema: 'billing', disp: ['refund_no'], hooks: { before: 'requestedByBefore' },
    actions: [{ name: 'approve', label: 'Approve & pay refund', confirm: true }, { name: 'reject', label: 'Reject', confirm: true }],
  });

  R('bill_cancel_requests', 'billing', 'Bill Cancel Requests', [
    'request_no:text:Request no:list,search,uniq,auto=BCR/6',
    'invoice_id:ref=invoices:Invoice:req,list',
    'reason:text:Reason for cancelling:req,list',
    'void_charges:bool:Also void the charges (not just the bill):def=false',
    'status:select=Requested/Approved/Rejected:Status:ro,list,filter,def=Requested',
    'requested_by:ref=users:Requested by:ro,list',
    'requested_at:datetime:Requested at:ro,list',
    'decided_by:ref=users:Decided by:ro,list',
    'decided_at:datetime:Decided at:ro',
    'decision_note:text:Decision note:ro,list',
    'refund_amount:money:Refunded to patient:ro',
  ], {
    schema: 'billing', menu: false, singular: 'Bill cancel request', disp: ['request_no'], hooks: { before: 'billCancelBefore' },
    help: 'Front office raises the request; a cashier / manager approves or rejects it. Approving cancels the bill and refunds any amount already paid.',
    actions: [{ name: 'approve', label: 'Approve & cancel bill', confirm: true }, { name: 'reject', label: 'Reject', confirm: true }],
  });

  R('credit_notes', 'billing', 'Credit Notes', [
    'cn_no:text:Credit note no:list,search,uniq,auto=CN/6',
    'invoice_id:ref=invoices:Invoice:req,list',
    'amount:money:Amount:req,list',
    'reason:text:Reason:req,list',
    'status:select=Draft/Approved:Status:ro,list,def=Draft',
  ], { schema: 'billing', disp: ['cn_no'], actions: [{ name: 'approve', label: 'Approve credit note', confirm: true }] });

  R('cashier_sessions', 'billing', 'Cashier Sessions', [
    'user_id:ref=users:Cashier:list',
    'opened_at:datetime:Opened at:list',
    'closed_at:datetime:Closed at:list',
    'opening_cash:money:Opening cash:list',
    'expected_cash:money:Expected cash:list',
    'closing_cash:money:Counted cash:list',
    'variance:money:Variance:list',
    'status:select=Open/Closed:Status:list,filter',
    'notes:text',
  ], { schema: 'billing', readonly: true, disp: ['id'], help: 'Open and close your session in Cashier Desk.' });

  R('day_closes', 'billing', 'Day Close', [
    'close_date:date:Business date:list,uniq',
    'status:select=Closed/Reopened:Status:list,filter',
    'cash_total:money:Cash:list',
    'card_total:money:Card:list',
    'bank_total:money:Bank transfer:list',
    'online_total:money:Online / deposit:list',
    'refund_total:money:Refunds / voids:list',
    'net_total:money:Net collected:list',
    'invoices_count:int:Invoices:list',
    'payments_count:int:Receipts:list',
    'counted_cash:money:Counted cash',
    'notes:text',
    'closed_by:ref=users:Closed by:list',
    'closed_at:datetime:Closed at:list',
    'reopened_by:ref=users:Reopened by',
    'reopen_reason:text:Reopen reason',
  ], { schema: 'billing', readonly: true, disp: ['close_date'], help: 'Closed days are locked: no payment or refund can be posted until a manager reopens the day.' });

  R('discount_approvals', 'billing', 'Discount Approvals', [
    'invoice_id:ref=invoices:Invoice:req,list',
    'requested_pct:decimal:Requested discount %:req,list',
    'reason:text:Reason:req,list',
    'status:select=Requested/Approved/Rejected:Status:ro,list,filter,def=Requested',
    'requested_by:ref=users:Requested by:ro,list',
    'approved_by:ref=users:Approved by:ro',
  ], {
    schema: 'billing', hooks: { before: 'requestedByBefore' }, disp: ['id'],
    actions: [{ name: 'approve', label: 'Approve & apply', confirm: true }, { name: 'reject', label: 'Reject', confirm: true }],
  });

  /* ================= INSURANCE & CREDIT ================= */
  R('payers', 'insurance', 'Insurance Companies / TPAs', [
    'name:text::req,list,search',
    'code:text::list,uniq',
    'type:select=Insurer/TPA/Government:Type:list,filter',
    'contact_person:text',
    'phone:phone::list',
    'email:email::list',
    'credit_days:int:Credit days:list,def=60',
    'claim_format:select=FHIR/Portal/File upload/Manual:Claim format:list,def=Manual',
    'active:bool:Active:list,def=true',
  ], { schema: 'insurance' });

  R('plans', 'insurance', 'Insurance Plans', [
    'payer_id:ref=payers:Payer:req,list,filter',
    'name:text:Plan name:req,list,search',
    'copay_pct:decimal:Patient co-pay %:list,def=20',
    'copay_max:money:Co-pay cap per visit (0 = none):list,def=0',
    'annual_limit:money:Annual limit:list',
    'network:text:Network / tier:list',
    'active:bool:Active:list,def=true',
  ], { schema: 'insurance', disp: ['name'] });

  R('policy_members', 'insurance', 'Patient Policies', [
    'patient_id:ref=patients:Patient:req,list',
    'payer_id:ref=payers:Payer:req,list,filter',
    'plan_id:ref=plans:Plan:list',
    'policy_no:text:Policy no:req,list,search',
    'member_id:text:Member ID:req,list,search',
    'relation:select=Self/Spouse/Child/Parent:Relation:def=Self',
    'valid_from:date:Valid from:list',
    'valid_to:date:Valid to:req,list',
    'status:select=Active/Suspended/Expired:Status:list,filter,def=Active',
    'corporate_id:ref=corporate_accounts:Sponsor (corporate)',
  ], { schema: 'insurance', disp: ['policy_no', 'member_id'] });

  R('eligibility_checks', 'insurance', 'Eligibility Checks', [
    'visit_id:ref=visits:Visit:req,list',
    'policy_id:ref=policy_members:Policy:list',
    'status:select=Eligible/Not eligible/Pending:Status:list,filter',
    'response:text:Response / reason:list',
    'checked_by:ref=users:Checked by:list',
    'checked_at:datetime:Checked at:list',
  ], { schema: 'insurance', readonly: true, disp: ['id'], help: 'Simulated check: validates policy status and validity dates. Real payer APIs plug in through the integration layer.' });

  R('pre_auths', 'insurance', 'Pre-Authorisations', [
    'auth_no:text:Request no:list,search,uniq,auto=PA/6',
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient:list',
    'policy_id:ref=policy_members:Policy',
    'service_id:ref=services:Service:req,list',
    'amount:money:Requested amount:list',
    'status:select=Requested/Approved/Partially Approved/Rejected/Expired:Status:list,filter,def=Requested',
    'approved_amount:money:Approved amount:list',
    'approval_ref:text:Insurer approval ref:list',
    'valid_to:date:Valid until',
    'remarks:text',
    'requested_by:ref=users:Requested by',
    'requested_at:datetime:Requested at:list,def=now',
  ], { schema: 'insurance', fromVisit: true, disp: ['auth_no'] });

  R('claims', 'insurance', 'Claims', [
    'claim_no:text:Claim no:list,search,uniq,auto=CLM/6',
    'invoice_id:ref=invoices:Invoice:list',
    'visit_id:ref=visits:Visit',
    'patient_id:ref=patients:Patient:list',
    'payer_id:ref=payers:Payer:list,filter',
    'policy_id:ref=policy_members:Policy',
    'amount:money:Claim amount:list',
    'paid_amount:money:Paid:ro,list,def=0',
    'status:select=Draft/Scrub Failed/Ready/Submitted/Accepted/Partially Paid/Paid/Rejected/Appealed:Status:ro,list,filter,def=Draft',
    'batch_id:ref=claim_batches:Batch',
    'submitted_at:datetime:Submitted at:ro,list',
    'scrub_errors:textarea:Scrub result:ro',
    'notes:text',
  ], {
    schema: 'insurance', noCreate: true, noDelete: true, disp: ['claim_no'],
    children: [['claim_lines', 'claim_id', 'Claim lines'], ['rejections', 'claim_id']],
    help: 'Create claims from invoices in the Claims Workbench.',
  });

  R('claim_lines', 'insurance', 'Claim Lines', [
    'claim_id:ref=claims:Claim:req',
    'charge_id:ref=charges:Charge',
    'service_id:ref=services:Service:list',
    'service_code:text:Code:list',
    'description:text:Description:list',
    'amount:money:Amount:list',
  ], { schema: 'insurance', menu: false, readonly: true, disp: ['description'] });

  R('claim_batches', 'insurance', 'Claim Batches', [
    'batch_no:text:Batch no:list,search,uniq,auto=BCH/6',
    'payer_id:ref=payers:Payer:list',
    'submitted_at:datetime:Submitted at:list',
    'claim_count:int:Claims:list',
    'total:money:Total:list',
    'status:select=Submitted/Acknowledged:Status:list',
    'reference:text:Payer reference:list',
  ], { schema: 'insurance', readonly: true, disp: ['batch_no'] });

  R('rejection_codes', 'insurance', 'Rejection Codes', [
    'code:text::req,list,search,uniq',
    'description:text::req,list',
    'category:select=Eligibility/Authorization/Coding/Documentation/Duplicate/Other:Category:list,filter',
  ], { schema: 'insurance', disp: ['code', 'description'] });

  R('rejections', 'insurance', 'Rejection Worklist', [
    'claim_id:ref=claims:Claim:req,list',
    'code_id:ref=rejection_codes:Rejection code:list',
    'reason:text:Reason from payer:list',
    'status:select=Open/Resubmitted/Appealed/Closed:Status:list,filter,def=Open',
    'assigned_to:ref=users:Assigned to:list',
    'resolution:text:Resolution / notes',
  ], { schema: 'insurance', disp: ['id'] });

  R('remittances', 'insurance', 'Remittance Advice', [
    'remit_no:text:Remittance no:list,search,uniq,auto=RMT/6',
    'payer_id:ref=payers:Payer:req,list',
    'remit_date:date:Date:req,list,def=today',
    'amount:money:Total received:req,list',
    'reference:text:Bank / payer reference:list',
    'status:select=Draft/Posted:Status:ro,list,filter,def=Draft',
  ], {
    schema: 'insurance', disp: ['remit_no'], children: [['remittance_lines', 'remittance_id', 'Claim payments']],
    actions: [{ name: 'post', label: 'Post to claims', confirm: true }],
  });

  R('remittance_lines', 'insurance', 'Remittance Lines', [
    'remittance_id:ref=remittances:Remittance:req',
    'claim_id:ref=claims:Claim:req,list',
    'paid_amount:money:Paid:req,list',
    'adjustment:money:Adjustment / short-pay:list,def=0',
    'remarks:text',
  ], { schema: 'insurance', menu: false, disp: ['id'] });

  R('corporate_accounts', 'insurance', 'Corporate Credit Accounts', [
    'name:text:Company:req,list,search',
    'cr_no:text:CR / registration no:list',
    'contact_person:text',
    'phone:phone::list',
    'email:email',
    'credit_limit:money:Credit limit (QAR):list,def=0',
    'credit_days:int:Credit days:list,def=30',
    'discount_pct:decimal:Agreed discount %:list,def=0',
    'active:bool:Active:list,def=true',
    'notes:text',
  ], { schema: 'insurance', children: [['guarantee_letters', 'corporate_id'], ['corporate_payments', 'corporate_id']] });

  R('guarantee_letters', 'insurance', 'Guarantee Letters', [
    'gl_no:text:GL no:req,list,search',
    'corporate_id:ref=corporate_accounts:Company:req,list',
    'patient_id:ref=patients:Patient:list',
    'amount:money:Amount:req,list',
    'used_amount:money:Used:ro,list,def=0',
    'valid_to:date:Valid until:list',
    'status:select=Active/Exhausted/Expired:Status:list,filter,def=Active',
  ], { schema: 'insurance', disp: ['gl_no'] });

  R('corporate_payments', 'insurance', 'Corporate Payments Received', [
    'corporate_id:ref=corporate_accounts:Company:req,list',
    'amount:money:Amount:req,list',
    'pay_date:date:Date:req,list,def=today',
    'method:select=Bank transfer/Cheque/Cash:Method:list',
    'reference:text:Reference:list',
    'applied:bool:Applied to invoices:ro,list,def=false',
  ], { schema: 'insurance', disp: ['id'], actions: [{ name: 'apply', label: 'Apply to oldest invoices', confirm: true }] });

  R('write_offs', 'insurance', 'Write-offs', [
    'wo_no:text:Write-off no:list,search,uniq,auto=WO/6',
    'invoice_id:ref=invoices:Invoice:req,list',
    'claim_id:ref=claims:Claim',
    'amount:money:Amount:req,list',
    'reason:text:Reason:req,list',
    'status:select=Requested/Approved/Rejected:Status:ro,list,filter,def=Requested',
    'approved_by:ref=users:Approved by:ro',
  ], {
    schema: 'insurance', disp: ['wo_no'],
    actions: [{ name: 'approve', label: 'Approve write-off', confirm: true }, { name: 'reject', label: 'Reject', confirm: true }],
  });
};
