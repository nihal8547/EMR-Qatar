# Qatar HMS – Medical Centre Management System

Nuxt 3 (frontend) · Node.js/Express (API) · PostgreSQL with one schema per domain.
One registry file set (`backend/src/registry/`) drives the tables, the REST API, permissions, sidebar and the generic list/form pages.

## Sample data
`npm run db:reset` loads masters, roles and a few demo patients (this is the state the automated tests expect). `npm run db:reset:demo` (or `npm run db:demo` on top of it) also loads a full working set: about 14 patients with visits, vitals, lab results, imaging reports, prescriptions, dispensing (including a controlled drug with witness), invoices, payments, a submitted claim, dental charts, and at least 3 rows on every page. It is created through the real API, so every record follows the business rules. Docker first start loads it automatically; set `DEMO_DATA=false` to skip.

## Dental module
Sidebar **Dental**: a visual chart (FDI numbering, permanent and primary teeth, five surfaces per tooth, 16 conditions), treatment plans with priced procedures, and completion that posts the charge to the patient's open visit and updates the chart. Demo dentist: `drdental`. Patients not yet treated by the dentist need a break-glass reason (audited), like Patient 360.

## Run with Docker (easiest)

```bash
cp .env.example .env        # set JWT_SECRET and DB_PASSWORD
docker compose up -d --build
# open http://localhost:4000   (APP_PORT in .env changes the port)
```
First start creates all tables and demo data automatically; later starts skip that. Data lives in the `hms_pgdata` volume.
Stop: `docker compose down` (add `-v` to also delete the data). Backup: `docker compose exec db pg_dump -U hms qatar_hms > backup.sql`.
The Docker files were validated with `docker compose config` and the start-up script was run against an empty database, but the image itself was not built in my environment (no Docker daemon there). If the build fails, tell me the error.

## Run without Docker

Requirements: Node 20+, PostgreSQL 14+.

```bash
# 1. database (once)
sudo -u postgres psql -c "CREATE USER hms WITH PASSWORD 'hms_pass' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE qatar_hms OWNER hms;"

# 2. backend: tables + roles + demo data
cd backend && cp .env.example .env   # set JWT_SECRET
npm install
npm run db:reset                     # drops and recreates every schema, then seeds

# 3. frontend build (served by the API)
cd ../frontend && npm install && npm run build

# 4. start
cd ../backend && npm start           # http://localhost:4000
```
Development with hot reload: `npm run dev` in `frontend/` (proxies `/api` to port 4000).
Tests: start the API on a freshly seeded DB, then `node backend/test/smoke.js` (115 checks across all roles and the full patient journey).

## Demo logins (password `Demo@12345` – change before real use)
`admin` (everything) · `manager` · `reception` · `nurse` · `drsara`, `drravi` (doctors) · `lab` · `radiology` · `pharmacist` · `store` · `cashier` · `claims` · `accountant` · `hr` · `patient` (portal)

## What is in it
Front office (patients/MPI with QID check, appointments, check-in, queue, consents, family, documents) · Clinical (vitals, consultation, ICD-10, orders, prescriptions with allergy-class and interaction checks, certificates, referrals, Patient 360 with break-glass) · Laboratory (collect, results with auto flags/criticals, validate, QC, panels, print report) · Radiology orders and reports · Pharmacy (FEFO dispensing, controlled-drug register, OTC POS, stock/expiry) · Inventory (requisition, PO, GRN, adjustments, transfers) · Billing (price lists, packages, charges, invoices, split by plan co-pay, payments, deposits, refunds, credit notes, discount approvals, cashier sessions) · Insurance (policies, eligibility, pre-auth, claims with scrubbing, batches, rejections, remittance, corporate accounts, guarantee letters, write-offs) · Finance (ledger, journals, vendor bills, bank) · HR (employees, roster, attendance, leave, payroll, revenue share) · Assets · Reports (16) · Patient portal · Role and permission matrix, audit log.
Access: 14 roles, permissions per resource (view/create/edit/delete) plus special actions; sidebar and pages follow them; the API enforces the same rules. Edit them in **Administration → Role & Permission Matrix**.

## Honest limits – read before using with real patients
- **Insurer eligibility and claim submission are simulated.** Claims are scrubbed, batched and logged, but nothing is sent to any payer. A per-insurer adapter must be built and tested.
- **Not integrated:** QHIE-Hub / national HL7 FHIR exchange, lab analyzers, PACS, SMS/WhatsApp, payment gateway, e-signature. Settings placeholders exist; results are typed in by hand.
- Allergy and interaction checks use a small built-in drug-class list and the interactions you enter. They are an aid, not a clinical decision-support product.
- Finance and payroll are basic (no automatic posting of invoices to the ledger, no WPS/SIF file, no end-of-service calculation).
- Not yet done: Arabic UI / RTL, file upload storage for documents (records metadata only), 2-factor login, automated backups, load testing.
- Compliance (PDPPL, MOPH licensing, data residency, retention) needs your legal/IT review and hosting decisions. No VAT is charged by default; confirm with your accountant.
- Set a strong `JWT_SECRET`, change all demo passwords, serve over HTTPS, and back up PostgreSQL.
