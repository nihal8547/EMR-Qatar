# Qatar HMS – Security review (26 Nov 2026)

Scope: backend (Express/PostgreSQL), frontend (Nuxt static + service worker), Docker, WhatsApp/n8n integration.
Method: code review, dependency audit, secret scan, 60+ live attack probes against a running instance, the existing 6065-check role/permission test and the smoke tests.

## 0. Status after hardening (production pass)

Every finding below was worked through one by one. All automated tests pass on a clean database (smoke 286, security 6065, WhatsApp/n8n 49, auth/MFA 36, record-scoping probe).

| # | Finding | Status | What was done |
|---|---|---|---|
| 1 | Known seed password in production | Fixed | Random password generated at seed; seeded users must change it at first login |
| 2 | Doctors/nurses could open any patient's records | Fixed | Care-relationship scoping on every clinical read/list/print; "break-glass" reason (audited) for emergencies; writes blocked |
| 3 | Login throttle bypass | Fixed | Per-username throttle plus per-IP login limiter |
| 4 | Weak JWT secret | Fixed | Production refuses to start with a missing/short secret |
| 5 | Open CORS | Fixed | Same-origin by default |
| 6 | Missing browser security headers | Fixed | CSP, HSTS, Permissions-Policy, COOP, no-sniff, frame deny |
| 7 | Username enumeration by timing | Fixed | Constant-time dummy hash compare |
| 8 | PDF links | Fixed | Signed, expiring, scoped tokens |
| 9 | CSV formula injection | Fixed | Cells starting with = + - @ are neutralised |
| 10 | Container ran as root | Fixed | `USER node`; DB not published; compose requires DB_PASSWORD |
| 11 | Evolution API key readable/plaintext | Fixed | AES-256-GCM at rest (DATA_ENCRYPTION_KEY), masked in API/UI |
| 12 | 8h token, no revocation | Fixed | Server-side sessions: logout, logout-everywhere, revoked on password change/reset/MFA reset; idle timeout (60 min prod) and 30 min browser auto-logout |
| 13 | No MFA | Fixed | TOTP (Google/Microsoft Authenticator) with QR; replay-protected; `MFA_REQUIRED_ROLES` makes it mandatory per role; admin reset |
| 14 | Weak password rules | Fixed | 10+ chars, letters+numbers, no common/username; admin-set passwords force change at next login |
| 15 | No global rate limiting | Fixed | 600 req/min/IP in production (tunable), 60/min on public links |
| 16 | Audit log could be edited | Fixed | Hash-chained, append-only (DB triggers block UPDATE/DELETE); `GET /api/admin/audit-verify` proves integrity |
| 17 | Admin-set URLs (SSRF) | Fixed | https only in production, blocks private/metadata addresses, no embedded credentials |
| 18 | `/health` leaked internals | Fixed | Returns only `{ok:true}` |
| 19 | Offline cache kept patient data | Fixed | Cleared on login, logout and session expiry; auto-logout when idle |
| 20 | No HTTPS / backups | Provided | `deploy/` Caddy (auto TLS) overlay, encrypted nightly `backup.sh`, `npm run prod:check` pre-flight |
| 21 | Frontend `npm audit` | Accepted | Only build-time tooling (nuxt dev deps); nothing vulnerable ships to browsers. Backend: 0 vulnerabilities |
| 22 | n8n shared secret lives in the workflow's Config node | Open (low) | Only n8n admins can read it. Hardening: create an n8n "Header Auth" credential and select it on the 4 webhook nodes; keep `N8N_WEBHOOK_SECRET` equal |

Still your responsibility (cannot be done in code): run behind HTTPS, set the env values in `.env`, restrict server SSH/firewall, off-site copy of backups and a monthly restore test, keep Docker/OS patched, and make sure users keep their authenticator phones safe.

