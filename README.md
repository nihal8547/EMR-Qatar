# Qatar HMS – Medical Centre Management System

Nuxt 3 (frontend) · Node.js/Express (API) · PostgreSQL with one schema per domain.
One registry file set (`backend/src/registry/`) drives the tables, the REST API, permissions, sidebar and the generic list/form pages.

## Sample data
`npm run db:reset` loads masters, roles and a few demo patients (this is the state the automated tests expect). `npm run db:reset:demo` (or `npm run db:demo` on top of it) also loads a full working set: about 14 patients with visits, vitals, lab results, imaging reports, prescriptions, dispensing (including a controlled drug with witness), invoices, payments, a submitted claim, dental charts, and at least 3 rows on every page. It is created through the real API, so every record follows the business rules. Docker first start loads it automatically; set `DEMO_DATA=false` to skip.

## Vaccination register and growth charts
Sidebar **Clinical → Vaccinations**: due/overdue list for children, per-patient schedule (given, refused, deferred, overdue, upcoming, optional), outside doses, batch/expiry, printable vaccination card. The routine schedule is loaded by `npm run db:catalog` from the Qatar MoPH national schedule and is editable in **Vaccine Master**: verify it against the current MoPH schedule before go-live. **Growth Charts (WHO)** plots weight, length/height, head circumference and BMI against the WHO Child Growth Standards (0–5 years, z-scores and percentiles, flags below -2 / above +2 SD); triage vitals feed it automatically. Premature-birth age correction is not applied. Test: `node test/paediatrics.js` on `db:reset:demo`.

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

## Offline support
- The app is installable (PWA) and a service worker caches the whole app after the first visit, so it opens with no connection (HTTPS or localhost required). Run `npm run build` in `frontend/` (it also writes `precache.json`).
- Pages and records you opened recently stay readable offline (last 400 answers). They are wiped at logout.
- New patients and vitals can be entered offline: they are kept on the device and sent automatically when the connection returns (bar at the top shows the queue, with Send now / Retry / Discard). Anything rejected by the server (e.g. duplicate QID) stays in the list for a person to fix.
- Payments, refunds, day close, results, billing etc. need a live connection and say so clearly; nothing is queued for them on purpose.


## Going live (production checklist)

1. `cp .env.example .env` and fill `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `DB_PASSWORD` (`openssl rand -base64 48`), `PUBLIC_BASE_URL`, `TRUST_PROXY=1`, `MFA_REQUIRED_ROLES`.
2. Edit the domain in `deploy/Caddyfile`, then `docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build` (automatic HTTPS).
3. Read the generated admin password from the first start log (`docker compose logs app | grep "Demo password"`); every seeded user must change it at first login. Turn on two-factor for admins on *My account*.
4. `cd backend && NODE_ENV=production npm run prod:check` – every line should say PASS.
5. Schedule `deploy/backup.sh` (cron) and test a restore.
6. Security details: `SECURITY_REPORT.md`. Tests: `npm test`, `node test/security.js`, `node test/auth.js`, `node test/scope.js`, `node test/notify.js`.

## Default Qatar catalogue
`npm run db:catalog` (also automatic on first start; `CATALOG=false` skips it) loads ~330 pharmacy items (brand names common in Qatar, controlled/narcotic flagged), ~120 lab tests with reference and critical ranges, ~50 X-ray / ultrasound / CT / MRI / mammogram / DEXA studies, ~80 consultations, procedures, vaccines and dental treatments, and ~400 common ICD-10 diagnoses. It never overwrites existing rows, so it is safe to re-run. Prices are indicative QAR defaults: review them in *Service Master* and *Drug Master* before go-live, and load the MOPH ICD-10-CM set for insurance claims. Source lists are in `backend/src/catalog/`.
