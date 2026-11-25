'use strict';
/* Pharmacy + Inventory */
module.exports = (R) => {
  /* ================= PHARMACY ================= */
  R('drugs', 'pharmacy', 'Drug Master', [
    'code:text::list,search,uniq',
    'generic_name:text:Generic name:req,list,search',
    'brand_name:text:Brand name:list,search',
    'form:select=Tablet/Capsule/Syrup/Injection/Cream/Drops/Inhaler/Other:Form:list,filter',
    'strength:text:Strength:list',
    'unit:text:Unit (e.g. tab, ml):def=unit',
    'schedule:select=Normal/Controlled/Narcotic:Schedule:req,list,filter,def=Normal',
    'price:money:Selling price (QAR) per unit:req,list',
    'reorder_level:int:Reorder level:list,def=10',
    'requires_prescription:bool:Prescription only:def=true',
    'active:bool:Active:list,def=true',
  ], { schema: 'pharmacy', disp: ['generic_name', 'strength'], help: 'Controlled / Narcotic drugs write to the controlled drug register on every dispense.' });

  R('drug_interactions', 'pharmacy', 'Drug Interactions', [
    'drug_a_id:ref=drugs:Drug A:req,list',
    'drug_b_id:ref=drugs:Drug B:req,list',
    'severity:select=Minor/Moderate/Major/Contraindicated:Severity:req,list,filter',
    'note:text:Clinical note:list',
  ], { schema: 'pharmacy', disp: ['id'] });

  R('pharmacy_dispenses', 'pharmacy', 'Dispense History', [
    'dispense_no:text:Dispense no:list,search,uniq,auto=DSP/6',
    'visit_id:ref=visits:Visit:list',
    'prescription_id:ref=prescriptions:Prescription:list',
    'patient_id:ref=patients:Patient:list',
    'status:select=Complete/Partial:Status:list',
    'dispensed_by:ref=users:Dispensed by:list',
    'dispensed_at:datetime:Dispensed at:list',
    'total:money:Total:list',
  ], { schema: 'pharmacy', readonly: true, disp: ['dispense_no'], children: [['dispense_items', 'dispense_id', 'Items']] });

  R('dispense_items', 'pharmacy', 'Dispense Items', [
    'dispense_id:ref=pharmacy_dispenses:Dispense:req',
    'drug_id:ref=drugs:Drug:req,list',
    'batch_id:ref=stock_batches:Batch:list',
    'qty:int:Qty:list',
    'unit_price:money:Unit price:list',
  ], { schema: 'pharmacy', menu: false, readonly: true, disp: ['id'] });

  R('controlled_register', 'pharmacy', 'Controlled Drug Register', [
    'drug_id:ref=drugs:Drug:req,list,filter',
    'batch_id:ref=stock_batches:Batch:list',
    'movement:select=In/Out:Movement:list,filter',
    'qty:int:Qty:list',
    'balance:int:Running balance:list',
    'patient_id:ref=patients:Patient:list',
    'prescription_id:ref=prescriptions:Prescription',
    'performed_by:ref=users:Performed by:list',
    'witness:text:Witness',
    'entry_at:datetime:Date / time:list',
  ], { schema: 'pharmacy', readonly: true, disp: ['id'] });

  R('otc_sales', 'pharmacy', 'OTC Sales', [
    'receipt_no:text:Receipt no:list,search,uniq,auto=OTC/6',
    'customer_name:text:Customer:list',
    'patient_id:ref=patients:Patient',
    'total:money:Total:list',
    'payment_method:select=Cash/Card/Bank transfer:Payment:list',
    'sold_by:ref=users:Sold by:list',
    'sold_at:datetime:Sold at:list',
  ], { schema: 'pharmacy', readonly: true, disp: ['receipt_no'], children: [['otc_sale_items', 'sale_id', 'Items']] });

  R('otc_sale_items', 'pharmacy', 'OTC Sale Items', [
    'sale_id:ref=otc_sales:Sale:req',
    'drug_id:ref=drugs:Drug:req,list',
    'batch_id:ref=stock_batches:Batch',
    'qty:int:Qty:list',
    'unit_price:money:Unit price:list',
    'amount:money:Amount:list',
  ], { schema: 'pharmacy', menu: false, readonly: true, disp: ['id'] });

  /* ================= INVENTORY ================= */
  R('stores', 'inventory', 'Stores', [
    'name:text::req,list,search',
    'type:select=Pharmacy/Main store/Lab/Radiology/Ward/Other:Type:list,filter',
    'location:text:Location:list',
    'active:bool:Active:list,def=true',
  ], { schema: 'inventory' });

  R('items', 'inventory', 'Item Master (Non-drug)', [
    'code:text::req,list,search,uniq',
    'name:text::req,list,search',
    'category:select=Consumable/Reagent/Equipment/Stationery/Other:Category:list,filter',
    'unit:text:Unit:list',
    'reorder_level:int:Reorder level:list,def=10',
    'cost:money:Standard cost:list',
    'active:bool:Active:list,def=true',
  ], { schema: 'inventory' });

  R('suppliers', 'inventory', 'Suppliers', [
    'name:text::req,list,search',
    'contact_person:text',
    'phone:phone::list',
    'email:email::list',
    'address:text',
    'credit_days:int:Credit days:list,def=30',
    'tax_ref:text:Tax / CR no',
    'active:bool:Active:list,def=true',
  ], { schema: 'inventory' });

  R('stock_batches', 'inventory', 'Stock Batches', [
    'store_id:ref=stores:Store:req,list,filter',
    'drug_id:ref=drugs:Drug:list',
    'item_id:ref=items:Item:list',
    'batch_no:text:Batch no:req,list,search',
    'expiry_date:date:Expiry:list',
    'qty_on_hand:int:Qty on hand:list',
    'cost_price:money:Cost price:list',
    'received_on:date:Received on',
  ], { schema: 'inventory', readonly: true, disp: ['batch_no'], help: 'Stock changes only through GRN, dispense, adjustment and transfer posting.' });

  R('stock_ledger', 'inventory', 'Stock Ledger', [
    'store_id:ref=stores:Store:list,filter',
    'drug_id:ref=drugs:Drug:list',
    'item_id:ref=items:Item:list',
    'batch_id:ref=stock_batches:Batch:list',
    'movement:text:Movement:list,filter',
    'qty:int:Qty (+/-):list',
    'ref_no:text:Reference:list,search',
    'moved_by:ref=users:By:list',
    'moved_at:datetime:Date / time:list',
  ], { schema: 'inventory', readonly: true, disp: ['id'] });

  R('requisitions', 'inventory', 'Purchase Requisitions', [
    'req_no:text:Requisition no:list,search,uniq,auto=REQ/6',
    'store_id:ref=stores:Store:req,list',
    'requested_by:ref=users:Requested by:list',
    'status:select=Draft/Submitted/Approved/Rejected/Ordered:Status:list,filter,def=Draft',
    'notes:text',
  ], {
    schema: 'inventory', disp: ['req_no'], children: [['requisition_items', 'requisition_id', 'Lines']],
    actions: [{ name: 'approve', label: 'Approve', confirm: true }, { name: 'reject', label: 'Reject', confirm: true }],
  });

  R('requisition_items', 'inventory', 'Requisition Lines', [
    'requisition_id:ref=requisitions:Requisition:req',
    'drug_id:ref=drugs:Drug:list',
    'item_id:ref=items:Item:list',
    'qty:int:Qty:req,list',
    'notes:text',
  ], { schema: 'inventory', menu: false, disp: ['id'] });

  R('purchase_orders', 'inventory', 'Purchase Orders', [
    'po_no:text:PO no:list,search,uniq,auto=PO/6',
    'supplier_id:ref=suppliers:Supplier:req,list',
    'order_date:date:Order date:list,def=today',
    'expected_date:date:Expected date',
    'status:select=Draft/Approved/Partially Received/Received/Cancelled:Status:ro,list,filter,def=Draft',
    'total:money:Total:ro,list',
    'notes:text',
  ], {
    schema: 'inventory', disp: ['po_no'], children: [['po_items', 'po_id', 'Lines']],
    actions: [{ name: 'approve', label: 'Approve PO', confirm: true }, { name: 'cancel', label: 'Cancel PO', confirm: true }],
  });

  R('po_items', 'inventory', 'PO Lines', [
    'po_id:ref=purchase_orders:PO:req',
    'drug_id:ref=drugs:Drug:list',
    'item_id:ref=items:Item:list',
    'qty:int:Qty:req,list',
    'unit_cost:money:Unit cost:req,list',
    'received_qty:int:Received:ro,list,def=0',
  ], { schema: 'inventory', menu: false, disp: ['id'], hooks: { after: 'poItemAfter' } });

  R('grns', 'inventory', 'Goods Receipts (GRN)', [
    'grn_no:text:GRN no:list,search,uniq,auto=GRN/6',
    'po_id:ref=purchase_orders:Purchase order:list',
    'supplier_id:ref=suppliers:Supplier:req,list',
    'store_id:ref=stores:Receive into store:req,list',
    'received_date:date:Received date:list,def=today',
    'invoice_no:text:Supplier invoice no:list',
    'status:select=Draft/Posted:Status:ro,list,filter,def=Draft',
    'notes:text',
  ], {
    schema: 'inventory', disp: ['grn_no'], children: [['grn_items', 'grn_id', 'Received items']],
    actions: [{ name: 'post', label: 'Post to stock', confirm: true }],
  });

  R('grn_items', 'inventory', 'GRN Lines', [
    'grn_id:ref=grns:GRN:req',
    'drug_id:ref=drugs:Drug:list',
    'item_id:ref=items:Item:list',
    'batch_no:text:Batch no:req,list',
    'expiry_date:date:Expiry:list',
    'qty:int:Qty:req,list',
    'unit_cost:money:Unit cost:req,list',
  ], { schema: 'inventory', menu: false, disp: ['id'] });

  R('stock_adjustments', 'inventory', 'Stock Adjustments', [
    'adj_no:text:Adjustment no:list,search,uniq,auto=ADJ/6',
    'store_id:ref=stores:Store:req,list',
    'batch_id:ref=stock_batches:Batch:req,list',
    'qty_change:int:Qty change (+ / -):req,list',
    'reason:select=Count variance/Damage/Expired/Other:Reason:req,list',
    'status:select=Draft/Posted:Status:ro,list,filter,def=Draft',
    'notes:text',
  ], { schema: 'inventory', disp: ['adj_no'], actions: [{ name: 'post', label: 'Post adjustment', confirm: true }] });

  R('stock_transfers', 'inventory', 'Stock Transfers', [
    'trf_no:text:Transfer no:list,search,uniq,auto=TRF/6',
    'from_store_id:ref=stores:From store:req,list',
    'to_store_id:ref=stores:To store:req,list',
    'batch_id:ref=stock_batches:Batch (in from-store):req,list',
    'qty:int:Qty:req,list',
    'status:select=Draft/Posted:Status:ro,list,filter,def=Draft',
    'notes:text',
  ], { schema: 'inventory', disp: ['trf_no'], actions: [{ name: 'post', label: 'Post transfer', confirm: true }] });
};
