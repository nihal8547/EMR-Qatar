'use strict';
/* Laboratory + Radiology */
module.exports = (R) => {
  /* ================= LAB ================= */
  R('outsourced_labs', 'lab', 'Outsourced Labs', [
    'name:text::req,list,search',
    'contact_person:text',
    'phone:phone::list',
    'email:email',
    'tat_days:int:Turnaround (days):list',
    'active:bool:Active:list,def=true',
  ], { schema: 'lab' });

  R('lab_tests', 'lab', 'Test Catalogue', [
    'code:text::req,list,search,uniq',
    'name:text::req,list,search',
    'service_id:ref=services:Billing service:list',
    'sample_type:select=Blood/Serum/Plasma/Urine/Stool/Swab/Other:Sample:list,filter',
    'unit:text:Unit:list',
    'ref_low:decimal:Reference low:list',
    'ref_high:decimal:Reference high:list',
    'critical_low:decimal:Critical low',
    'critical_high:decimal:Critical high',
    'tat_hours:int:TAT (hours):list',
    'method:text',
    'outsourced:bool:Outsourced:def=false',
    'outsourced_lab_id:ref=outsourced_labs:Outsourced lab',
    'active:bool:Active:list,def=true',
  ], { schema: 'lab', disp: ['code', 'name'], help: 'Reference ranges drive the Low / High / Critical flags automatically when results are entered.' });

  R('lab_panels', 'lab', 'Test Panels', [
    'name:text::req,list,search',
    'description:text::list',
    'active:bool:Active:list,def=true',
  ], { schema: 'lab', children: [['lab_panel_tests', 'panel_id', 'Tests in panel']] });

  R('lab_panel_tests', 'lab', 'Panel Tests', [
    'panel_id:ref=lab_panels:Panel:req',
    'test_id:ref=lab_tests:Test:req,list',
  ], { schema: 'lab', menu: false, disp: ['id'] });

  R('lab_orders', 'lab', 'Lab Orders', [
    'order_no:text:Order no:list,search,uniq,auto=LAB/6',
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient:list',
    'doctor_id:ref=doctors:Doctor:list',
    'status:select=Ordered/Collected/In Progress/Resulted/Validated/Cancelled:Status:list,filter,def=Ordered',
    'priority:select=Routine/Urgent/STAT:Priority:list,filter,def=Routine',
    'ordered_at:datetime:Ordered at:list,def=now',
    'notes:text',
  ], {
    schema: 'lab', fromVisit: true, disp: ['order_no'],
    children: [['lab_order_items', 'order_id', 'Tests & results'], ['specimens', 'order_id']],
  });

  R('lab_order_items', 'lab', 'Lab Order Items', [
    'order_id:ref=lab_orders:Order:req',
    'test_id:ref=lab_tests:Test:req,list',
    'result_value:decimal:Result (numeric):list',
    'result_text:text:Result (text):list',
    'flag:select=Normal/Low/High/Critical Low/Critical High:Flag:ro,list',
    'status:select=Pending/Resulted/Validated:Status:ro,list,def=Pending',
    'resulted_by:ref=users:Resulted by:ro',
    'resulted_at:datetime:Resulted at:ro',
    'validated_by:ref=users:Validated by:ro',
    'validated_at:datetime:Validated at:ro',
  ], { schema: 'lab', menu: false, disp: ['id'], hooks: { after: 'labItemAfter' } });

  R('specimens', 'lab', 'Specimens', [
    'order_id:ref=lab_orders:Order:req,list',
    'barcode:text:Barcode:list,search,uniq,auto=SPC/7',
    'sample_type:text:Sample type:list',
    'collected_at:datetime:Collected at:list,def=now',
    'collected_by:ref=users:Collected by',
    'status:select=Collected/Received/Rejected:Status:list,filter,def=Collected',
    'rejection_reason:text',
  ], { schema: 'lab', disp: ['barcode'] });

  R('qc_runs', 'lab', 'Quality Control Runs', [
    'test_id:ref=lab_tests:Test:req,list',
    'level:select=Level 1/Level 2/Level 3:Level:list',
    'run_date:date:Date:req,list,def=today',
    'mean_value:decimal:Target mean:req,list',
    'sd_value:decimal:Target SD:req',
    'measured:decimal:Measured:req,list',
    'z_score:decimal:Z-score:ro,list',
    'status:select=Pass/Warning/Fail:Status:ro,list,filter',
    'comments:text',
  ], { schema: 'lab', disp: ['id'], hooks: { before: 'qcBefore' }, help: 'Z-score within ±2 = Pass, ±2 to ±3 = Warning, beyond ±3 = Fail.' });

  R('analyzers', 'lab', 'Analyzers (Interface Config)', [
    'name:text::req,list,search',
    'model:text:Model:list',
    'protocol:select=HL7/ASTM/File drop:Protocol:list',
    'location:text:Location:list',
    'status:select=Connected/Offline/Maintenance:Status:list,def=Offline',
    'notes:textarea',
  ], { schema: 'lab', help: 'Device protocol adapters are an integration task per analyzer model. Results can be entered manually or via the result API.' });

  /* ================= RADIOLOGY ================= */
  R('imaging_modalities', 'radiology', 'Modalities', [
    'name:text::req,list,search',
    'code:text::list,uniq',
    'room:text:Room:list',
    'active:bool:Active:list,def=true',
  ], { schema: 'radiology' });

  R('imaging_orders', 'radiology', 'Imaging Orders', [
    'order_no:text:Order no:list,search,uniq,auto=IMG/6',
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient:list',
    'doctor_id:ref=doctors:Doctor:list',
    'service_id:ref=services:Study / service:req,list',
    'modality_id:ref=imaging_modalities:Modality:list',
    'status:select=Ordered/Scheduled/In Progress/Scanned/Reported:Status:list,filter,def=Ordered',
    'priority:select=Routine/Urgent/STAT:Priority:list,def=Routine',
    'clinical_info:text:Clinical information',
    'ordered_at:datetime:Ordered at:list,def=now',
  ], { schema: 'radiology', fromVisit: true, disp: ['order_no'], children: [['imaging_reports', 'order_id', 'Report']], hooks: { after: 'imagingOrderAfter' } });

  R('imaging_reports', 'radiology', 'Imaging Reports', [
    'order_id:ref=imaging_orders:Order:req,list',
    'findings:textarea:Findings:req',
    'impression:textarea:Impression:req,list',
    'reported_by:ref=users:Reported by',
    'status:select=Draft/Final:Status:list,def=Draft',
    'reported_at:datetime:Reported at:list,def=now',
  ], { schema: 'radiology', disp: ['id'], hooks: { after: 'imagingReportAfter' } });
};
