'use strict';
/* Front office (mpi + scheduling tables live in schema "mpi" / "scheduling") and Clinical schema */
module.exports = (R) => {
  /* ================= MPI (patients) ================= */
  R('patients', 'front', 'Patients', [
    'mrn:text:MRN:list,search,uniq,auto=MRN/6',
    'qid:text:QID / Residence ID:list,search',
    'passport_no:text:Passport no',
    'full_name:text:Full name:req,list,search',
    'full_name_ar:text:Name (Arabic)',
    'dob:date:Date of birth:req,list',
    'gender:select=Male/Female:Gender:req,list,filter',
    'nationality_id:ref=nationalities:Nationality:list',
    'marital_status:select=Single/Married/Divorced/Widowed:Marital status',
    'phone:phone:Mobile:req,list,search',
    'email:email',
    'address:text',
    'blood_group:select=A+/A-/B+/B-/AB+/AB-/O+/O-:Blood group',
    'language:select=English/Arabic/Malayalam/Hindi/Urdu/Tagalog/Other:Preferred language',
    'whatsapp_ok:bool:OK to send WhatsApp messages:def=true',
    'occupation:text',
    'employer_id:ref=corporate_accounts:Employer (corporate account)',
    'emergency_name:text:Emergency contact',
    'emergency_phone:phone:Emergency phone',
    'notes:textarea',
    'active:bool:Active:def=true',
  ], {
    schema: 'mpi',
    disp: ['mrn', 'full_name'],
    children: [
      ['patient_allergies', 'patient_id'],
      ['patient_family', 'patient_id', 'Family / dependants'],
      ['patient_documents', 'patient_id'],
      ['consents', 'patient_id'],
      ['policy_members', 'patient_id', 'Insurance policies'],
    ],
    hooks: { before: 'patientBefore' },
    help: 'Duplicate check runs on QID, passport and phone + date of birth.',
  });

  R('patient_family', 'front', 'Family / Dependants', [
    'patient_id:ref=patients:Patient:req',
    'name:text::req,list',
    'relation:select=Spouse/Child/Parent/Sibling/Other:Relation:list',
    'phone:phone:Phone:list',
    'related_patient_id:ref=patients:Linked patient record',
  ], { schema: 'mpi', menu: false, disp: ['name'] });

  R('patient_allergies', 'front', 'Allergies', [
    'patient_id:ref=patients:Patient:req',
    'allergen:text:Allergen (use generic drug name for drugs):req,list',
    'reaction:text::list',
    'severity:select=Mild/Moderate/Severe:Severity:list',
    'noted_on:date:Noted on:def=today',
  ], { schema: 'mpi', menu: false, disp: ['allergen'] });

  R('patient_documents', 'front', 'Patient Documents', [
    'patient_id:ref=patients:Patient:req',
    'doc_type:select=QID/Passport/Insurance card/Referral/Report/Other:Type:req,list',
    'file_name:text:File name / reference:list',
    'expiry:date:Expiry:list',
    'notes:text',
  ], { schema: 'mpi', menu: false, disp: ['doc_type'] });

  R('consents', 'front', 'Consents', [
    'patient_id:ref=patients:Patient:req',
    'consent_type:select=Treatment/Data processing (PDPPL)/Telemedicine/Marketing/Data sharing (QHIE):Type:req,list',
    'signed_at:datetime:Signed at:list,def=now',
    'version:text:Form version',
    'witness:text',
    'withdrawn:bool:Withdrawn:list,def=false',
  ], { schema: 'mpi', menu: false, disp: ['consent_type'] });

  /* ================= Scheduling ================= */
  R('doctor_schedules', 'front', 'Doctor Schedules', [
    'doctor_id:ref=doctors:Doctor:req,list,filter',
    'weekday:select=Sunday/Monday/Tuesday/Wednesday/Thursday/Friday/Saturday:Weekday:req,list',
    'start_time:time:From:req,list',
    'end_time:time:To:req,list',
    'slot_minutes:int:Slot (minutes):list,def=15',
    'room:text:Room:list',
    'active:bool:Active:list,def=true',
  ], { schema: 'scheduling', disp: ['weekday'] });

  R('appointments', 'front', 'Appointments', [
    'appt_no:text:Appointment no:list,search,uniq,auto=APT/6',
    'patient_id:ref=patients:Patient:req,list',
    'doctor_id:ref=doctors:Doctor:req,list,filter',
    'department_id:ref=departments:Department',
    'appt_date:date:Date:req,list,def=today',
    'appt_time:time:Time:req,list',
    'type:select=In-person/Tele-consult/Follow-up/Procedure:Type:list,def=In-person',
    'status:select=Booked/Confirmed/Arrived/Completed/Cancelled/No-show:Status:list,filter,def=Booked',
    'channel:select=Walk-in/Phone/Online/WhatsApp:Channel:def=Phone',
    'meeting_link:text:Tele-consult link',
    'reason:text',
    'reminder_sent:bool:Reminder sent:def=false',
  ], { schema: 'scheduling', disp: ['appt_no'], hooks: { before: 'appointmentBefore' } });

  R('visits', 'front', 'Visits', [
    'visit_no:text:Visit no:list,search,uniq,auto=VIS/6',
    'patient_id:ref=patients:Patient:req,list',
    'doctor_id:ref=doctors:Doctor:list,filter',
    'department_id:ref=departments:Department:list',
    'visit_date:date:Date:list,def=today',
    'visit_type:select=OPD/Emergency/Follow-up/Tele/Walk-in:Type:list,filter,def=OPD',
    'status:select=Registered/Triage/With Doctor/Diagnostics/Pharmacy/Billing/Completed/Cancelled:Status:list,filter,def=Registered',
    'payer_type:select=Cash/Insurance/Corporate:Payer type:req,list,filter,def=Cash',
    'policy_id:ref=policy_members:Insurance policy',
    'corporate_id:ref=corporate_accounts:Corporate account',
    'eligibility_status:select=Not checked/Eligible/Not eligible:Eligibility:list,def=Not checked',
    'token_no:int:Token:ro,list',
    'complaint:text',
    'referred_by:text:Referred by (outside doctor / clinic)',
    'appointment_id:ref=appointments:Appointment',
    'closed_at:datetime:Closed at:ro',
    'cancel_reason:text:Cancel reason:ro',
    'cancelled_by:ref=users:Cancelled by:ro',
    'discount_type:select=percent/amount:Check-in discount type:ro',
    'discount_value:decimal:Check-in discount value:ro',
    'discount_reason:text:Discount reason:ro',
    'discount_status:select=Applied/Pending approval/Rejected:Discount status:ro,list,filter',
    'discount_by:ref=users:Discount given by:ro',
  ], {
    schema: 'scheduling',
    noCreate: true,
    disp: ['visit_no'],
    orderBy: '"id" DESC',
    help: 'Visits are created from "Start Visit (Check-in)" so consultation charge, token and eligibility are handled automatically.',
  });

  /* ================= Clinical ================= */
  R('vitals', 'clinical', 'Vitals (Triage)', [
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient',
    'temperature:decimal:Temp (°C):list',
    'pulse:int:Pulse (bpm):list',
    'bp_systolic:int:BP systolic:list',
    'bp_diastolic:int:BP diastolic:list',
    'resp_rate:int:Resp. rate',
    'spo2:int:SpO2 %',
    'weight_kg:decimal:Weight (kg)',
    'height_cm:decimal:Height (cm)',
    'head_circ_cm:decimal:Head circumference (cm)',
    'pain_score:int:Pain (0-10)',
    'triage_level:select=1 - Resuscitation/2 - Emergent/3 - Urgent/4 - Less urgent/5 - Non-urgent:Triage level:list',
    'notes:text',
    'recorded_at:datetime:Recorded at:list,def=now',
  ], { schema: 'clinical', fromVisit: true, disp: ['id'], hooks: { after: 'vitalsAfter' } });

  R('nursing_notes', 'clinical', 'Nursing Notes', [
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient',
    'note:textarea:Note:req,list',
    'noted_at:datetime:Noted at:list,def=now',
  ], { schema: 'clinical', fromVisit: true, disp: ['id'] });

  R('diagnosis_codes', 'clinical', 'Diagnosis Codes', [
    'code:text::req,list,search,uniq',
    'description:text::req,list,search',
    'code_system:select=ICD-10/ICD-10-CM/Other:Code system:list,def=ICD-10',
    'active:bool:Active:list,def=true',
  ], { schema: 'clinical', disp: ['code', 'description'], help: 'Sample codes are loaded for demo. Replace with the national MOPH-approved code set before go-live.' });

  R('encounters', 'clinical', 'Consultation Notes (Encounters)', [
    'visit_id:ref=visits:Visit:req,list,uniq',
    'patient_id:ref=patients:Patient:list',
    'doctor_id:ref=doctors:Doctor:list',
    'chief_complaint:text:Chief complaint:list',
    'history:textarea:History of present illness',
    'examination:textarea:Examination',
    'assessment:textarea:Assessment',
    'plan:textarea:Plan',
    'follow_up_date:date:Follow-up date',
    'status:select=Open/Completed:Status:list,def=Open',
  ], { schema: 'clinical', fromVisit: true, disp: ['id'] });

  R('diagnoses', 'clinical', 'Diagnoses', [
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient',
    'code_id:ref=diagnosis_codes:Diagnosis:req,list',
    'dx_type:select=Primary/Secondary:Type:list,def=Primary',
    'notes:text',
  ], { schema: 'clinical', fromVisit: true, menu: false, disp: ['id'] });

  R('prescriptions', 'clinical', 'Prescriptions', [
    'rx_no:text:Rx no:list,search,uniq,auto=RX/6',
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient:list',
    'doctor_id:ref=doctors:Doctor:list',
    'status:select=Pending/Partially Dispensed/Dispensed/Cancelled:Status:list,filter,def=Pending',
    'notes:text',
  ], { schema: 'clinical', fromVisit: true, disp: ['rx_no'], children: [['prescription_items', 'prescription_id', 'Medicines']] });

  R('prescription_items', 'clinical', 'Prescription Items', [
    'prescription_id:ref=prescriptions:Prescription:req',
    'drug_id:ref=drugs:Drug:req,list',
    'dose:text:Dose:list',
    'frequency:text:Frequency (e.g. 1-0-1):list',
    'route:select=Oral/IV/IM/Topical/Inhaled/Eye-Ear drops/Other:Route:def=Oral',
    'duration_days:int:Days:list',
    'qty:int:Quantity:req,list',
    'instructions:text:Instructions',
    'dispensed_qty:int:Dispensed:ro,list,def=0',
  ], { schema: 'clinical', menu: false, disp: ['id'] });

  R('procedure_orders', 'clinical', 'Procedure Orders', [
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient',
    'service_id:ref=services:Procedure / service:req,list',
    'status:select=Ordered/Done/Cancelled:Status:list,filter,def=Ordered',
    'performed_by:ref=users:Performed by',
    'notes:text',
  ], { schema: 'clinical', fromVisit: true, disp: ['id'] });

  R('certificates', 'clinical', 'Medical Certificates', [
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient',
    'cert_type:select=Sick leave/Fitness/Medical report:Type:req,list',
    'days:int:Days:list',
    'from_date:date:From:list,def=today',
    'remarks:textarea',
    'issued_by:ref=doctors:Issued by',
  ], { schema: 'clinical', fromVisit: true, disp: ['id'] });

  R('referrals', 'clinical', 'Referral Letters', [
    'visit_id:ref=visits:Visit:req,list',
    'patient_id:ref=patients:Patient',
    'to_facility:text:Refer to (facility / doctor):req,list',
    'to_department:text',
    'urgency:select=Routine/Urgent:Urgency:list,def=Routine',
    'reason:textarea:Reason / summary',
  ], { schema: 'clinical', fromVisit: true, disp: ['to_facility'] });
};
