-- Qatar HMS: generated from backend/src/registry. DO NOT EDIT BY HAND.
-- Regenerate with: npm run db:build
CREATE SCHEMA IF NOT EXISTS "admin";
CREATE SCHEMA IF NOT EXISTS "assets";
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE SCHEMA IF NOT EXISTS "billing";
CREATE SCHEMA IF NOT EXISTS "clinical";
CREATE SCHEMA IF NOT EXISTS "finance";
CREATE SCHEMA IF NOT EXISTS "hr";
CREATE SCHEMA IF NOT EXISTS "insurance";
CREATE SCHEMA IF NOT EXISTS "inventory";
CREATE SCHEMA IF NOT EXISTS "lab";
CREATE SCHEMA IF NOT EXISTS "mpi";
CREATE SCHEMA IF NOT EXISTS "pharmacy";
CREATE SCHEMA IF NOT EXISTS "radiology";
CREATE SCHEMA IF NOT EXISTS "scheduling";

CREATE TABLE IF NOT EXISTS "auth"."permissions" (
  "code" text PRIMARY KEY,
  "description" text
);
CREATE TABLE IF NOT EXISTS "auth"."role_permissions" (
  "role_id" bigint NOT NULL,
  "perm_code" text NOT NULL REFERENCES "auth"."permissions"("code") ON DELETE CASCADE,
  PRIMARY KEY ("role_id", "perm_code")
);
CREATE TABLE IF NOT EXISTS "admin"."counters" (
  "prefix" text PRIMARY KEY,
  "value" bigint NOT NULL DEFAULT 0
);
CREATE TABLE "admin"."branches" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "code" text,
  "phone" text,
  "address" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."departments" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "code" text,
  "type" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."specialities" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "name_ar" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."nationalities" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "name_ar" text,
  "iso_code" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."templates" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "type" text,
  "language" text,
  "subject" text,
  "body" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."integration_settings" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "type" text,
  "endpoint" text,
  "mode" text,
  "active" boolean,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."integration_logs" (
  "id" bigserial PRIMARY KEY,
  "integration" text,
  "direction" text,
  "reference" text,
  "status" text,
  "message" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."audit_log" (
  "id" bigserial PRIMARY KEY,
  "username" text,
  "action" text,
  "resource" text,
  "record_id" text,
  "ip" text,
  "details" jsonb,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "admin"."settings" (
  "id" bigserial PRIMARY KEY,
  "key" text,
  "value" text,
  "description" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "auth"."roles" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "description" text,
  "restrict_to_own_visits" boolean,
  "discount_limit_pct" numeric(14,3),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "auth"."users" (
  "id" bigserial PRIMARY KEY,
  "username" text,
  "full_name" text,
  "email" text,
  "phone" text,
  "role_id" bigint,
  "password_hash" text,
  "speciality_id" bigint,
  "department_id" bigint,
  "licence_no" text,
  "licence_expiry" date,
  "patient_id" bigint,
  "active" boolean,
  "last_login" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "mpi"."patients" (
  "id" bigserial PRIMARY KEY,
  "mrn" text,
  "qid" text,
  "passport_no" text,
  "full_name" text,
  "full_name_ar" text,
  "dob" date,
  "gender" text,
  "nationality_id" bigint,
  "marital_status" text,
  "phone" text,
  "email" text,
  "address" text,
  "blood_group" text,
  "language" text,
  "occupation" text,
  "employer_id" bigint,
  "emergency_name" text,
  "emergency_phone" text,
  "notes" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "mpi"."patient_family" (
  "id" bigserial PRIMARY KEY,
  "patient_id" bigint,
  "name" text,
  "relation" text,
  "phone" text,
  "related_patient_id" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "mpi"."patient_allergies" (
  "id" bigserial PRIMARY KEY,
  "patient_id" bigint,
  "allergen" text,
  "reaction" text,
  "severity" text,
  "noted_on" date,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "mpi"."patient_documents" (
  "id" bigserial PRIMARY KEY,
  "patient_id" bigint,
  "doc_type" text,
  "file_name" text,
  "expiry" date,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "mpi"."consents" (
  "id" bigserial PRIMARY KEY,
  "patient_id" bigint,
  "consent_type" text,
  "signed_at" timestamptz,
  "version" text,
  "witness" text,
  "withdrawn" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "scheduling"."doctor_schedules" (
  "id" bigserial PRIMARY KEY,
  "doctor_id" bigint,
  "weekday" text,
  "start_time" time,
  "end_time" time,
  "slot_minutes" integer,
  "room" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "scheduling"."appointments" (
  "id" bigserial PRIMARY KEY,
  "appt_no" text,
  "patient_id" bigint,
  "doctor_id" bigint,
  "department_id" bigint,
  "appt_date" date,
  "appt_time" time,
  "type" text,
  "status" text,
  "channel" text,
  "meeting_link" text,
  "reason" text,
  "reminder_sent" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "scheduling"."visits" (
  "id" bigserial PRIMARY KEY,
  "visit_no" text,
  "patient_id" bigint,
  "doctor_id" bigint,
  "department_id" bigint,
  "visit_date" date,
  "visit_type" text,
  "status" text,
  "payer_type" text,
  "policy_id" bigint,
  "corporate_id" bigint,
  "eligibility_status" text,
  "token_no" integer,
  "complaint" text,
  "appointment_id" bigint,
  "closed_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."vitals" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "temperature" numeric(14,3),
  "pulse" integer,
  "bp_systolic" integer,
  "bp_diastolic" integer,
  "resp_rate" integer,
  "spo2" integer,
  "weight_kg" numeric(14,3),
  "height_cm" numeric(14,3),
  "pain_score" integer,
  "triage_level" text,
  "notes" text,
  "recorded_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."nursing_notes" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "note" text,
  "noted_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."diagnosis_codes" (
  "id" bigserial PRIMARY KEY,
  "code" text,
  "description" text,
  "code_system" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."encounters" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "doctor_id" bigint,
  "chief_complaint" text,
  "history" text,
  "examination" text,
  "assessment" text,
  "plan" text,
  "follow_up_date" date,
  "status" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."diagnoses" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "code_id" bigint,
  "dx_type" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."prescriptions" (
  "id" bigserial PRIMARY KEY,
  "rx_no" text,
  "visit_id" bigint,
  "patient_id" bigint,
  "doctor_id" bigint,
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."prescription_items" (
  "id" bigserial PRIMARY KEY,
  "prescription_id" bigint,
  "drug_id" bigint,
  "dose" text,
  "frequency" text,
  "route" text,
  "duration_days" integer,
  "qty" integer,
  "instructions" text,
  "dispensed_qty" integer,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."procedure_orders" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "service_id" bigint,
  "status" text,
  "performed_by" bigint,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."certificates" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "cert_type" text,
  "days" integer,
  "from_date" date,
  "remarks" text,
  "issued_by" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "clinical"."referrals" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "to_facility" text,
  "to_department" text,
  "urgency" text,
  "reason" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."outsourced_labs" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "contact_person" text,
  "phone" text,
  "email" text,
  "tat_days" integer,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."lab_tests" (
  "id" bigserial PRIMARY KEY,
  "code" text,
  "name" text,
  "service_id" bigint,
  "sample_type" text,
  "unit" text,
  "ref_low" numeric(14,3),
  "ref_high" numeric(14,3),
  "critical_low" numeric(14,3),
  "critical_high" numeric(14,3),
  "tat_hours" integer,
  "method" text,
  "outsourced" boolean,
  "outsourced_lab_id" bigint,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."lab_panels" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "description" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."lab_panel_tests" (
  "id" bigserial PRIMARY KEY,
  "panel_id" bigint,
  "test_id" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."lab_orders" (
  "id" bigserial PRIMARY KEY,
  "order_no" text,
  "visit_id" bigint,
  "patient_id" bigint,
  "doctor_id" bigint,
  "status" text,
  "priority" text,
  "ordered_at" timestamptz,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."lab_order_items" (
  "id" bigserial PRIMARY KEY,
  "order_id" bigint,
  "test_id" bigint,
  "result_value" numeric(14,3),
  "result_text" text,
  "flag" text,
  "status" text,
  "resulted_by" bigint,
  "resulted_at" timestamptz,
  "validated_by" bigint,
  "validated_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."specimens" (
  "id" bigserial PRIMARY KEY,
  "order_id" bigint,
  "barcode" text,
  "sample_type" text,
  "collected_at" timestamptz,
  "collected_by" bigint,
  "status" text,
  "rejection_reason" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."qc_runs" (
  "id" bigserial PRIMARY KEY,
  "test_id" bigint,
  "level" text,
  "run_date" date,
  "mean_value" numeric(14,3),
  "sd_value" numeric(14,3),
  "measured" numeric(14,3),
  "z_score" numeric(14,3),
  "status" text,
  "comments" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "lab"."analyzers" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "model" text,
  "protocol" text,
  "location" text,
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "radiology"."imaging_modalities" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "code" text,
  "room" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "radiology"."imaging_orders" (
  "id" bigserial PRIMARY KEY,
  "order_no" text,
  "visit_id" bigint,
  "patient_id" bigint,
  "doctor_id" bigint,
  "service_id" bigint,
  "modality_id" bigint,
  "status" text,
  "priority" text,
  "clinical_info" text,
  "ordered_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "radiology"."imaging_reports" (
  "id" bigserial PRIMARY KEY,
  "order_id" bigint,
  "findings" text,
  "impression" text,
  "reported_by" bigint,
  "status" text,
  "reported_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "pharmacy"."drugs" (
  "id" bigserial PRIMARY KEY,
  "code" text,
  "generic_name" text,
  "brand_name" text,
  "form" text,
  "strength" text,
  "unit" text,
  "schedule" text,
  "price" numeric(14,2),
  "reorder_level" integer,
  "requires_prescription" boolean,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "pharmacy"."drug_interactions" (
  "id" bigserial PRIMARY KEY,
  "drug_a_id" bigint,
  "drug_b_id" bigint,
  "severity" text,
  "note" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "pharmacy"."pharmacy_dispenses" (
  "id" bigserial PRIMARY KEY,
  "dispense_no" text,
  "visit_id" bigint,
  "prescription_id" bigint,
  "patient_id" bigint,
  "status" text,
  "dispensed_by" bigint,
  "dispensed_at" timestamptz,
  "total" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "pharmacy"."dispense_items" (
  "id" bigserial PRIMARY KEY,
  "dispense_id" bigint,
  "drug_id" bigint,
  "batch_id" bigint,
  "qty" integer,
  "unit_price" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "pharmacy"."controlled_register" (
  "id" bigserial PRIMARY KEY,
  "drug_id" bigint,
  "batch_id" bigint,
  "movement" text,
  "qty" integer,
  "balance" integer,
  "patient_id" bigint,
  "prescription_id" bigint,
  "performed_by" bigint,
  "witness" text,
  "entry_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "pharmacy"."otc_sales" (
  "id" bigserial PRIMARY KEY,
  "receipt_no" text,
  "customer_name" text,
  "patient_id" bigint,
  "total" numeric(14,2),
  "payment_method" text,
  "sold_by" bigint,
  "sold_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "pharmacy"."otc_sale_items" (
  "id" bigserial PRIMARY KEY,
  "sale_id" bigint,
  "drug_id" bigint,
  "batch_id" bigint,
  "qty" integer,
  "unit_price" numeric(14,2),
  "amount" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."stores" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "type" text,
  "location" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."items" (
  "id" bigserial PRIMARY KEY,
  "code" text,
  "name" text,
  "category" text,
  "unit" text,
  "reorder_level" integer,
  "cost" numeric(14,2),
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."suppliers" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "contact_person" text,
  "phone" text,
  "email" text,
  "address" text,
  "credit_days" integer,
  "tax_ref" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."stock_batches" (
  "id" bigserial PRIMARY KEY,
  "store_id" bigint,
  "drug_id" bigint,
  "item_id" bigint,
  "batch_no" text,
  "expiry_date" date,
  "qty_on_hand" integer,
  "cost_price" numeric(14,2),
  "received_on" date,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."stock_ledger" (
  "id" bigserial PRIMARY KEY,
  "store_id" bigint,
  "drug_id" bigint,
  "item_id" bigint,
  "batch_id" bigint,
  "movement" text,
  "qty" integer,
  "ref_no" text,
  "moved_by" bigint,
  "moved_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."requisitions" (
  "id" bigserial PRIMARY KEY,
  "req_no" text,
  "store_id" bigint,
  "requested_by" bigint,
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."requisition_items" (
  "id" bigserial PRIMARY KEY,
  "requisition_id" bigint,
  "drug_id" bigint,
  "item_id" bigint,
  "qty" integer,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."purchase_orders" (
  "id" bigserial PRIMARY KEY,
  "po_no" text,
  "supplier_id" bigint,
  "order_date" date,
  "expected_date" date,
  "status" text,
  "total" numeric(14,2),
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."po_items" (
  "id" bigserial PRIMARY KEY,
  "po_id" bigint,
  "drug_id" bigint,
  "item_id" bigint,
  "qty" integer,
  "unit_cost" numeric(14,2),
  "received_qty" integer,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."grns" (
  "id" bigserial PRIMARY KEY,
  "grn_no" text,
  "po_id" bigint,
  "supplier_id" bigint,
  "store_id" bigint,
  "received_date" date,
  "invoice_no" text,
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."grn_items" (
  "id" bigserial PRIMARY KEY,
  "grn_id" bigint,
  "drug_id" bigint,
  "item_id" bigint,
  "batch_no" text,
  "expiry_date" date,
  "qty" integer,
  "unit_cost" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."stock_adjustments" (
  "id" bigserial PRIMARY KEY,
  "adj_no" text,
  "store_id" bigint,
  "batch_id" bigint,
  "qty_change" integer,
  "reason" text,
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "inventory"."stock_transfers" (
  "id" bigserial PRIMARY KEY,
  "trf_no" text,
  "from_store_id" bigint,
  "to_store_id" bigint,
  "batch_id" bigint,
  "qty" integer,
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."services" (
  "id" bigserial PRIMARY KEY,
  "code" text,
  "name" text,
  "category" text,
  "department_id" bigint,
  "price" numeric(14,2),
  "covered" boolean,
  "needs_preauth" boolean,
  "taxable" boolean,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."price_lists" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "payer_id" bigint,
  "corporate_id" bigint,
  "discount_pct" numeric(14,3),
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."price_list_items" (
  "id" bigserial PRIMARY KEY,
  "price_list_id" bigint,
  "service_id" bigint,
  "price" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."packages" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "price" numeric(14,2),
  "description" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."package_items" (
  "id" bigserial PRIMARY KEY,
  "package_id" bigint,
  "service_id" bigint,
  "qty" integer,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."charges" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "patient_id" bigint,
  "service_id" bigint,
  "description" text,
  "qty" numeric(14,3),
  "unit_price" numeric(14,2),
  "amount" numeric(14,2),
  "source" text,
  "source_id" integer,
  "status" text,
  "invoice_id" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."invoices" (
  "id" bigserial PRIMARY KEY,
  "invoice_no" text,
  "visit_id" bigint,
  "patient_id" bigint,
  "payer_type" text,
  "payer_id" bigint,
  "policy_id" bigint,
  "corporate_id" bigint,
  "invoice_date" date,
  "gross" numeric(14,2),
  "discount" numeric(14,2),
  "net" numeric(14,2),
  "patient_share" numeric(14,2),
  "payer_share" numeric(14,2),
  "paid" numeric(14,2),
  "balance" numeric(14,2),
  "payer_paid" numeric(14,2),
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."payments" (
  "id" bigserial PRIMARY KEY,
  "receipt_no" text,
  "invoice_id" bigint,
  "patient_id" bigint,
  "kind" text,
  "amount" numeric(14,2),
  "method" text,
  "reference" text,
  "cashier_id" bigint,
  "session_id" bigint,
  "paid_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."deposits" (
  "id" bigserial PRIMARY KEY,
  "patient_id" bigint,
  "amount" numeric(14,2),
  "method" text,
  "used" numeric(14,2),
  "status" text,
  "received_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."refunds" (
  "id" bigserial PRIMARY KEY,
  "refund_no" text,
  "invoice_id" bigint,
  "amount" numeric(14,2),
  "reason" text,
  "status" text,
  "requested_by" bigint,
  "approved_by" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."credit_notes" (
  "id" bigserial PRIMARY KEY,
  "cn_no" text,
  "invoice_id" bigint,
  "amount" numeric(14,2),
  "reason" text,
  "status" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."cashier_sessions" (
  "id" bigserial PRIMARY KEY,
  "user_id" bigint,
  "opened_at" timestamptz,
  "closed_at" timestamptz,
  "opening_cash" numeric(14,2),
  "expected_cash" numeric(14,2),
  "closing_cash" numeric(14,2),
  "variance" numeric(14,2),
  "status" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "billing"."discount_approvals" (
  "id" bigserial PRIMARY KEY,
  "invoice_id" bigint,
  "requested_pct" numeric(14,3),
  "reason" text,
  "status" text,
  "requested_by" bigint,
  "approved_by" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."payers" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "code" text,
  "type" text,
  "contact_person" text,
  "phone" text,
  "email" text,
  "credit_days" integer,
  "claim_format" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."plans" (
  "id" bigserial PRIMARY KEY,
  "payer_id" bigint,
  "name" text,
  "copay_pct" numeric(14,3),
  "copay_max" numeric(14,2),
  "annual_limit" numeric(14,2),
  "network" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."policy_members" (
  "id" bigserial PRIMARY KEY,
  "patient_id" bigint,
  "payer_id" bigint,
  "plan_id" bigint,
  "policy_no" text,
  "member_id" text,
  "relation" text,
  "valid_from" date,
  "valid_to" date,
  "status" text,
  "corporate_id" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."eligibility_checks" (
  "id" bigserial PRIMARY KEY,
  "visit_id" bigint,
  "policy_id" bigint,
  "status" text,
  "response" text,
  "checked_by" bigint,
  "checked_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."pre_auths" (
  "id" bigserial PRIMARY KEY,
  "auth_no" text,
  "visit_id" bigint,
  "patient_id" bigint,
  "policy_id" bigint,
  "service_id" bigint,
  "amount" numeric(14,2),
  "status" text,
  "approved_amount" numeric(14,2),
  "approval_ref" text,
  "valid_to" date,
  "remarks" text,
  "requested_by" bigint,
  "requested_at" timestamptz,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."claims" (
  "id" bigserial PRIMARY KEY,
  "claim_no" text,
  "invoice_id" bigint,
  "visit_id" bigint,
  "patient_id" bigint,
  "payer_id" bigint,
  "policy_id" bigint,
  "amount" numeric(14,2),
  "paid_amount" numeric(14,2),
  "status" text,
  "batch_id" bigint,
  "submitted_at" timestamptz,
  "scrub_errors" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."claim_lines" (
  "id" bigserial PRIMARY KEY,
  "claim_id" bigint,
  "charge_id" bigint,
  "service_id" bigint,
  "service_code" text,
  "description" text,
  "amount" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."claim_batches" (
  "id" bigserial PRIMARY KEY,
  "batch_no" text,
  "payer_id" bigint,
  "submitted_at" timestamptz,
  "claim_count" integer,
  "total" numeric(14,2),
  "status" text,
  "reference" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."rejection_codes" (
  "id" bigserial PRIMARY KEY,
  "code" text,
  "description" text,
  "category" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."rejections" (
  "id" bigserial PRIMARY KEY,
  "claim_id" bigint,
  "code_id" bigint,
  "reason" text,
  "status" text,
  "assigned_to" bigint,
  "resolution" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."remittances" (
  "id" bigserial PRIMARY KEY,
  "remit_no" text,
  "payer_id" bigint,
  "remit_date" date,
  "amount" numeric(14,2),
  "reference" text,
  "status" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."remittance_lines" (
  "id" bigserial PRIMARY KEY,
  "remittance_id" bigint,
  "claim_id" bigint,
  "paid_amount" numeric(14,2),
  "adjustment" numeric(14,2),
  "remarks" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."corporate_accounts" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "cr_no" text,
  "contact_person" text,
  "phone" text,
  "email" text,
  "credit_limit" numeric(14,2),
  "credit_days" integer,
  "discount_pct" numeric(14,3),
  "active" boolean,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."guarantee_letters" (
  "id" bigserial PRIMARY KEY,
  "gl_no" text,
  "corporate_id" bigint,
  "patient_id" bigint,
  "amount" numeric(14,2),
  "used_amount" numeric(14,2),
  "valid_to" date,
  "status" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."corporate_payments" (
  "id" bigserial PRIMARY KEY,
  "corporate_id" bigint,
  "amount" numeric(14,2),
  "pay_date" date,
  "method" text,
  "reference" text,
  "applied" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "insurance"."write_offs" (
  "id" bigserial PRIMARY KEY,
  "wo_no" text,
  "invoice_id" bigint,
  "claim_id" bigint,
  "amount" numeric(14,2),
  "reason" text,
  "status" text,
  "approved_by" bigint,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "finance"."ledger_accounts" (
  "id" bigserial PRIMARY KEY,
  "code" text,
  "name" text,
  "type" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "finance"."journals" (
  "id" bigserial PRIMARY KEY,
  "journal_no" text,
  "journal_date" date,
  "narration" text,
  "status" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "finance"."journal_lines" (
  "id" bigserial PRIMARY KEY,
  "journal_id" bigint,
  "account_id" bigint,
  "debit" numeric(14,2),
  "credit" numeric(14,2),
  "memo" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "finance"."vendor_bills" (
  "id" bigserial PRIMARY KEY,
  "bill_ref" text,
  "supplier_id" bigint,
  "grn_id" bigint,
  "bill_date" date,
  "due_date" date,
  "amount" numeric(14,2),
  "paid" numeric(14,2),
  "status" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "finance"."vendor_payments" (
  "id" bigserial PRIMARY KEY,
  "bill_id" bigint,
  "amount" numeric(14,2),
  "pay_date" date,
  "method" text,
  "reference" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "finance"."bank_accounts" (
  "id" bigserial PRIMARY KEY,
  "name" text,
  "bank_name" text,
  "currency" text,
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "finance"."bank_statement_lines" (
  "id" bigserial PRIMARY KEY,
  "bank_account_id" bigint,
  "line_date" date,
  "description" text,
  "debit" numeric(14,2),
  "credit" numeric(14,2),
  "matched" boolean,
  "matched_ref" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "hr"."employees" (
  "id" bigserial PRIMARY KEY,
  "emp_no" text,
  "full_name" text,
  "designation" text,
  "department_id" bigint,
  "user_id" bigint,
  "join_date" date,
  "phone" text,
  "email" text,
  "qid_no" text,
  "qid_expiry" date,
  "rp_expiry" date,
  "passport_expiry" date,
  "licence_no" text,
  "licence_expiry" date,
  "basic_salary" numeric(14,2),
  "allowance" numeric(14,2),
  "status" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "hr"."rosters" (
  "id" bigserial PRIMARY KEY,
  "employee_id" bigint,
  "roster_date" date,
  "shift" text,
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "hr"."attendance" (
  "id" bigserial PRIMARY KEY,
  "employee_id" bigint,
  "att_date" date,
  "check_in" time,
  "check_out" time,
  "status" text,
  "remarks" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "hr"."leaves" (
  "id" bigserial PRIMARY KEY,
  "employee_id" bigint,
  "leave_type" text,
  "from_date" date,
  "to_date" date,
  "days" integer,
  "status" text,
  "approved_by" bigint,
  "reason" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "hr"."payroll_runs" (
  "id" bigserial PRIMARY KEY,
  "period" text,
  "status" text,
  "total" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "hr"."payslips" (
  "id" bigserial PRIMARY KEY,
  "run_id" bigint,
  "employee_id" bigint,
  "basic" numeric(14,2),
  "allowance" numeric(14,2),
  "deductions" numeric(14,2),
  "net" numeric(14,2),
  "notes" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "hr"."doctor_revenue_share" (
  "id" bigserial PRIMARY KEY,
  "doctor_id" bigint,
  "category" text,
  "share_pct" numeric(14,3),
  "active" boolean,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "assets"."equipment" (
  "id" bigserial PRIMARY KEY,
  "asset_no" text,
  "name" text,
  "department_id" bigint,
  "model" text,
  "serial_no" text,
  "manufacturer" text,
  "purchase_date" date,
  "warranty_to" date,
  "last_service" date,
  "calibration_due" date,
  "status" text,
  "location" text,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
CREATE TABLE "assets"."maintenance_tickets" (
  "id" bigserial PRIMARY KEY,
  "ticket_no" text,
  "equipment_id" bigint,
  "issue" text,
  "priority" text,
  "status" text,
  "reported_by" bigint,
  "reported_at" timestamptz,
  "resolved_on" date,
  "vendor" text,
  "cost" numeric(14,2),
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" bigint,
  "updated_by" bigint
);
ALTER TABLE "auth"."users" ADD CONSTRAINT "fk_users_role_id" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id");
ALTER TABLE "auth"."users" ADD CONSTRAINT "fk_users_speciality_id" FOREIGN KEY ("speciality_id") REFERENCES "admin"."specialities"("id");
ALTER TABLE "auth"."users" ADD CONSTRAINT "fk_users_department_id" FOREIGN KEY ("department_id") REFERENCES "admin"."departments"("id");
ALTER TABLE "auth"."users" ADD CONSTRAINT "fk_users_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "mpi"."patients" ADD CONSTRAINT "fk_patients_nationality_id" FOREIGN KEY ("nationality_id") REFERENCES "admin"."nationalities"("id");
ALTER TABLE "mpi"."patients" ADD CONSTRAINT "fk_patients_employer_id" FOREIGN KEY ("employer_id") REFERENCES "insurance"."corporate_accounts"("id");
ALTER TABLE "mpi"."patient_family" ADD CONSTRAINT "fk_patient_family_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "mpi"."patient_family" ADD CONSTRAINT "fk_patient_family_related_patient_id" FOREIGN KEY ("related_patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "mpi"."patient_allergies" ADD CONSTRAINT "fk_patient_allergies_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "mpi"."patient_documents" ADD CONSTRAINT "fk_patient_documents_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "mpi"."consents" ADD CONSTRAINT "fk_consents_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "scheduling"."doctor_schedules" ADD CONSTRAINT "fk_doctor_schedules_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "fk_appointments_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "fk_appointments_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "fk_appointments_department_id" FOREIGN KEY ("department_id") REFERENCES "admin"."departments"("id");
ALTER TABLE "scheduling"."visits" ADD CONSTRAINT "fk_visits_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "scheduling"."visits" ADD CONSTRAINT "fk_visits_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "scheduling"."visits" ADD CONSTRAINT "fk_visits_department_id" FOREIGN KEY ("department_id") REFERENCES "admin"."departments"("id");
ALTER TABLE "scheduling"."visits" ADD CONSTRAINT "fk_visits_policy_id" FOREIGN KEY ("policy_id") REFERENCES "insurance"."policy_members"("id");
ALTER TABLE "scheduling"."visits" ADD CONSTRAINT "fk_visits_corporate_id" FOREIGN KEY ("corporate_id") REFERENCES "insurance"."corporate_accounts"("id");
ALTER TABLE "scheduling"."visits" ADD CONSTRAINT "fk_visits_appointment_id" FOREIGN KEY ("appointment_id") REFERENCES "scheduling"."appointments"("id");
ALTER TABLE "clinical"."vitals" ADD CONSTRAINT "fk_vitals_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."vitals" ADD CONSTRAINT "fk_vitals_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "clinical"."nursing_notes" ADD CONSTRAINT "fk_nursing_notes_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."nursing_notes" ADD CONSTRAINT "fk_nursing_notes_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "fk_encounters_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "fk_encounters_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "fk_encounters_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "clinical"."diagnoses" ADD CONSTRAINT "fk_diagnoses_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."diagnoses" ADD CONSTRAINT "fk_diagnoses_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "clinical"."diagnoses" ADD CONSTRAINT "fk_diagnoses_code_id" FOREIGN KEY ("code_id") REFERENCES "clinical"."diagnosis_codes"("id");
ALTER TABLE "clinical"."prescriptions" ADD CONSTRAINT "fk_prescriptions_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."prescriptions" ADD CONSTRAINT "fk_prescriptions_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "clinical"."prescriptions" ADD CONSTRAINT "fk_prescriptions_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "clinical"."prescription_items" ADD CONSTRAINT "fk_prescription_items_prescription_id" FOREIGN KEY ("prescription_id") REFERENCES "clinical"."prescriptions"("id");
ALTER TABLE "clinical"."prescription_items" ADD CONSTRAINT "fk_prescription_items_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "clinical"."procedure_orders" ADD CONSTRAINT "fk_procedure_orders_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."procedure_orders" ADD CONSTRAINT "fk_procedure_orders_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "clinical"."procedure_orders" ADD CONSTRAINT "fk_procedure_orders_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "clinical"."procedure_orders" ADD CONSTRAINT "fk_procedure_orders_performed_by" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");
ALTER TABLE "clinical"."certificates" ADD CONSTRAINT "fk_certificates_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."certificates" ADD CONSTRAINT "fk_certificates_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "clinical"."certificates" ADD CONSTRAINT "fk_certificates_issued_by" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id");
ALTER TABLE "clinical"."referrals" ADD CONSTRAINT "fk_referrals_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "clinical"."referrals" ADD CONSTRAINT "fk_referrals_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "lab"."lab_tests" ADD CONSTRAINT "fk_lab_tests_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "lab"."lab_tests" ADD CONSTRAINT "fk_lab_tests_outsourced_lab_id" FOREIGN KEY ("outsourced_lab_id") REFERENCES "lab"."outsourced_labs"("id");
ALTER TABLE "lab"."lab_panel_tests" ADD CONSTRAINT "fk_lab_panel_tests_panel_id" FOREIGN KEY ("panel_id") REFERENCES "lab"."lab_panels"("id");
ALTER TABLE "lab"."lab_panel_tests" ADD CONSTRAINT "fk_lab_panel_tests_test_id" FOREIGN KEY ("test_id") REFERENCES "lab"."lab_tests"("id");
ALTER TABLE "lab"."lab_orders" ADD CONSTRAINT "fk_lab_orders_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "lab"."lab_orders" ADD CONSTRAINT "fk_lab_orders_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "lab"."lab_orders" ADD CONSTRAINT "fk_lab_orders_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "lab"."lab_order_items" ADD CONSTRAINT "fk_lab_order_items_order_id" FOREIGN KEY ("order_id") REFERENCES "lab"."lab_orders"("id");
ALTER TABLE "lab"."lab_order_items" ADD CONSTRAINT "fk_lab_order_items_test_id" FOREIGN KEY ("test_id") REFERENCES "lab"."lab_tests"("id");
ALTER TABLE "lab"."lab_order_items" ADD CONSTRAINT "fk_lab_order_items_resulted_by" FOREIGN KEY ("resulted_by") REFERENCES "auth"."users"("id");
ALTER TABLE "lab"."lab_order_items" ADD CONSTRAINT "fk_lab_order_items_validated_by" FOREIGN KEY ("validated_by") REFERENCES "auth"."users"("id");
ALTER TABLE "lab"."specimens" ADD CONSTRAINT "fk_specimens_order_id" FOREIGN KEY ("order_id") REFERENCES "lab"."lab_orders"("id");
ALTER TABLE "lab"."specimens" ADD CONSTRAINT "fk_specimens_collected_by" FOREIGN KEY ("collected_by") REFERENCES "auth"."users"("id");
ALTER TABLE "lab"."qc_runs" ADD CONSTRAINT "fk_qc_runs_test_id" FOREIGN KEY ("test_id") REFERENCES "lab"."lab_tests"("id");
ALTER TABLE "radiology"."imaging_orders" ADD CONSTRAINT "fk_imaging_orders_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "radiology"."imaging_orders" ADD CONSTRAINT "fk_imaging_orders_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "radiology"."imaging_orders" ADD CONSTRAINT "fk_imaging_orders_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "radiology"."imaging_orders" ADD CONSTRAINT "fk_imaging_orders_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "radiology"."imaging_orders" ADD CONSTRAINT "fk_imaging_orders_modality_id" FOREIGN KEY ("modality_id") REFERENCES "radiology"."imaging_modalities"("id");
ALTER TABLE "radiology"."imaging_reports" ADD CONSTRAINT "fk_imaging_reports_order_id" FOREIGN KEY ("order_id") REFERENCES "radiology"."imaging_orders"("id");
ALTER TABLE "radiology"."imaging_reports" ADD CONSTRAINT "fk_imaging_reports_reported_by" FOREIGN KEY ("reported_by") REFERENCES "auth"."users"("id");
ALTER TABLE "pharmacy"."drug_interactions" ADD CONSTRAINT "fk_drug_interactions_drug_a_id" FOREIGN KEY ("drug_a_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "pharmacy"."drug_interactions" ADD CONSTRAINT "fk_drug_interactions_drug_b_id" FOREIGN KEY ("drug_b_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "pharmacy"."pharmacy_dispenses" ADD CONSTRAINT "fk_pharmacy_dispenses_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "pharmacy"."pharmacy_dispenses" ADD CONSTRAINT "fk_pharmacy_dispenses_prescription_id" FOREIGN KEY ("prescription_id") REFERENCES "clinical"."prescriptions"("id");
ALTER TABLE "pharmacy"."pharmacy_dispenses" ADD CONSTRAINT "fk_pharmacy_dispenses_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "pharmacy"."pharmacy_dispenses" ADD CONSTRAINT "fk_pharmacy_dispenses_dispensed_by" FOREIGN KEY ("dispensed_by") REFERENCES "auth"."users"("id");
ALTER TABLE "pharmacy"."dispense_items" ADD CONSTRAINT "fk_dispense_items_dispense_id" FOREIGN KEY ("dispense_id") REFERENCES "pharmacy"."pharmacy_dispenses"("id");
ALTER TABLE "pharmacy"."dispense_items" ADD CONSTRAINT "fk_dispense_items_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "pharmacy"."dispense_items" ADD CONSTRAINT "fk_dispense_items_batch_id" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id");
ALTER TABLE "pharmacy"."controlled_register" ADD CONSTRAINT "fk_controlled_register_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "pharmacy"."controlled_register" ADD CONSTRAINT "fk_controlled_register_batch_id" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id");
ALTER TABLE "pharmacy"."controlled_register" ADD CONSTRAINT "fk_controlled_register_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "pharmacy"."controlled_register" ADD CONSTRAINT "fk_controlled_register_prescription_id" FOREIGN KEY ("prescription_id") REFERENCES "clinical"."prescriptions"("id");
ALTER TABLE "pharmacy"."controlled_register" ADD CONSTRAINT "fk_controlled_register_performed_by" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");
ALTER TABLE "pharmacy"."otc_sales" ADD CONSTRAINT "fk_otc_sales_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "pharmacy"."otc_sales" ADD CONSTRAINT "fk_otc_sales_sold_by" FOREIGN KEY ("sold_by") REFERENCES "auth"."users"("id");
ALTER TABLE "pharmacy"."otc_sale_items" ADD CONSTRAINT "fk_otc_sale_items_sale_id" FOREIGN KEY ("sale_id") REFERENCES "pharmacy"."otc_sales"("id");
ALTER TABLE "pharmacy"."otc_sale_items" ADD CONSTRAINT "fk_otc_sale_items_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "pharmacy"."otc_sale_items" ADD CONSTRAINT "fk_otc_sale_items_batch_id" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id");
ALTER TABLE "inventory"."stock_batches" ADD CONSTRAINT "fk_stock_batches_store_id" FOREIGN KEY ("store_id") REFERENCES "inventory"."stores"("id");
ALTER TABLE "inventory"."stock_batches" ADD CONSTRAINT "fk_stock_batches_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "inventory"."stock_batches" ADD CONSTRAINT "fk_stock_batches_item_id" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id");
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "fk_stock_ledger_store_id" FOREIGN KEY ("store_id") REFERENCES "inventory"."stores"("id");
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "fk_stock_ledger_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "fk_stock_ledger_item_id" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id");
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "fk_stock_ledger_batch_id" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id");
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "fk_stock_ledger_moved_by" FOREIGN KEY ("moved_by") REFERENCES "auth"."users"("id");
ALTER TABLE "inventory"."requisitions" ADD CONSTRAINT "fk_requisitions_store_id" FOREIGN KEY ("store_id") REFERENCES "inventory"."stores"("id");
ALTER TABLE "inventory"."requisitions" ADD CONSTRAINT "fk_requisitions_requested_by" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");
ALTER TABLE "inventory"."requisition_items" ADD CONSTRAINT "fk_requisition_items_requisition_id" FOREIGN KEY ("requisition_id") REFERENCES "inventory"."requisitions"("id");
ALTER TABLE "inventory"."requisition_items" ADD CONSTRAINT "fk_requisition_items_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "inventory"."requisition_items" ADD CONSTRAINT "fk_requisition_items_item_id" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id");
ALTER TABLE "inventory"."purchase_orders" ADD CONSTRAINT "fk_purchase_orders_supplier_id" FOREIGN KEY ("supplier_id") REFERENCES "inventory"."suppliers"("id");
ALTER TABLE "inventory"."po_items" ADD CONSTRAINT "fk_po_items_po_id" FOREIGN KEY ("po_id") REFERENCES "inventory"."purchase_orders"("id");
ALTER TABLE "inventory"."po_items" ADD CONSTRAINT "fk_po_items_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "inventory"."po_items" ADD CONSTRAINT "fk_po_items_item_id" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id");
ALTER TABLE "inventory"."grns" ADD CONSTRAINT "fk_grns_po_id" FOREIGN KEY ("po_id") REFERENCES "inventory"."purchase_orders"("id");
ALTER TABLE "inventory"."grns" ADD CONSTRAINT "fk_grns_supplier_id" FOREIGN KEY ("supplier_id") REFERENCES "inventory"."suppliers"("id");
ALTER TABLE "inventory"."grns" ADD CONSTRAINT "fk_grns_store_id" FOREIGN KEY ("store_id") REFERENCES "inventory"."stores"("id");
ALTER TABLE "inventory"."grn_items" ADD CONSTRAINT "fk_grn_items_grn_id" FOREIGN KEY ("grn_id") REFERENCES "inventory"."grns"("id");
ALTER TABLE "inventory"."grn_items" ADD CONSTRAINT "fk_grn_items_drug_id" FOREIGN KEY ("drug_id") REFERENCES "pharmacy"."drugs"("id");
ALTER TABLE "inventory"."grn_items" ADD CONSTRAINT "fk_grn_items_item_id" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id");
ALTER TABLE "inventory"."stock_adjustments" ADD CONSTRAINT "fk_stock_adjustments_store_id" FOREIGN KEY ("store_id") REFERENCES "inventory"."stores"("id");
ALTER TABLE "inventory"."stock_adjustments" ADD CONSTRAINT "fk_stock_adjustments_batch_id" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id");
ALTER TABLE "inventory"."stock_transfers" ADD CONSTRAINT "fk_stock_transfers_from_store_id" FOREIGN KEY ("from_store_id") REFERENCES "inventory"."stores"("id");
ALTER TABLE "inventory"."stock_transfers" ADD CONSTRAINT "fk_stock_transfers_to_store_id" FOREIGN KEY ("to_store_id") REFERENCES "inventory"."stores"("id");
ALTER TABLE "inventory"."stock_transfers" ADD CONSTRAINT "fk_stock_transfers_batch_id" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id");
ALTER TABLE "billing"."services" ADD CONSTRAINT "fk_services_department_id" FOREIGN KEY ("department_id") REFERENCES "admin"."departments"("id");
ALTER TABLE "billing"."price_lists" ADD CONSTRAINT "fk_price_lists_payer_id" FOREIGN KEY ("payer_id") REFERENCES "insurance"."payers"("id");
ALTER TABLE "billing"."price_lists" ADD CONSTRAINT "fk_price_lists_corporate_id" FOREIGN KEY ("corporate_id") REFERENCES "insurance"."corporate_accounts"("id");
ALTER TABLE "billing"."price_list_items" ADD CONSTRAINT "fk_price_list_items_price_list_id" FOREIGN KEY ("price_list_id") REFERENCES "billing"."price_lists"("id");
ALTER TABLE "billing"."price_list_items" ADD CONSTRAINT "fk_price_list_items_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "billing"."package_items" ADD CONSTRAINT "fk_package_items_package_id" FOREIGN KEY ("package_id") REFERENCES "billing"."packages"("id");
ALTER TABLE "billing"."package_items" ADD CONSTRAINT "fk_package_items_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "billing"."charges" ADD CONSTRAINT "fk_charges_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "billing"."charges" ADD CONSTRAINT "fk_charges_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "billing"."charges" ADD CONSTRAINT "fk_charges_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "billing"."charges" ADD CONSTRAINT "fk_charges_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "fk_invoices_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "fk_invoices_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "fk_invoices_payer_id" FOREIGN KEY ("payer_id") REFERENCES "insurance"."payers"("id");
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "fk_invoices_policy_id" FOREIGN KEY ("policy_id") REFERENCES "insurance"."policy_members"("id");
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "fk_invoices_corporate_id" FOREIGN KEY ("corporate_id") REFERENCES "insurance"."corporate_accounts"("id");
ALTER TABLE "billing"."payments" ADD CONSTRAINT "fk_payments_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");
ALTER TABLE "billing"."payments" ADD CONSTRAINT "fk_payments_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "billing"."payments" ADD CONSTRAINT "fk_payments_cashier_id" FOREIGN KEY ("cashier_id") REFERENCES "auth"."users"("id");
ALTER TABLE "billing"."payments" ADD CONSTRAINT "fk_payments_session_id" FOREIGN KEY ("session_id") REFERENCES "billing"."cashier_sessions"("id");
ALTER TABLE "billing"."deposits" ADD CONSTRAINT "fk_deposits_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "billing"."refunds" ADD CONSTRAINT "fk_refunds_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");
ALTER TABLE "billing"."refunds" ADD CONSTRAINT "fk_refunds_requested_by" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");
ALTER TABLE "billing"."refunds" ADD CONSTRAINT "fk_refunds_approved_by" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");
ALTER TABLE "billing"."credit_notes" ADD CONSTRAINT "fk_credit_notes_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");
ALTER TABLE "billing"."cashier_sessions" ADD CONSTRAINT "fk_cashier_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
ALTER TABLE "billing"."discount_approvals" ADD CONSTRAINT "fk_discount_approvals_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");
ALTER TABLE "billing"."discount_approvals" ADD CONSTRAINT "fk_discount_approvals_requested_by" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");
ALTER TABLE "billing"."discount_approvals" ADD CONSTRAINT "fk_discount_approvals_approved_by" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");
ALTER TABLE "insurance"."plans" ADD CONSTRAINT "fk_plans_payer_id" FOREIGN KEY ("payer_id") REFERENCES "insurance"."payers"("id");
ALTER TABLE "insurance"."policy_members" ADD CONSTRAINT "fk_policy_members_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "insurance"."policy_members" ADD CONSTRAINT "fk_policy_members_payer_id" FOREIGN KEY ("payer_id") REFERENCES "insurance"."payers"("id");
ALTER TABLE "insurance"."policy_members" ADD CONSTRAINT "fk_policy_members_plan_id" FOREIGN KEY ("plan_id") REFERENCES "insurance"."plans"("id");
ALTER TABLE "insurance"."policy_members" ADD CONSTRAINT "fk_policy_members_corporate_id" FOREIGN KEY ("corporate_id") REFERENCES "insurance"."corporate_accounts"("id");
ALTER TABLE "insurance"."eligibility_checks" ADD CONSTRAINT "fk_eligibility_checks_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "insurance"."eligibility_checks" ADD CONSTRAINT "fk_eligibility_checks_policy_id" FOREIGN KEY ("policy_id") REFERENCES "insurance"."policy_members"("id");
ALTER TABLE "insurance"."eligibility_checks" ADD CONSTRAINT "fk_eligibility_checks_checked_by" FOREIGN KEY ("checked_by") REFERENCES "auth"."users"("id");
ALTER TABLE "insurance"."pre_auths" ADD CONSTRAINT "fk_pre_auths_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "insurance"."pre_auths" ADD CONSTRAINT "fk_pre_auths_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "insurance"."pre_auths" ADD CONSTRAINT "fk_pre_auths_policy_id" FOREIGN KEY ("policy_id") REFERENCES "insurance"."policy_members"("id");
ALTER TABLE "insurance"."pre_auths" ADD CONSTRAINT "fk_pre_auths_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "insurance"."pre_auths" ADD CONSTRAINT "fk_pre_auths_requested_by" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");
ALTER TABLE "insurance"."claims" ADD CONSTRAINT "fk_claims_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");
ALTER TABLE "insurance"."claims" ADD CONSTRAINT "fk_claims_visit_id" FOREIGN KEY ("visit_id") REFERENCES "scheduling"."visits"("id");
ALTER TABLE "insurance"."claims" ADD CONSTRAINT "fk_claims_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "insurance"."claims" ADD CONSTRAINT "fk_claims_payer_id" FOREIGN KEY ("payer_id") REFERENCES "insurance"."payers"("id");
ALTER TABLE "insurance"."claims" ADD CONSTRAINT "fk_claims_policy_id" FOREIGN KEY ("policy_id") REFERENCES "insurance"."policy_members"("id");
ALTER TABLE "insurance"."claims" ADD CONSTRAINT "fk_claims_batch_id" FOREIGN KEY ("batch_id") REFERENCES "insurance"."claim_batches"("id");
ALTER TABLE "insurance"."claim_lines" ADD CONSTRAINT "fk_claim_lines_claim_id" FOREIGN KEY ("claim_id") REFERENCES "insurance"."claims"("id");
ALTER TABLE "insurance"."claim_lines" ADD CONSTRAINT "fk_claim_lines_charge_id" FOREIGN KEY ("charge_id") REFERENCES "billing"."charges"("id");
ALTER TABLE "insurance"."claim_lines" ADD CONSTRAINT "fk_claim_lines_service_id" FOREIGN KEY ("service_id") REFERENCES "billing"."services"("id");
ALTER TABLE "insurance"."claim_batches" ADD CONSTRAINT "fk_claim_batches_payer_id" FOREIGN KEY ("payer_id") REFERENCES "insurance"."payers"("id");
ALTER TABLE "insurance"."rejections" ADD CONSTRAINT "fk_rejections_claim_id" FOREIGN KEY ("claim_id") REFERENCES "insurance"."claims"("id");
ALTER TABLE "insurance"."rejections" ADD CONSTRAINT "fk_rejections_code_id" FOREIGN KEY ("code_id") REFERENCES "insurance"."rejection_codes"("id");
ALTER TABLE "insurance"."rejections" ADD CONSTRAINT "fk_rejections_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");
ALTER TABLE "insurance"."remittances" ADD CONSTRAINT "fk_remittances_payer_id" FOREIGN KEY ("payer_id") REFERENCES "insurance"."payers"("id");
ALTER TABLE "insurance"."remittance_lines" ADD CONSTRAINT "fk_remittance_lines_remittance_id" FOREIGN KEY ("remittance_id") REFERENCES "insurance"."remittances"("id");
ALTER TABLE "insurance"."remittance_lines" ADD CONSTRAINT "fk_remittance_lines_claim_id" FOREIGN KEY ("claim_id") REFERENCES "insurance"."claims"("id");
ALTER TABLE "insurance"."guarantee_letters" ADD CONSTRAINT "fk_guarantee_letters_corporate_id" FOREIGN KEY ("corporate_id") REFERENCES "insurance"."corporate_accounts"("id");
ALTER TABLE "insurance"."guarantee_letters" ADD CONSTRAINT "fk_guarantee_letters_patient_id" FOREIGN KEY ("patient_id") REFERENCES "mpi"."patients"("id");
ALTER TABLE "insurance"."corporate_payments" ADD CONSTRAINT "fk_corporate_payments_corporate_id" FOREIGN KEY ("corporate_id") REFERENCES "insurance"."corporate_accounts"("id");
ALTER TABLE "insurance"."write_offs" ADD CONSTRAINT "fk_write_offs_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");
ALTER TABLE "insurance"."write_offs" ADD CONSTRAINT "fk_write_offs_claim_id" FOREIGN KEY ("claim_id") REFERENCES "insurance"."claims"("id");
ALTER TABLE "insurance"."write_offs" ADD CONSTRAINT "fk_write_offs_approved_by" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");
ALTER TABLE "finance"."journal_lines" ADD CONSTRAINT "fk_journal_lines_journal_id" FOREIGN KEY ("journal_id") REFERENCES "finance"."journals"("id");
ALTER TABLE "finance"."journal_lines" ADD CONSTRAINT "fk_journal_lines_account_id" FOREIGN KEY ("account_id") REFERENCES "finance"."ledger_accounts"("id");
ALTER TABLE "finance"."vendor_bills" ADD CONSTRAINT "fk_vendor_bills_supplier_id" FOREIGN KEY ("supplier_id") REFERENCES "inventory"."suppliers"("id");
ALTER TABLE "finance"."vendor_bills" ADD CONSTRAINT "fk_vendor_bills_grn_id" FOREIGN KEY ("grn_id") REFERENCES "inventory"."grns"("id");
ALTER TABLE "finance"."vendor_payments" ADD CONSTRAINT "fk_vendor_payments_bill_id" FOREIGN KEY ("bill_id") REFERENCES "finance"."vendor_bills"("id");
ALTER TABLE "finance"."bank_statement_lines" ADD CONSTRAINT "fk_bank_statement_lines_bank_account_id" FOREIGN KEY ("bank_account_id") REFERENCES "finance"."bank_accounts"("id");
ALTER TABLE "hr"."employees" ADD CONSTRAINT "fk_employees_department_id" FOREIGN KEY ("department_id") REFERENCES "admin"."departments"("id");
ALTER TABLE "hr"."employees" ADD CONSTRAINT "fk_employees_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
ALTER TABLE "hr"."rosters" ADD CONSTRAINT "fk_rosters_employee_id" FOREIGN KEY ("employee_id") REFERENCES "hr"."employees"("id");
ALTER TABLE "hr"."attendance" ADD CONSTRAINT "fk_attendance_employee_id" FOREIGN KEY ("employee_id") REFERENCES "hr"."employees"("id");
ALTER TABLE "hr"."leaves" ADD CONSTRAINT "fk_leaves_employee_id" FOREIGN KEY ("employee_id") REFERENCES "hr"."employees"("id");
ALTER TABLE "hr"."leaves" ADD CONSTRAINT "fk_leaves_approved_by" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");
ALTER TABLE "hr"."payslips" ADD CONSTRAINT "fk_payslips_run_id" FOREIGN KEY ("run_id") REFERENCES "hr"."payroll_runs"("id");
ALTER TABLE "hr"."payslips" ADD CONSTRAINT "fk_payslips_employee_id" FOREIGN KEY ("employee_id") REFERENCES "hr"."employees"("id");
ALTER TABLE "hr"."doctor_revenue_share" ADD CONSTRAINT "fk_doctor_revenue_share_doctor_id" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id");
ALTER TABLE "assets"."equipment" ADD CONSTRAINT "fk_equipment_department_id" FOREIGN KEY ("department_id") REFERENCES "admin"."departments"("id");
ALTER TABLE "assets"."maintenance_tickets" ADD CONSTRAINT "fk_maintenance_tickets_equipment_id" FOREIGN KEY ("equipment_id") REFERENCES "assets"."equipment"("id");
ALTER TABLE "assets"."maintenance_tickets" ADD CONSTRAINT "fk_maintenance_tickets_reported_by" FOREIGN KEY ("reported_by") REFERENCES "auth"."users"("id");
ALTER TABLE "auth"."role_permissions" ADD CONSTRAINT "fk_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "ux_branches_code" ON "admin"."branches" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_branches_created" ON "admin"."branches" ("created_at");
CREATE UNIQUE INDEX "ux_departments_code" ON "admin"."departments" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_departments_created" ON "admin"."departments" ("created_at");
CREATE UNIQUE INDEX "ux_specialities_name" ON "admin"."specialities" ("name") WHERE "is_deleted" = false AND "name" IS NOT NULL;
CREATE INDEX "ix_specialities_created" ON "admin"."specialities" ("created_at");
CREATE UNIQUE INDEX "ux_nationalities_name" ON "admin"."nationalities" ("name") WHERE "is_deleted" = false AND "name" IS NOT NULL;
CREATE INDEX "ix_nationalities_created" ON "admin"."nationalities" ("created_at");
CREATE INDEX "ix_templates_created" ON "admin"."templates" ("created_at");
CREATE INDEX "ix_integration_settings_created" ON "admin"."integration_settings" ("created_at");
CREATE INDEX "ix_integration_logs_created" ON "admin"."integration_logs" ("created_at");
CREATE INDEX "ix_audit_log_created" ON "admin"."audit_log" ("created_at");
CREATE UNIQUE INDEX "ux_settings_key" ON "admin"."settings" ("key") WHERE "is_deleted" = false AND "key" IS NOT NULL;
CREATE INDEX "ix_settings_created" ON "admin"."settings" ("created_at");
CREATE UNIQUE INDEX "ux_roles_name" ON "auth"."roles" ("name") WHERE "is_deleted" = false AND "name" IS NOT NULL;
CREATE INDEX "ix_roles_created" ON "auth"."roles" ("created_at");
CREATE UNIQUE INDEX "ux_users_username" ON "auth"."users" ("username") WHERE "is_deleted" = false AND "username" IS NOT NULL;
CREATE INDEX "ix_users_role_id" ON "auth"."users" ("role_id");
CREATE INDEX "ix_users_speciality_id" ON "auth"."users" ("speciality_id");
CREATE INDEX "ix_users_department_id" ON "auth"."users" ("department_id");
CREATE INDEX "ix_users_patient_id" ON "auth"."users" ("patient_id");
CREATE INDEX "ix_users_created" ON "auth"."users" ("created_at");
CREATE UNIQUE INDEX "ux_patients_mrn" ON "mpi"."patients" ("mrn") WHERE "is_deleted" = false AND "mrn" IS NOT NULL;
CREATE INDEX "ix_patients_nationality_id" ON "mpi"."patients" ("nationality_id");
CREATE INDEX "ix_patients_employer_id" ON "mpi"."patients" ("employer_id");
CREATE INDEX "ix_patients_created" ON "mpi"."patients" ("created_at");
CREATE INDEX "ix_patient_family_patient_id" ON "mpi"."patient_family" ("patient_id");
CREATE INDEX "ix_patient_family_related_patient_id" ON "mpi"."patient_family" ("related_patient_id");
CREATE INDEX "ix_patient_family_created" ON "mpi"."patient_family" ("created_at");
CREATE INDEX "ix_patient_allergies_patient_id" ON "mpi"."patient_allergies" ("patient_id");
CREATE INDEX "ix_patient_allergies_created" ON "mpi"."patient_allergies" ("created_at");
CREATE INDEX "ix_patient_documents_patient_id" ON "mpi"."patient_documents" ("patient_id");
CREATE INDEX "ix_patient_documents_created" ON "mpi"."patient_documents" ("created_at");
CREATE INDEX "ix_consents_patient_id" ON "mpi"."consents" ("patient_id");
CREATE INDEX "ix_consents_created" ON "mpi"."consents" ("created_at");
CREATE INDEX "ix_doctor_schedules_doctor_id" ON "scheduling"."doctor_schedules" ("doctor_id");
CREATE INDEX "ix_doctor_schedules_created" ON "scheduling"."doctor_schedules" ("created_at");
CREATE UNIQUE INDEX "ux_appointments_appt_no" ON "scheduling"."appointments" ("appt_no") WHERE "is_deleted" = false AND "appt_no" IS NOT NULL;
CREATE INDEX "ix_appointments_patient_id" ON "scheduling"."appointments" ("patient_id");
CREATE INDEX "ix_appointments_doctor_id" ON "scheduling"."appointments" ("doctor_id");
CREATE INDEX "ix_appointments_department_id" ON "scheduling"."appointments" ("department_id");
CREATE INDEX "ix_appointments_created" ON "scheduling"."appointments" ("created_at");
CREATE UNIQUE INDEX "ux_visits_visit_no" ON "scheduling"."visits" ("visit_no") WHERE "is_deleted" = false AND "visit_no" IS NOT NULL;
CREATE INDEX "ix_visits_patient_id" ON "scheduling"."visits" ("patient_id");
CREATE INDEX "ix_visits_doctor_id" ON "scheduling"."visits" ("doctor_id");
CREATE INDEX "ix_visits_department_id" ON "scheduling"."visits" ("department_id");
CREATE INDEX "ix_visits_policy_id" ON "scheduling"."visits" ("policy_id");
CREATE INDEX "ix_visits_corporate_id" ON "scheduling"."visits" ("corporate_id");
CREATE INDEX "ix_visits_appointment_id" ON "scheduling"."visits" ("appointment_id");
CREATE INDEX "ix_visits_created" ON "scheduling"."visits" ("created_at");
CREATE INDEX "ix_vitals_visit_id" ON "clinical"."vitals" ("visit_id");
CREATE INDEX "ix_vitals_patient_id" ON "clinical"."vitals" ("patient_id");
CREATE INDEX "ix_vitals_created" ON "clinical"."vitals" ("created_at");
CREATE INDEX "ix_nursing_notes_visit_id" ON "clinical"."nursing_notes" ("visit_id");
CREATE INDEX "ix_nursing_notes_patient_id" ON "clinical"."nursing_notes" ("patient_id");
CREATE INDEX "ix_nursing_notes_created" ON "clinical"."nursing_notes" ("created_at");
CREATE UNIQUE INDEX "ux_diagnosis_codes_code" ON "clinical"."diagnosis_codes" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_diagnosis_codes_created" ON "clinical"."diagnosis_codes" ("created_at");
CREATE INDEX "ix_encounters_visit_id" ON "clinical"."encounters" ("visit_id");
CREATE UNIQUE INDEX "ux_encounters_visit_id" ON "clinical"."encounters" ("visit_id") WHERE "is_deleted" = false AND "visit_id" IS NOT NULL;
CREATE INDEX "ix_encounters_patient_id" ON "clinical"."encounters" ("patient_id");
CREATE INDEX "ix_encounters_doctor_id" ON "clinical"."encounters" ("doctor_id");
CREATE INDEX "ix_encounters_created" ON "clinical"."encounters" ("created_at");
CREATE INDEX "ix_diagnoses_visit_id" ON "clinical"."diagnoses" ("visit_id");
CREATE INDEX "ix_diagnoses_patient_id" ON "clinical"."diagnoses" ("patient_id");
CREATE INDEX "ix_diagnoses_code_id" ON "clinical"."diagnoses" ("code_id");
CREATE INDEX "ix_diagnoses_created" ON "clinical"."diagnoses" ("created_at");
CREATE UNIQUE INDEX "ux_prescriptions_rx_no" ON "clinical"."prescriptions" ("rx_no") WHERE "is_deleted" = false AND "rx_no" IS NOT NULL;
CREATE INDEX "ix_prescriptions_visit_id" ON "clinical"."prescriptions" ("visit_id");
CREATE INDEX "ix_prescriptions_patient_id" ON "clinical"."prescriptions" ("patient_id");
CREATE INDEX "ix_prescriptions_doctor_id" ON "clinical"."prescriptions" ("doctor_id");
CREATE INDEX "ix_prescriptions_created" ON "clinical"."prescriptions" ("created_at");
CREATE INDEX "ix_prescription_items_prescription_id" ON "clinical"."prescription_items" ("prescription_id");
CREATE INDEX "ix_prescription_items_drug_id" ON "clinical"."prescription_items" ("drug_id");
CREATE INDEX "ix_prescription_items_created" ON "clinical"."prescription_items" ("created_at");
CREATE INDEX "ix_procedure_orders_visit_id" ON "clinical"."procedure_orders" ("visit_id");
CREATE INDEX "ix_procedure_orders_patient_id" ON "clinical"."procedure_orders" ("patient_id");
CREATE INDEX "ix_procedure_orders_service_id" ON "clinical"."procedure_orders" ("service_id");
CREATE INDEX "ix_procedure_orders_performed_by" ON "clinical"."procedure_orders" ("performed_by");
CREATE INDEX "ix_procedure_orders_created" ON "clinical"."procedure_orders" ("created_at");
CREATE INDEX "ix_certificates_visit_id" ON "clinical"."certificates" ("visit_id");
CREATE INDEX "ix_certificates_patient_id" ON "clinical"."certificates" ("patient_id");
CREATE INDEX "ix_certificates_issued_by" ON "clinical"."certificates" ("issued_by");
CREATE INDEX "ix_certificates_created" ON "clinical"."certificates" ("created_at");
CREATE INDEX "ix_referrals_visit_id" ON "clinical"."referrals" ("visit_id");
CREATE INDEX "ix_referrals_patient_id" ON "clinical"."referrals" ("patient_id");
CREATE INDEX "ix_referrals_created" ON "clinical"."referrals" ("created_at");
CREATE INDEX "ix_outsourced_labs_created" ON "lab"."outsourced_labs" ("created_at");
CREATE UNIQUE INDEX "ux_lab_tests_code" ON "lab"."lab_tests" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_lab_tests_service_id" ON "lab"."lab_tests" ("service_id");
CREATE INDEX "ix_lab_tests_outsourced_lab_id" ON "lab"."lab_tests" ("outsourced_lab_id");
CREATE INDEX "ix_lab_tests_created" ON "lab"."lab_tests" ("created_at");
CREATE INDEX "ix_lab_panels_created" ON "lab"."lab_panels" ("created_at");
CREATE INDEX "ix_lab_panel_tests_panel_id" ON "lab"."lab_panel_tests" ("panel_id");
CREATE INDEX "ix_lab_panel_tests_test_id" ON "lab"."lab_panel_tests" ("test_id");
CREATE INDEX "ix_lab_panel_tests_created" ON "lab"."lab_panel_tests" ("created_at");
CREATE UNIQUE INDEX "ux_lab_orders_order_no" ON "lab"."lab_orders" ("order_no") WHERE "is_deleted" = false AND "order_no" IS NOT NULL;
CREATE INDEX "ix_lab_orders_visit_id" ON "lab"."lab_orders" ("visit_id");
CREATE INDEX "ix_lab_orders_patient_id" ON "lab"."lab_orders" ("patient_id");
CREATE INDEX "ix_lab_orders_doctor_id" ON "lab"."lab_orders" ("doctor_id");
CREATE INDEX "ix_lab_orders_created" ON "lab"."lab_orders" ("created_at");
CREATE INDEX "ix_lab_order_items_order_id" ON "lab"."lab_order_items" ("order_id");
CREATE INDEX "ix_lab_order_items_test_id" ON "lab"."lab_order_items" ("test_id");
CREATE INDEX "ix_lab_order_items_resulted_by" ON "lab"."lab_order_items" ("resulted_by");
CREATE INDEX "ix_lab_order_items_validated_by" ON "lab"."lab_order_items" ("validated_by");
CREATE INDEX "ix_lab_order_items_created" ON "lab"."lab_order_items" ("created_at");
CREATE INDEX "ix_specimens_order_id" ON "lab"."specimens" ("order_id");
CREATE UNIQUE INDEX "ux_specimens_barcode" ON "lab"."specimens" ("barcode") WHERE "is_deleted" = false AND "barcode" IS NOT NULL;
CREATE INDEX "ix_specimens_collected_by" ON "lab"."specimens" ("collected_by");
CREATE INDEX "ix_specimens_created" ON "lab"."specimens" ("created_at");
CREATE INDEX "ix_qc_runs_test_id" ON "lab"."qc_runs" ("test_id");
CREATE INDEX "ix_qc_runs_created" ON "lab"."qc_runs" ("created_at");
CREATE INDEX "ix_analyzers_created" ON "lab"."analyzers" ("created_at");
CREATE UNIQUE INDEX "ux_imaging_modalities_code" ON "radiology"."imaging_modalities" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_imaging_modalities_created" ON "radiology"."imaging_modalities" ("created_at");
CREATE UNIQUE INDEX "ux_imaging_orders_order_no" ON "radiology"."imaging_orders" ("order_no") WHERE "is_deleted" = false AND "order_no" IS NOT NULL;
CREATE INDEX "ix_imaging_orders_visit_id" ON "radiology"."imaging_orders" ("visit_id");
CREATE INDEX "ix_imaging_orders_patient_id" ON "radiology"."imaging_orders" ("patient_id");
CREATE INDEX "ix_imaging_orders_doctor_id" ON "radiology"."imaging_orders" ("doctor_id");
CREATE INDEX "ix_imaging_orders_service_id" ON "radiology"."imaging_orders" ("service_id");
CREATE INDEX "ix_imaging_orders_modality_id" ON "radiology"."imaging_orders" ("modality_id");
CREATE INDEX "ix_imaging_orders_created" ON "radiology"."imaging_orders" ("created_at");
CREATE INDEX "ix_imaging_reports_order_id" ON "radiology"."imaging_reports" ("order_id");
CREATE INDEX "ix_imaging_reports_reported_by" ON "radiology"."imaging_reports" ("reported_by");
CREATE INDEX "ix_imaging_reports_created" ON "radiology"."imaging_reports" ("created_at");
CREATE UNIQUE INDEX "ux_drugs_code" ON "pharmacy"."drugs" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_drugs_created" ON "pharmacy"."drugs" ("created_at");
CREATE INDEX "ix_drug_interactions_drug_a_id" ON "pharmacy"."drug_interactions" ("drug_a_id");
CREATE INDEX "ix_drug_interactions_drug_b_id" ON "pharmacy"."drug_interactions" ("drug_b_id");
CREATE INDEX "ix_drug_interactions_created" ON "pharmacy"."drug_interactions" ("created_at");
CREATE UNIQUE INDEX "ux_pharmacy_dispenses_dispense_no" ON "pharmacy"."pharmacy_dispenses" ("dispense_no") WHERE "is_deleted" = false AND "dispense_no" IS NOT NULL;
CREATE INDEX "ix_pharmacy_dispenses_visit_id" ON "pharmacy"."pharmacy_dispenses" ("visit_id");
CREATE INDEX "ix_pharmacy_dispenses_prescription_id" ON "pharmacy"."pharmacy_dispenses" ("prescription_id");
CREATE INDEX "ix_pharmacy_dispenses_patient_id" ON "pharmacy"."pharmacy_dispenses" ("patient_id");
CREATE INDEX "ix_pharmacy_dispenses_dispensed_by" ON "pharmacy"."pharmacy_dispenses" ("dispensed_by");
CREATE INDEX "ix_pharmacy_dispenses_created" ON "pharmacy"."pharmacy_dispenses" ("created_at");
CREATE INDEX "ix_dispense_items_dispense_id" ON "pharmacy"."dispense_items" ("dispense_id");
CREATE INDEX "ix_dispense_items_drug_id" ON "pharmacy"."dispense_items" ("drug_id");
CREATE INDEX "ix_dispense_items_batch_id" ON "pharmacy"."dispense_items" ("batch_id");
CREATE INDEX "ix_dispense_items_created" ON "pharmacy"."dispense_items" ("created_at");
CREATE INDEX "ix_controlled_register_drug_id" ON "pharmacy"."controlled_register" ("drug_id");
CREATE INDEX "ix_controlled_register_batch_id" ON "pharmacy"."controlled_register" ("batch_id");
CREATE INDEX "ix_controlled_register_patient_id" ON "pharmacy"."controlled_register" ("patient_id");
CREATE INDEX "ix_controlled_register_prescription_id" ON "pharmacy"."controlled_register" ("prescription_id");
CREATE INDEX "ix_controlled_register_performed_by" ON "pharmacy"."controlled_register" ("performed_by");
CREATE INDEX "ix_controlled_register_created" ON "pharmacy"."controlled_register" ("created_at");
CREATE UNIQUE INDEX "ux_otc_sales_receipt_no" ON "pharmacy"."otc_sales" ("receipt_no") WHERE "is_deleted" = false AND "receipt_no" IS NOT NULL;
CREATE INDEX "ix_otc_sales_patient_id" ON "pharmacy"."otc_sales" ("patient_id");
CREATE INDEX "ix_otc_sales_sold_by" ON "pharmacy"."otc_sales" ("sold_by");
CREATE INDEX "ix_otc_sales_created" ON "pharmacy"."otc_sales" ("created_at");
CREATE INDEX "ix_otc_sale_items_sale_id" ON "pharmacy"."otc_sale_items" ("sale_id");
CREATE INDEX "ix_otc_sale_items_drug_id" ON "pharmacy"."otc_sale_items" ("drug_id");
CREATE INDEX "ix_otc_sale_items_batch_id" ON "pharmacy"."otc_sale_items" ("batch_id");
CREATE INDEX "ix_otc_sale_items_created" ON "pharmacy"."otc_sale_items" ("created_at");
CREATE INDEX "ix_stores_created" ON "inventory"."stores" ("created_at");
CREATE UNIQUE INDEX "ux_items_code" ON "inventory"."items" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_items_created" ON "inventory"."items" ("created_at");
CREATE INDEX "ix_suppliers_created" ON "inventory"."suppliers" ("created_at");
CREATE INDEX "ix_stock_batches_store_id" ON "inventory"."stock_batches" ("store_id");
CREATE INDEX "ix_stock_batches_drug_id" ON "inventory"."stock_batches" ("drug_id");
CREATE INDEX "ix_stock_batches_item_id" ON "inventory"."stock_batches" ("item_id");
CREATE INDEX "ix_stock_batches_created" ON "inventory"."stock_batches" ("created_at");
CREATE INDEX "ix_stock_ledger_store_id" ON "inventory"."stock_ledger" ("store_id");
CREATE INDEX "ix_stock_ledger_drug_id" ON "inventory"."stock_ledger" ("drug_id");
CREATE INDEX "ix_stock_ledger_item_id" ON "inventory"."stock_ledger" ("item_id");
CREATE INDEX "ix_stock_ledger_batch_id" ON "inventory"."stock_ledger" ("batch_id");
CREATE INDEX "ix_stock_ledger_moved_by" ON "inventory"."stock_ledger" ("moved_by");
CREATE INDEX "ix_stock_ledger_created" ON "inventory"."stock_ledger" ("created_at");
CREATE UNIQUE INDEX "ux_requisitions_req_no" ON "inventory"."requisitions" ("req_no") WHERE "is_deleted" = false AND "req_no" IS NOT NULL;
CREATE INDEX "ix_requisitions_store_id" ON "inventory"."requisitions" ("store_id");
CREATE INDEX "ix_requisitions_requested_by" ON "inventory"."requisitions" ("requested_by");
CREATE INDEX "ix_requisitions_created" ON "inventory"."requisitions" ("created_at");
CREATE INDEX "ix_requisition_items_requisition_id" ON "inventory"."requisition_items" ("requisition_id");
CREATE INDEX "ix_requisition_items_drug_id" ON "inventory"."requisition_items" ("drug_id");
CREATE INDEX "ix_requisition_items_item_id" ON "inventory"."requisition_items" ("item_id");
CREATE INDEX "ix_requisition_items_created" ON "inventory"."requisition_items" ("created_at");
CREATE UNIQUE INDEX "ux_purchase_orders_po_no" ON "inventory"."purchase_orders" ("po_no") WHERE "is_deleted" = false AND "po_no" IS NOT NULL;
CREATE INDEX "ix_purchase_orders_supplier_id" ON "inventory"."purchase_orders" ("supplier_id");
CREATE INDEX "ix_purchase_orders_created" ON "inventory"."purchase_orders" ("created_at");
CREATE INDEX "ix_po_items_po_id" ON "inventory"."po_items" ("po_id");
CREATE INDEX "ix_po_items_drug_id" ON "inventory"."po_items" ("drug_id");
CREATE INDEX "ix_po_items_item_id" ON "inventory"."po_items" ("item_id");
CREATE INDEX "ix_po_items_created" ON "inventory"."po_items" ("created_at");
CREATE UNIQUE INDEX "ux_grns_grn_no" ON "inventory"."grns" ("grn_no") WHERE "is_deleted" = false AND "grn_no" IS NOT NULL;
CREATE INDEX "ix_grns_po_id" ON "inventory"."grns" ("po_id");
CREATE INDEX "ix_grns_supplier_id" ON "inventory"."grns" ("supplier_id");
CREATE INDEX "ix_grns_store_id" ON "inventory"."grns" ("store_id");
CREATE INDEX "ix_grns_created" ON "inventory"."grns" ("created_at");
CREATE INDEX "ix_grn_items_grn_id" ON "inventory"."grn_items" ("grn_id");
CREATE INDEX "ix_grn_items_drug_id" ON "inventory"."grn_items" ("drug_id");
CREATE INDEX "ix_grn_items_item_id" ON "inventory"."grn_items" ("item_id");
CREATE INDEX "ix_grn_items_created" ON "inventory"."grn_items" ("created_at");
CREATE UNIQUE INDEX "ux_stock_adjustments_adj_no" ON "inventory"."stock_adjustments" ("adj_no") WHERE "is_deleted" = false AND "adj_no" IS NOT NULL;
CREATE INDEX "ix_stock_adjustments_store_id" ON "inventory"."stock_adjustments" ("store_id");
CREATE INDEX "ix_stock_adjustments_batch_id" ON "inventory"."stock_adjustments" ("batch_id");
CREATE INDEX "ix_stock_adjustments_created" ON "inventory"."stock_adjustments" ("created_at");
CREATE UNIQUE INDEX "ux_stock_transfers_trf_no" ON "inventory"."stock_transfers" ("trf_no") WHERE "is_deleted" = false AND "trf_no" IS NOT NULL;
CREATE INDEX "ix_stock_transfers_from_store_id" ON "inventory"."stock_transfers" ("from_store_id");
CREATE INDEX "ix_stock_transfers_to_store_id" ON "inventory"."stock_transfers" ("to_store_id");
CREATE INDEX "ix_stock_transfers_batch_id" ON "inventory"."stock_transfers" ("batch_id");
CREATE INDEX "ix_stock_transfers_created" ON "inventory"."stock_transfers" ("created_at");
CREATE UNIQUE INDEX "ux_services_code" ON "billing"."services" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_services_department_id" ON "billing"."services" ("department_id");
CREATE INDEX "ix_services_created" ON "billing"."services" ("created_at");
CREATE INDEX "ix_price_lists_payer_id" ON "billing"."price_lists" ("payer_id");
CREATE INDEX "ix_price_lists_corporate_id" ON "billing"."price_lists" ("corporate_id");
CREATE INDEX "ix_price_lists_created" ON "billing"."price_lists" ("created_at");
CREATE INDEX "ix_price_list_items_price_list_id" ON "billing"."price_list_items" ("price_list_id");
CREATE INDEX "ix_price_list_items_service_id" ON "billing"."price_list_items" ("service_id");
CREATE INDEX "ix_price_list_items_created" ON "billing"."price_list_items" ("created_at");
CREATE INDEX "ix_packages_created" ON "billing"."packages" ("created_at");
CREATE INDEX "ix_package_items_package_id" ON "billing"."package_items" ("package_id");
CREATE INDEX "ix_package_items_service_id" ON "billing"."package_items" ("service_id");
CREATE INDEX "ix_package_items_created" ON "billing"."package_items" ("created_at");
CREATE INDEX "ix_charges_visit_id" ON "billing"."charges" ("visit_id");
CREATE INDEX "ix_charges_patient_id" ON "billing"."charges" ("patient_id");
CREATE INDEX "ix_charges_service_id" ON "billing"."charges" ("service_id");
CREATE INDEX "ix_charges_invoice_id" ON "billing"."charges" ("invoice_id");
CREATE INDEX "ix_charges_created" ON "billing"."charges" ("created_at");
CREATE UNIQUE INDEX "ux_invoices_invoice_no" ON "billing"."invoices" ("invoice_no") WHERE "is_deleted" = false AND "invoice_no" IS NOT NULL;
CREATE INDEX "ix_invoices_visit_id" ON "billing"."invoices" ("visit_id");
CREATE INDEX "ix_invoices_patient_id" ON "billing"."invoices" ("patient_id");
CREATE INDEX "ix_invoices_payer_id" ON "billing"."invoices" ("payer_id");
CREATE INDEX "ix_invoices_policy_id" ON "billing"."invoices" ("policy_id");
CREATE INDEX "ix_invoices_corporate_id" ON "billing"."invoices" ("corporate_id");
CREATE INDEX "ix_invoices_created" ON "billing"."invoices" ("created_at");
CREATE UNIQUE INDEX "ux_payments_receipt_no" ON "billing"."payments" ("receipt_no") WHERE "is_deleted" = false AND "receipt_no" IS NOT NULL;
CREATE INDEX "ix_payments_invoice_id" ON "billing"."payments" ("invoice_id");
CREATE INDEX "ix_payments_patient_id" ON "billing"."payments" ("patient_id");
CREATE INDEX "ix_payments_cashier_id" ON "billing"."payments" ("cashier_id");
CREATE INDEX "ix_payments_session_id" ON "billing"."payments" ("session_id");
CREATE INDEX "ix_payments_created" ON "billing"."payments" ("created_at");
CREATE INDEX "ix_deposits_patient_id" ON "billing"."deposits" ("patient_id");
CREATE INDEX "ix_deposits_created" ON "billing"."deposits" ("created_at");
CREATE UNIQUE INDEX "ux_refunds_refund_no" ON "billing"."refunds" ("refund_no") WHERE "is_deleted" = false AND "refund_no" IS NOT NULL;
CREATE INDEX "ix_refunds_invoice_id" ON "billing"."refunds" ("invoice_id");
CREATE INDEX "ix_refunds_requested_by" ON "billing"."refunds" ("requested_by");
CREATE INDEX "ix_refunds_approved_by" ON "billing"."refunds" ("approved_by");
CREATE INDEX "ix_refunds_created" ON "billing"."refunds" ("created_at");
CREATE UNIQUE INDEX "ux_credit_notes_cn_no" ON "billing"."credit_notes" ("cn_no") WHERE "is_deleted" = false AND "cn_no" IS NOT NULL;
CREATE INDEX "ix_credit_notes_invoice_id" ON "billing"."credit_notes" ("invoice_id");
CREATE INDEX "ix_credit_notes_created" ON "billing"."credit_notes" ("created_at");
CREATE INDEX "ix_cashier_sessions_user_id" ON "billing"."cashier_sessions" ("user_id");
CREATE INDEX "ix_cashier_sessions_created" ON "billing"."cashier_sessions" ("created_at");
CREATE INDEX "ix_discount_approvals_invoice_id" ON "billing"."discount_approvals" ("invoice_id");
CREATE INDEX "ix_discount_approvals_requested_by" ON "billing"."discount_approvals" ("requested_by");
CREATE INDEX "ix_discount_approvals_approved_by" ON "billing"."discount_approvals" ("approved_by");
CREATE INDEX "ix_discount_approvals_created" ON "billing"."discount_approvals" ("created_at");
CREATE UNIQUE INDEX "ux_payers_code" ON "insurance"."payers" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_payers_created" ON "insurance"."payers" ("created_at");
CREATE INDEX "ix_plans_payer_id" ON "insurance"."plans" ("payer_id");
CREATE INDEX "ix_plans_created" ON "insurance"."plans" ("created_at");
CREATE INDEX "ix_policy_members_patient_id" ON "insurance"."policy_members" ("patient_id");
CREATE INDEX "ix_policy_members_payer_id" ON "insurance"."policy_members" ("payer_id");
CREATE INDEX "ix_policy_members_plan_id" ON "insurance"."policy_members" ("plan_id");
CREATE INDEX "ix_policy_members_corporate_id" ON "insurance"."policy_members" ("corporate_id");
CREATE INDEX "ix_policy_members_created" ON "insurance"."policy_members" ("created_at");
CREATE INDEX "ix_eligibility_checks_visit_id" ON "insurance"."eligibility_checks" ("visit_id");
CREATE INDEX "ix_eligibility_checks_policy_id" ON "insurance"."eligibility_checks" ("policy_id");
CREATE INDEX "ix_eligibility_checks_checked_by" ON "insurance"."eligibility_checks" ("checked_by");
CREATE INDEX "ix_eligibility_checks_created" ON "insurance"."eligibility_checks" ("created_at");
CREATE UNIQUE INDEX "ux_pre_auths_auth_no" ON "insurance"."pre_auths" ("auth_no") WHERE "is_deleted" = false AND "auth_no" IS NOT NULL;
CREATE INDEX "ix_pre_auths_visit_id" ON "insurance"."pre_auths" ("visit_id");
CREATE INDEX "ix_pre_auths_patient_id" ON "insurance"."pre_auths" ("patient_id");
CREATE INDEX "ix_pre_auths_policy_id" ON "insurance"."pre_auths" ("policy_id");
CREATE INDEX "ix_pre_auths_service_id" ON "insurance"."pre_auths" ("service_id");
CREATE INDEX "ix_pre_auths_requested_by" ON "insurance"."pre_auths" ("requested_by");
CREATE INDEX "ix_pre_auths_created" ON "insurance"."pre_auths" ("created_at");
CREATE UNIQUE INDEX "ux_claims_claim_no" ON "insurance"."claims" ("claim_no") WHERE "is_deleted" = false AND "claim_no" IS NOT NULL;
CREATE INDEX "ix_claims_invoice_id" ON "insurance"."claims" ("invoice_id");
CREATE INDEX "ix_claims_visit_id" ON "insurance"."claims" ("visit_id");
CREATE INDEX "ix_claims_patient_id" ON "insurance"."claims" ("patient_id");
CREATE INDEX "ix_claims_payer_id" ON "insurance"."claims" ("payer_id");
CREATE INDEX "ix_claims_policy_id" ON "insurance"."claims" ("policy_id");
CREATE INDEX "ix_claims_batch_id" ON "insurance"."claims" ("batch_id");
CREATE INDEX "ix_claims_created" ON "insurance"."claims" ("created_at");
CREATE INDEX "ix_claim_lines_claim_id" ON "insurance"."claim_lines" ("claim_id");
CREATE INDEX "ix_claim_lines_charge_id" ON "insurance"."claim_lines" ("charge_id");
CREATE INDEX "ix_claim_lines_service_id" ON "insurance"."claim_lines" ("service_id");
CREATE INDEX "ix_claim_lines_created" ON "insurance"."claim_lines" ("created_at");
CREATE UNIQUE INDEX "ux_claim_batches_batch_no" ON "insurance"."claim_batches" ("batch_no") WHERE "is_deleted" = false AND "batch_no" IS NOT NULL;
CREATE INDEX "ix_claim_batches_payer_id" ON "insurance"."claim_batches" ("payer_id");
CREATE INDEX "ix_claim_batches_created" ON "insurance"."claim_batches" ("created_at");
CREATE UNIQUE INDEX "ux_rejection_codes_code" ON "insurance"."rejection_codes" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_rejection_codes_created" ON "insurance"."rejection_codes" ("created_at");
CREATE INDEX "ix_rejections_claim_id" ON "insurance"."rejections" ("claim_id");
CREATE INDEX "ix_rejections_code_id" ON "insurance"."rejections" ("code_id");
CREATE INDEX "ix_rejections_assigned_to" ON "insurance"."rejections" ("assigned_to");
CREATE INDEX "ix_rejections_created" ON "insurance"."rejections" ("created_at");
CREATE UNIQUE INDEX "ux_remittances_remit_no" ON "insurance"."remittances" ("remit_no") WHERE "is_deleted" = false AND "remit_no" IS NOT NULL;
CREATE INDEX "ix_remittances_payer_id" ON "insurance"."remittances" ("payer_id");
CREATE INDEX "ix_remittances_created" ON "insurance"."remittances" ("created_at");
CREATE INDEX "ix_remittance_lines_remittance_id" ON "insurance"."remittance_lines" ("remittance_id");
CREATE INDEX "ix_remittance_lines_claim_id" ON "insurance"."remittance_lines" ("claim_id");
CREATE INDEX "ix_remittance_lines_created" ON "insurance"."remittance_lines" ("created_at");
CREATE INDEX "ix_corporate_accounts_created" ON "insurance"."corporate_accounts" ("created_at");
CREATE INDEX "ix_guarantee_letters_corporate_id" ON "insurance"."guarantee_letters" ("corporate_id");
CREATE INDEX "ix_guarantee_letters_patient_id" ON "insurance"."guarantee_letters" ("patient_id");
CREATE INDEX "ix_guarantee_letters_created" ON "insurance"."guarantee_letters" ("created_at");
CREATE INDEX "ix_corporate_payments_corporate_id" ON "insurance"."corporate_payments" ("corporate_id");
CREATE INDEX "ix_corporate_payments_created" ON "insurance"."corporate_payments" ("created_at");
CREATE UNIQUE INDEX "ux_write_offs_wo_no" ON "insurance"."write_offs" ("wo_no") WHERE "is_deleted" = false AND "wo_no" IS NOT NULL;
CREATE INDEX "ix_write_offs_invoice_id" ON "insurance"."write_offs" ("invoice_id");
CREATE INDEX "ix_write_offs_claim_id" ON "insurance"."write_offs" ("claim_id");
CREATE INDEX "ix_write_offs_approved_by" ON "insurance"."write_offs" ("approved_by");
CREATE INDEX "ix_write_offs_created" ON "insurance"."write_offs" ("created_at");
CREATE UNIQUE INDEX "ux_ledger_accounts_code" ON "finance"."ledger_accounts" ("code") WHERE "is_deleted" = false AND "code" IS NOT NULL;
CREATE INDEX "ix_ledger_accounts_created" ON "finance"."ledger_accounts" ("created_at");
CREATE UNIQUE INDEX "ux_journals_journal_no" ON "finance"."journals" ("journal_no") WHERE "is_deleted" = false AND "journal_no" IS NOT NULL;
CREATE INDEX "ix_journals_created" ON "finance"."journals" ("created_at");
CREATE INDEX "ix_journal_lines_journal_id" ON "finance"."journal_lines" ("journal_id");
CREATE INDEX "ix_journal_lines_account_id" ON "finance"."journal_lines" ("account_id");
CREATE INDEX "ix_journal_lines_created" ON "finance"."journal_lines" ("created_at");
CREATE INDEX "ix_vendor_bills_supplier_id" ON "finance"."vendor_bills" ("supplier_id");
CREATE INDEX "ix_vendor_bills_grn_id" ON "finance"."vendor_bills" ("grn_id");
CREATE INDEX "ix_vendor_bills_created" ON "finance"."vendor_bills" ("created_at");
CREATE INDEX "ix_vendor_payments_bill_id" ON "finance"."vendor_payments" ("bill_id");
CREATE INDEX "ix_vendor_payments_created" ON "finance"."vendor_payments" ("created_at");
CREATE INDEX "ix_bank_accounts_created" ON "finance"."bank_accounts" ("created_at");
CREATE INDEX "ix_bank_statement_lines_bank_account_id" ON "finance"."bank_statement_lines" ("bank_account_id");
CREATE INDEX "ix_bank_statement_lines_created" ON "finance"."bank_statement_lines" ("created_at");
CREATE UNIQUE INDEX "ux_employees_emp_no" ON "hr"."employees" ("emp_no") WHERE "is_deleted" = false AND "emp_no" IS NOT NULL;
CREATE INDEX "ix_employees_department_id" ON "hr"."employees" ("department_id");
CREATE INDEX "ix_employees_user_id" ON "hr"."employees" ("user_id");
CREATE INDEX "ix_employees_created" ON "hr"."employees" ("created_at");
CREATE INDEX "ix_rosters_employee_id" ON "hr"."rosters" ("employee_id");
CREATE INDEX "ix_rosters_created" ON "hr"."rosters" ("created_at");
CREATE INDEX "ix_attendance_employee_id" ON "hr"."attendance" ("employee_id");
CREATE INDEX "ix_attendance_created" ON "hr"."attendance" ("created_at");
CREATE INDEX "ix_leaves_employee_id" ON "hr"."leaves" ("employee_id");
CREATE INDEX "ix_leaves_approved_by" ON "hr"."leaves" ("approved_by");
CREATE INDEX "ix_leaves_created" ON "hr"."leaves" ("created_at");
CREATE UNIQUE INDEX "ux_payroll_runs_period" ON "hr"."payroll_runs" ("period") WHERE "is_deleted" = false AND "period" IS NOT NULL;
CREATE INDEX "ix_payroll_runs_created" ON "hr"."payroll_runs" ("created_at");
CREATE INDEX "ix_payslips_run_id" ON "hr"."payslips" ("run_id");
CREATE INDEX "ix_payslips_employee_id" ON "hr"."payslips" ("employee_id");
CREATE INDEX "ix_payslips_created" ON "hr"."payslips" ("created_at");
CREATE INDEX "ix_doctor_revenue_share_doctor_id" ON "hr"."doctor_revenue_share" ("doctor_id");
CREATE INDEX "ix_doctor_revenue_share_created" ON "hr"."doctor_revenue_share" ("created_at");
CREATE UNIQUE INDEX "ux_equipment_asset_no" ON "assets"."equipment" ("asset_no") WHERE "is_deleted" = false AND "asset_no" IS NOT NULL;
CREATE INDEX "ix_equipment_department_id" ON "assets"."equipment" ("department_id");
CREATE INDEX "ix_equipment_created" ON "assets"."equipment" ("created_at");
CREATE UNIQUE INDEX "ux_maintenance_tickets_ticket_no" ON "assets"."maintenance_tickets" ("ticket_no") WHERE "is_deleted" = false AND "ticket_no" IS NOT NULL;
CREATE INDEX "ix_maintenance_tickets_equipment_id" ON "assets"."maintenance_tickets" ("equipment_id");
CREATE INDEX "ix_maintenance_tickets_reported_by" ON "assets"."maintenance_tickets" ("reported_by");
CREATE INDEX "ix_maintenance_tickets_created" ON "assets"."maintenance_tickets" ("created_at");
