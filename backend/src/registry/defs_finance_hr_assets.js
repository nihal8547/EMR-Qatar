'use strict';
/* Finance + HR + Assets */
module.exports = (R) => {
  /* ================= FINANCE ================= */
  R('ledger_accounts', 'finance', 'Chart of Accounts', [
    'code:text::req,list,search,uniq',
    'name:text::req,list,search',
    'type:select=Asset/Liability/Equity/Income/Expense:Type:req,list,filter',
    'active:bool:Active:list,def=true',
  ], { schema: 'finance', disp: ['code', 'name'], orderBy: '"code" ASC' });

  R('journals', 'finance', 'Journal Vouchers', [
    'journal_no:text:Voucher no:list,search,uniq,auto=JV/6',
    'journal_date:date:Date:req,list,def=today',
    'narration:text:Narration:req,list',
    'status:select=Draft/Posted:Status:ro,list,filter,def=Draft',
  ], {
    schema: 'finance', disp: ['journal_no'], children: [['journal_lines', 'journal_id', 'Lines']],
    actions: [{ name: 'post', label: 'Post voucher', confirm: true }],
  });

  R('journal_lines', 'finance', 'Journal Lines', [
    'journal_id:ref=journals:Voucher:req',
    'account_id:ref=ledger_accounts:Account:req,list',
    'debit:money:Debit:list,def=0',
    'credit:money:Credit:list,def=0',
    'memo:text:Memo:list',
  ], { schema: 'finance', menu: false, disp: ['id'] });

  R('vendor_bills', 'finance', 'Vendor Bills (Payables)', [
    'bill_ref:text:Supplier invoice no:req,list,search',
    'supplier_id:ref=suppliers:Supplier:req,list',
    'grn_id:ref=grns:GRN:list',
    'bill_date:date:Bill date:req,list,def=today',
    'due_date:date:Due date:list',
    'amount:money:Amount:req,list',
    'paid:money:Paid:ro,list,def=0',
    'status:select=Unpaid/Partially Paid/Paid:Status:ro,list,filter,def=Unpaid',
  ], { schema: 'finance', disp: ['bill_ref'], children: [['vendor_payments', 'bill_id', 'Payments']] });

  R('vendor_payments', 'finance', 'Vendor Payments', [
    'bill_id:ref=vendor_bills:Bill:req',
    'amount:money:Amount:req,list',
    'pay_date:date:Date:req,list,def=today',
    'method:select=Bank transfer/Cheque/Cash:Method:list',
    'reference:text:Reference:list',
  ], { schema: 'finance', menu: false, disp: ['id'], hooks: { after: 'vendorPaymentAfter' } });

  R('bank_accounts', 'finance', 'Bank Accounts', [
    'name:text:Account label:req,list,search',
    'bank_name:text:Bank:list',
    'currency:text:Currency:list,def=QAR',
    'active:bool:Active:list,def=true',
  ], { schema: 'finance', help: 'Store only a label here, never full account numbers.', children: [['bank_statement_lines', 'bank_account_id', 'Statement lines']] });

  R('bank_statement_lines', 'finance', 'Bank Statement Lines', [
    'bank_account_id:ref=bank_accounts:Bank account:req,list',
    'line_date:date:Date:req,list',
    'description:text:Description:list',
    'debit:money:Debit:list,def=0',
    'credit:money:Credit:list,def=0',
    'matched:bool:Reconciled:list,def=false',
    'matched_ref:text:Matched with:list',
  ], { schema: 'finance', menu: false, disp: ['description'] });

  /* ================= HR ================= */
  R('employees', 'hr', 'Employees', [
    'emp_no:text:Employee no:list,search,uniq,auto=EMP/5',
    'full_name:text::req,list,search',
    'designation:text:Designation:list',
    'department_id:ref=departments:Department:list,filter',
    'user_id:ref=users:System user',
    'join_date:date:Joining date:list',
    'phone:phone',
    'email:email',
    'qid_no:text:QID no',
    'qid_expiry:date:QID expiry:list',
    'rp_expiry:date:Residence permit expiry:list',
    'passport_expiry:date:Passport expiry',
    'licence_no:text:DHP licence no',
    'licence_expiry:date:Licence expiry:list',
    'basic_salary:money:Basic salary:list',
    'allowance:money:Allowances:list',
    'status:select=Active/On leave/Resigned:Status:list,filter,def=Active',
  ], { schema: 'hr', disp: ['emp_no', 'full_name'], help: 'QID, residence permit and licence expiries are highlighted on the HR dashboard report.' });

  R('rosters', 'hr', 'Duty Roster', [
    'employee_id:ref=employees:Employee:req,list',
    'roster_date:date:Date:req,list',
    'shift:select=Morning/Evening/Night/Off/On-call:Shift:req,list,filter',
    'notes:text',
  ], { schema: 'hr', disp: ['id'] });

  R('attendance', 'hr', 'Attendance', [
    'employee_id:ref=employees:Employee:req,list',
    'att_date:date:Date:req,list,def=today',
    'check_in:time:Check in:list',
    'check_out:time:Check out:list',
    'status:select=Present/Absent/Late/Leave/Holiday:Status:list,filter,def=Present',
    'remarks:text',
  ], { schema: 'hr', disp: ['id'] });

  R('leaves', 'hr', 'Leave Requests', [
    'employee_id:ref=employees:Employee:req,list',
    'leave_type:select=Annual/Sick/Emergency/Unpaid/Other:Type:req,list',
    'from_date:date:From:req,list',
    'to_date:date:To:req,list',
    'days:int:Days:list',
    'status:select=Requested/Approved/Rejected:Status:ro,list,filter,def=Requested',
    'approved_by:ref=users:Approved by:ro',
    'reason:text',
  ], {
    schema: 'hr', disp: ['id'],
    actions: [{ name: 'approve', label: 'Approve', confirm: true }, { name: 'reject', label: 'Reject', confirm: true }],
  });

  R('payroll_runs', 'hr', 'Payroll Runs', [
    'period:text:Period (YYYY-MM):req,list,uniq',
    'status:select=Draft/Approved/Paid:Status:ro,list,filter,def=Draft',
    'total:money:Total net pay:ro,list',
  ], {
    schema: 'hr', disp: ['period'], children: [['payslips', 'run_id', 'Payslips']],
    actions: [
      { name: 'generate', label: 'Generate payslips', confirm: true },
      { name: 'approve', label: 'Approve run', confirm: true },
      { name: 'markpaid', label: 'Mark as paid', confirm: true },
    ],
    help: 'Salary file export in the official WPS format depends on your bank; the payslip table holds all fields needed to produce it.',
  });

  R('payslips', 'hr', 'Payslips', [
    'run_id:ref=payroll_runs:Run:req',
    'employee_id:ref=employees:Employee:req,list',
    'basic:money:Basic:list',
    'allowance:money:Allowances:list',
    'deductions:money:Deductions:list,def=0',
    'net:money:Net pay:list',
    'notes:text',
  ], { schema: 'hr', menu: false, disp: ['id'], hooks: { before: 'payslipBefore' } });

  R('doctor_revenue_share', 'hr', 'Doctor Revenue Share', [
    'doctor_id:ref=doctors:Doctor:req,list',
    'category:select=All/Consultation/Lab/Radiology/Procedure/Pharmacy:Service category:req,list',
    'share_pct:decimal:Doctor share %:req,list',
    'active:bool:Active:list,def=true',
  ], { schema: 'hr', disp: ['id'] });

  /* ================= ASSETS ================= */
  R('equipment', 'assets', 'Equipment Register', [
    'asset_no:text:Asset no:list,search,uniq,auto=AST/5',
    'name:text::req,list,search',
    'department_id:ref=departments:Department:list',
    'model:text:Model',
    'serial_no:text:Serial no:list',
    'manufacturer:text',
    'purchase_date:date:Purchase date',
    'warranty_to:date:Warranty until:list',
    'last_service:date:Last service',
    'calibration_due:date:Calibration due:list',
    'status:select=In service/Under repair/Out of service/Retired:Status:list,filter,def=In service',
    'location:text:Location:list',
  ], { schema: 'assets', children: [['maintenance_tickets', 'equipment_id']] });

  R('maintenance_tickets', 'assets', 'Maintenance Tickets', [
    'ticket_no:text:Ticket no:list,search,uniq,auto=MT/6',
    'equipment_id:ref=equipment:Equipment:req,list',
    'issue:textarea:Issue:req,list',
    'priority:select=Low/Medium/High:Priority:list,def=Medium',
    'status:select=Open/In progress/Resolved/Closed:Status:list,filter,def=Open',
    'reported_by:ref=users:Reported by:ro,list',
    'reported_at:datetime:Reported at:list,def=now',
    'resolved_on:date:Resolved on',
    'vendor:text:Service vendor',
    'cost:money:Cost',
  ], { schema: 'assets', disp: ['ticket_no'], hooks: { before: 'reportedByBefore' } });
};
