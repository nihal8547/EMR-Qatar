'use strict';
/** Pre-flight check for a production deployment:  NODE_ENV=production node scripts/prod-check.js */
const checks = [];
const add = (name, ok, hint) => checks.push({ name, ok, hint });
const e = process.env;
add('NODE_ENV=production', e.NODE_ENV === 'production', 'set NODE_ENV=production');
add('JWT_SECRET >= 32 chars', (e.JWT_SECRET || '').length >= 32, 'openssl rand -base64 48');
add('DATA_ENCRYPTION_KEY set (separate from JWT_SECRET)', (e.DATA_ENCRYPTION_KEY || '').length >= 32, 'openssl rand -base64 48 (changing it later makes stored Evolution key unreadable)');
add('DB password is not the default', !!e.PGPASSWORD || /:\/\/[^:]+:[^@]+@/.test(e.DATABASE_URL || ''), 'use a strong DB password via DATABASE_URL or PG* env');
add('DB password not "hms"/"postgres"', !/(:hms@|:postgres@|PGPASSWORD=(hms|postgres)$)/.test(`${e.DATABASE_URL || ''}`) && !['hms', 'postgres', 'password'].includes(e.PGPASSWORD || ''), 'rotate the default DB password');
add('TRUST_PROXY set (behind Caddy/nginx)', !!e.TRUST_PROXY, 'TRUST_PROXY=1 so real client IPs reach the audit log + rate limiter');
add('PUBLIC_BASE_URL is https', /^https:\/\//.test(e.PUBLIC_BASE_URL || ''), 'PUBLIC_BASE_URL=https://hms.yourcentre.qa');
add('CORS_ORIGIN unset or https only', !e.CORS_ORIGIN || e.CORS_ORIGIN.split(',').every((o) => /^https:\/\//.test(o.trim())), 'use https origins only');
add('MFA_REQUIRED_ROLES set (admins)', !!e.MFA_REQUIRED_ROLES, 'e.g. MFA_REQUIRED_ROLES="Super Admin,Accountant"');
add('N8N_WEBHOOK_SECRET set if WhatsApp is used', !e.N8N_WEBHOOK_BASE || (e.N8N_WEBHOOK_SECRET || '').length >= 24, 'openssl rand -hex 24');
add('DEMO_PASSWORD not weak default', !e.DEMO_PASSWORD || (e.DEMO_PASSWORD !== 'Demo@12345' && e.DEMO_PASSWORD.length >= 12), 'leave unset to get a random one printed at seed time');
let bad = 0;
for (const c of checks) { console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  -> ' + c.hint}`); if (!c.ok) bad++; }
console.log(bad ? `\n${bad} issue(s) to fix before go-live.` : '\nAll production checks passed.');
process.exit(bad ? 1 : 0);
