'use strict';
/** Dental: chart entries (FDI notation), treatment plans and plan items. */
module.exports = (R) => {
  const CONDITIONS = 'Healthy/Caries/Filling/Crown/Bridge/Root canal/Implant/Missing/Extracted/Fractured/Impacted/Sealant/Veneer/Mobility/Periapical lesion/Planned extraction';
  R('dental_chart_entries', 'dental', 'Dental Chart Entries', [
    'patient_id:ref=patients:Patient:req,list,search',
    'visit_id:ref=visits:Visit:list',
    'dentition:select=Permanent/Primary:Dentition:req,list,def=Permanent',
    'tooth_no:text:Tooth no (FDI):req,list,search',
    `surface:select=Whole tooth/M/O/D/B/L/MO/DO/MOD/Incisal/Cervical/Root:Surface:list,def=Whole tooth`,
    `condition:select=${CONDITIONS}:Condition:req,list,filter`,
    'entry_date:date:Date:req,list,def=today',
    'recorded_by:ref=users:Recorded by:ro,list',
    'notes:text',
  ], { schema: 'dental', disp: ['tooth_no'], hooks: { before: 'dentalEntryBefore' }, help: 'Teeth use FDI notation: permanent 11-18, 21-28, 31-38, 41-48; primary 51-55, 61-65, 71-75, 81-85. Use the Dental Chart page for the visual chart.' });

  R('dental_treatment_plans', 'dental', 'Dental Treatment Plans', [
    'plan_no:text:Plan no:list,search,uniq,auto=DTP/5',
    'patient_id:ref=patients:Patient:req,list,search',
    'doctor_id:ref=doctors:Dentist:list',
    'plan_date:date:Date:req,list,def=today',
    'status:select=Proposed/Accepted/In Progress/Completed/Cancelled:Status:list,filter,def=Proposed',
    'total:money:Plan total (QAR):ro,list',
    'notes:textarea',
  ], { schema: 'dental', disp: ['plan_no'], children: [['dental_plan_items', 'plan_id', 'Planned procedures'], ], hooks: { before: 'dentalPlanBefore' } });

  R('dental_plan_items', 'dental', 'Dental Plan Items', [
    'plan_id:ref=dental_treatment_plans:Plan:req,list',
    'dentition:select=Permanent/Primary:Dentition:def=Permanent',
    'tooth_no:text:Tooth no (blank = whole mouth):list',
    'surface:select=Whole tooth/M/O/D/B/L/MO/DO/MOD/Incisal/Cervical/Root:Surface:def=Whole tooth',
    'service_id:ref=services:Procedure:req,list',
    'fee:money:Fee (QAR):list',
    'status:select=Planned/Completed/Cancelled:Status:list,filter,def=Planned,ro',
    'done_on:date:Done on:ro,list',
    'done_visit_id:ref=visits:Done in visit:ro',
    'notes:text',
  ], { schema: 'dental', disp: ['id'], menu: false, hooks: { before: 'dentalItemBefore', after: 'dentalItemAfter' } });
};