## 1. Summary
| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Seeded accounts (admin, doctors, cashier... ) all use the known password `Demo@12345`, also in production | **Critical** | Fixed: production seed generates a random password (printed once in the container log). You must still change/disable accounts you do not use. |
| 2 | Restricted roles (Doctor, Nurse) can read other doctors' clinical records through the generic record API (`/r/encounters`, `/r/prescriptions`, `/r/lab_orders`, `/r/diagnoses`, `/r/vitals`, `/r/visits/:id`, `/print/...`). The "own patients / break-glass" rule is enforced only in Consultation, Patient 360 and Dental. | **High** | **OPEN** (see section 3) |
| 3 | Login throttle could be bypassed by rotating `X-Forwarded-For` (key included IP; `trust proxy` was on) → unlimited password guessing | High | Fixed: throttle is per username; forwarded headers trusted only if `TRUST_PROXY` is set |
| 4 | Server accepts tokens signed with the default dev secret when `JWT_SECRET` is not set (outside production) | High if deployed that way | Hardened: production refuses to start without a ≥32 char `JWT_SECRET`. Always set it. |
| 5 | CORS reflected any origin | Medium | Fixed: same-origin by default, `CORS_ORIGIN` to allow others |
| 6 | No Content-Security-Policy / HSTS / Permissions-Policy | Medium | Fixed (CSP, HSTS when served over HTTPS, Permissions-Policy, COOP) |
| 7 | Username enumeration by response time (unknown user ~6 ms vs known ~96 ms) | Medium | Fixed (constant-time compare against a dummy hash) |
| 8 | Signed WhatsApp PDF links were signed with the JWT secret | Low | Fixed: separate derived key (`NOTIFY_FILE_SECRET` to override) |
| 9 | CSV export allowed spreadsheet formula injection (`=cmd...` in a name) | Medium | Fixed (cells starting with = + - @ are prefixed) |
| 10 | Container ran as root | Low | Fixed (`USER node`) |
| 11 | Evolution API key stored in plain text in the settings table | Medium | Mitigated: never returned by the API, masked in the settings list, cannot be edited generically; env var `EVOLUTION_API_KEY` is preferred. A DB backup still contains it. |
| 12 | n8n workflow shared secret is in the workflow "Config" node as plain text | Medium | Open: move to an n8n credential (Header Auth) and a webhook credential check |
| 13 | Admin-set URLs (Evolution, n8n) make the server call arbitrary hosts (SSRF by an admin) | Low | Accepted (admin-only); restrict outbound traffic at the firewall |
| 14 | Offline mode keeps recently read patient data in the browser cache | Medium (shared computers) | Mitigated: cache is wiped at logout / session expiry. Do not stay logged in on shared PCs. |
| 15 | JWT valid 8 h, stored in localStorage, no server-side logout/revocation, no MFA, 8-character minimum password | Medium | Open (recommendations below) |
| 16 | Frontend `npm audit`: 8 moderate advisories (Nuxt dev server / nitro / minimatch) | Low | Dev/build-time only; the production site is static files. Backend: 0 vulnerabilities. |
| 17 | `/api/health` is public and shows uptime and DB latency | Info | Accepted |
| 18 | In-memory login throttle resets on restart; locks a username for 5 min after 8 failures (an attacker can lock a known user) | Info | Accepted trade-off |

## 2. What was tested and is OK
- All 11 sampled endpoints reject requests without a token; `alg=none` and tampered tokens rejected.
- Patient portal role: 15 internal endpoints (patients, users, invoices, audit log, settings, WhatsApp config, other patients' records) all denied.
- Privilege escalation: reception cannot create users, edit roles, read the audit log or change its own role.
- SQL injection in `q`, `sort`, `filter[...]` (incl. `pg_sleep`, UNION, DROP): all safe (parameterised queries, whitelisted sort columns).
- Password hashes never returned by the users API; audit log contains no passwords or tokens; no secrets in the repository or `.env` committed.
- Path traversal on the static server and API: blocked.
- Mass assignment (`id`, `mrn`, `created_by`, `is_deleted` in a create request): ignored. Prototype-pollution payload: harmless.
- Public document links: unsigned/tampered/expired links return 403.
- No `v-html` anywhere in the frontend (XSS surface minimal); responses use `nosniff`, `X-Frame-Options: DENY`, `no-store` for API.
- Server errors return a generic message (no stack traces / SQL).
- Dedicated database guard: HMS refuses to run against an n8n database.
- Dependency audit backend: 0 vulnerabilities.

## 3. Open item that needs your decision: doctor/nurse record scoping (finding 2)
Role flag "restrict to own visits" is honoured in Consultation, Patient 360 and Dental only. A Doctor can open `/r/encounters`, `/r/prescriptions`, `/r/lab_orders`, `/r/diagnoses`, `/r/vitals`, `/r/visits/:id` and `/print/...` for any patient and read every clinical note. Confirmed live: Dr. Ravi read Dr. Sara's visit 2 and lists of 6 encounters / 5 prescriptions of all doctors.
Recommended fix (about half a day): apply one central rule in the generic list/get/print code: for restricted roles, only rows whose patient has a visit with this user (doctors) or an open visit in the queue (nurses), unless a break-glass reason was logged (the same rule Patient 360 already uses), and log every break-glass read. This touches many screens, so it needs a full test run; I did not change it blindly.

## 4. Before going live (checklist)
1. Set `JWT_SECRET` (32+ random chars), `DB_PASSWORD`, `N8N_WEBHOOK_SECRET`, `EVOLUTION_API_KEY`, `DEMO_PASSWORD` or note the generated password; set `DEMO_DATA=false` for a real centre and delete/disable demo users.
2. Serve only over HTTPS (reverse proxy such as Caddy/nginx) and set `TRUST_PROXY=1` there. Keep PostgreSQL unexposed (compose already does not publish it). Firewall outbound traffic except Evolution/n8n.
3. Give each staff member their own account; disable unused ones; enforce longer passwords (recommend 12+) and consider MFA.
4. Encrypted backups of the database and of any export; restrict who can read the settings table.
5. Patient data law: Qatar's personal data protection law (Law No. 13 of 2016) applies to patient data; confirm consent for WhatsApp messages (the `whatsapp_ok` opt-out exists) and where data is hosted. This report is not legal advice.
6. Regular `npm audit`, keep Node/Postgres images updated, review the audit log.

## 5. Recommended next improvements
- Central record scoping with break-glass (finding 2).
- Shorter token life + refresh, server-side session list and "log out everywhere", optional TOTP MFA for admin/cashier/doctor.
- Move all secrets (Evolution, n8n) into credentials; rotate keys periodically.
- Per-IP and global rate limiting (e.g. at the reverse proxy), plus limits on the public PDF endpoint.
- Tamper-evident audit log (hash chain) and alerts for repeated failed logins.
