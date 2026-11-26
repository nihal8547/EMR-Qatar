'use strict';
/** Paediatrics: vaccine master + schedule, immunisation register, growth measurements (WHO growth charts). */
module.exports = (R) => {
  R('vaccines', 'clinical', 'Vaccine Master', [
    'code:text:Code:req,list,search,uniq',
    'name:text:Vaccine:req,list,search',
    'protects_against:text:Protects against:list,search',
    'route:select=IM/SC/Oral/ID/Intranasal:Route:list,def=IM',
    'usual_site:text:Usual site',
    'active:bool:Active:list,filter,def=true',
  ], { schema: 'clinical', disp: ['name'], children: [['vaccine_schedule', 'vaccine_id', 'Schedule (doses and ages)']], help: 'Vaccines used at this centre. The national schedule (dose ages) is edited under each vaccine and drives the due / overdue calculation.' });

  R('vaccine_schedule', 'clinical', 'Vaccine Schedule', [
    'vaccine_id:ref=vaccines:Vaccine:req,list',
    'dose_no:int:Dose no:req,list,def=1',
    'label:text:Dose label (e.g. Booster):list',
    'due_age_months:int:Due at age (months):req,list,def=0',
    'window_months:int:Grace window (months):list,def=1',
    'routine:bool:Routine (counts as overdue):list,def=true',
    'notes:text',
  ], { schema: 'clinical', disp: ['id'], menu: false });

  R('immunizations', 'clinical', 'Immunisation Register', [
    'patient_id:ref=patients:Patient:req,list,search',
    'vaccine_id:ref=vaccines:Vaccine:req,list,filter',
    'dose_no:int:Dose no:req,list,def=1',
    'status:select=Given/Refused/Deferred:Status:req,list,filter,def=Given',
    'given_on:date:Date:req,list,def=today',
    'source:select=This centre/Outside (vaccination card)/Other country:Source:list,filter,def=This centre',
    'batch_no:text:Batch / lot no:list',
    'expiry_date:date:Vaccine expiry',
    'site:select=Left thigh/Right thigh/Left arm/Right arm/Oral/Other:Site',
    'visit_id:ref=visits:Visit',
    'recorded_by:ref=users:Recorded by:ro,list',
    'notes:text',
  ], { schema: 'clinical', disp: ['id'], hooks: { before: 'immunizationBefore' }, help: 'Record each vaccine dose here, or from the Vaccinations page. Doses taken outside (vaccination card, another country) are recorded with the matching Source.' });

  R('growth_measurements', 'clinical', 'Growth Measurements', [
    'patient_id:ref=patients:Patient:req,list,search',
    'measured_on:date:Date:req,list,def=today',
    'weight_kg:decimal:Weight (kg):list',
    'height_cm:decimal:Length / height (cm):list',
    'head_circ_cm:decimal:Head circumference (cm):list',
    'source:select=This centre/Outside (growth card)/Parent reported:Source:list,def=This centre',
    'recorded_by:ref=users:Recorded by:ro,list',
    'notes:text',
  ], { schema: 'clinical', disp: ['id'], hooks: { before: 'growthBefore' }, help: 'Length is measured lying down below 2 years and height standing from 2 years. Triage vitals (weight, height, head circumference) also appear on the growth chart automatically.' });
};
