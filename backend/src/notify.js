'use strict';
/**
 * WhatsApp notifications through n8n (which talks to the Evolution API).
 * HMS never holds WhatsApp credentials: it only POSTs a signed JSON event to an n8n webhook and
 * exposes short-lived, signed PDF links (invoice, lab report, imaging report) that n8n forwards to the patient.
 *   env / settings:  N8N_WEBHOOK_BASE (setting n8n_webhook_base), N8N_WEBHOOK_SECRET, PUBLIC_BASE_URL (setting public_base_url),
 *                    setting n8n_enabled = true|false, setting n8n_send_bill_on_complete = true|false
 */
const crypto = require('crypto');
const db = require('./db');

const PATHS = { 'patient.registered': 'patient-registered', 'result.ready': 'result-ready', 'visit.completed': 'visit-completed', 'bill.send': 'bill-send' };
const FILE_SECRET = () => process.env.NOTIFY_FILE_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me';
let cache = null; let cacheAt = 0;

async function settings() {
  if (cache && Date.now() - cacheAt < 15000) return cache;
  const rows = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE is_deleted=false AND key = ANY($1)`,
    [['centre_name', 'centre_phone', 'centre_address', 'n8n_enabled', 'n8n_webhook_base', 'public_base_url', 'n8n_send_bill_on_complete']])).rows;
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cache = {
    enabled: String(s.n8n_enabled ?? 'false').toLowerCase() === 'true',
    base: String(process.env.N8N_WEBHOOK_BASE || s.n8n_webhook_base || '').replace(/\/+$/, ''),
    secret: process.env.N8N_WEBHOOK_SECRET || '',
    publicBase: String(process.env.PUBLIC_BASE_URL || s.public_base_url || '').replace(/\/+$/, ''),
    billOnComplete: String(s.n8n_send_bill_on_complete ?? 'false').toLowerCase() === 'true',
    centre: { name: s.centre_name || 'Medical Centre', phone: s.centre_phone || '', address: s.centre_address || '' },
  };
  cacheAt = Date.now();
  return cache;
}
const resetCache = () => { cache = null; };

/** Qatar numbers: 8 digits get +974; leading 00 / + removed. Returns digits only, or null. */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2);
  if (/^\d{8}$/.test(d)) d = `974${d}`;
  return /^\d{9,15}$/.test(d) ? d : null;
}

/* ---- signed public links ---- */
function signFile(kind, id, ttlSec = 7 * 86400) {
  const body = Buffer.from(JSON.stringify({ k: kind, i: Number(id), e: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
  const sig = crypto.createHmac('sha256', FILE_SECRET()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyFile(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', FILE_SECRET()).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.e > Date.now() / 1000 ? { kind: p.k, id: p.i } : null; } catch { return null; }
}
const fileUrl = (cfg, kind, id) => `${cfg.publicBase}/api/public/f/${signFile(kind, id)}.pdf`;

/* ---- event builders ---- */
async function patientRow(client, id) {
  return (await client.query(`SELECT id, mrn, full_name, phone, language, whatsapp_ok FROM "mpi"."patients" WHERE id=$1 AND is_deleted=false`, [id])).rows[0];
}

async function build(client, type, ref) {
  const cfg = await settings();
  const base = { event: type, sent_at: new Date().toISOString(), centre: cfg.centre, documents: [] };
  const patientBlock = (p) => ({ id: p.id, mrn: p.mrn, name: p.full_name, phone: normalizePhone(p.phone), language: p.language || 'English' });
  if (type === 'patient.registered') {
    const p = await patientRow(client, ref.patient_id); if (!p) return null;
    return { ...base, event_id: `patient.registered:${p.id}`, patient: patientBlock(p), _optin: p.whatsapp_ok };
  }
  if (type === 'result.ready') {
    if (ref.lab_order_id) {
      const o = (await client.query(`SELECT o.id, o.order_no, o.status, o.visit_id, o.patient_id FROM "lab"."lab_orders" o WHERE o.id=$1 AND o.is_deleted=false`, [ref.lab_order_id])).rows[0];
      if (!o) return null;
      if (o.status !== 'Validated') { const e = new Error('Results are not validated yet'); e.code = 'NOT_READY'; throw e; }
      const p = await patientRow(client, o.patient_id);
      const names = (await client.query(`SELECT t.name FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id WHERE i.order_id=$1 AND i.is_deleted=false AND i.status='Validated' ORDER BY i.id`, [o.id])).rows.map((r) => r.name);
      return { ...base, event_id: `result.ready:lab:${o.id}`, patient: patientBlock(p), _optin: p.whatsapp_ok, result: { kind: 'Laboratory', ref: o.order_no, items: names },
        documents: [{ type: 'lab_report', title: `Lab report ${o.order_no}`, filename: `Lab-report-${o.order_no}.pdf`, url: fileUrl(cfg, 'lab', o.id) }] };
    }
    if (ref.imaging_order_id) {
      const o = (await client.query(`SELECT o.id, o.order_no, o.status, o.patient_id, s.name AS study FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id WHERE o.id=$1 AND o.is_deleted=false`, [ref.imaging_order_id])).rows[0];
      if (!o) return null;
      if (o.status !== 'Reported') { const e = new Error('The report is not final yet'); e.code = 'NOT_READY'; throw e; }
      const p = await patientRow(client, o.patient_id);
      return { ...base, event_id: `result.ready:img:${o.id}`, patient: patientBlock(p), _optin: p.whatsapp_ok, result: { kind: 'Radiology', ref: o.order_no, items: [o.study] },
        documents: [{ type: 'imaging_report', title: `Radiology report ${o.order_no}`, filename: `Radiology-report-${o.order_no}.pdf`, url: fileUrl(cfg, 'img', o.id) }] };
    }
    return null;
  }
  if (type === 'bill.send' || type === 'visit.completed') {
    const v = (await client.query(`SELECT v.id, v.visit_no, v.visit_date, v.visit_type, v.patient_id, d.full_name AS doctor FROM "scheduling"."visits" v LEFT JOIN "auth"."users" d ON d.id=v.doctor_id WHERE v.id=$1 AND v.is_deleted=false`, [ref.visit_id])).rows[0];
    if (!v) return null;
    const p = await patientRow(client, v.patient_id);
    const inv = (await client.query(`SELECT id, invoice_no, net, patient_share, paid, balance, status FROM "billing"."invoices" WHERE visit_id=$1 AND status <> 'Cancelled' AND is_deleted=false ORDER BY id DESC LIMIT 1`, [v.id])).rows[0];
    if (type === 'bill.send' && !inv) { const e = new Error('This visit has no invoice yet'); e.code = 'NOT_READY'; throw e; }
    const out = { ...base, event_id: `${type}:${type === 'bill.send' ? (inv && inv.id) : v.id}`, patient: patientBlock(p), _optin: p.whatsapp_ok,
      visit: { id: v.id, no: v.visit_no, date: v.visit_date, type: v.visit_type, doctor: v.doctor || null } };
    if (inv) out.invoice = { id: inv.id, no: inv.invoice_no, total: Number(inv.net), patient_share: Number(inv.patient_share), paid: Number(inv.paid), balance: Number(inv.balance), status: inv.status };
    if (inv && (type === 'bill.send' || cfg.billOnComplete)) out.documents.push({ type: 'invoice', title: `Invoice ${inv.invoice_no}`, filename: `Invoice-${inv.invoice_no}.pdf`, url: fileUrl(cfg, 'inv', inv.id) });
    return out;
  }
  return null;
}

/* ---- delivery ---- */
async function log(client, status, reference, message) {
  try { await (client || db).query(`INSERT INTO "admin"."integration_logs"("integration","direction","reference","status","message") VALUES ('WhatsApp (n8n)','Outbound',$1,$2,$3)`, [reference, status, String(message || '').slice(0, 1000)]); } catch { /* logging must never break a request */ }
}

/** Sends one event to n8n and waits for n8n's answer. Returns { ok, status, detail }. */
async function deliver(payload) {
  const cfg = await settings();
  if (!cfg.base) return { ok: false, status: 'not-configured', detail: 'n8n webhook URL is not set (setting n8n_webhook_base)' };
  if (!cfg.secret) return { ok: false, status: 'not-configured', detail: 'N8N_WEBHOOK_SECRET is not set on the server' };
  if (!cfg.publicBase && payload.documents.length) return { ok: false, status: 'not-configured', detail: 'public_base_url is not set (needed for PDF links)' };
  if (!payload.patient.phone) return { ok: false, status: 'no-phone', detail: 'Patient has no valid mobile number' };
  const url = `${cfg.base}/${PATHS[payload.event]}`;
  const { _optin, ...body } = payload;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hms-secret': cfg.secret }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(t);
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* not json */ }
    const ok = r.ok && (!j || j.ok !== false);
    return { ok, status: ok ? 'sent' : 'failed', detail: j && (j.error || j.detail) ? String(j.error || j.detail) : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, status: 'failed', detail: e.name === 'AbortError' ? 'n8n did not answer in time' : e.message };
  }
}

/** Manual send (button): reports back to the user. */
async function sendNow(type, ref) {
  const cfg = await settings();
  if (!cfg.enabled) return { ok: false, status: 'disabled', detail: 'WhatsApp messaging is switched off (setting n8n_enabled)' };
  const payload = await build(db, type, ref);
  if (!payload) return { ok: false, status: 'not-found', detail: 'Nothing to send' };
  if (payload._optin === false) { await log(null, 'skipped', payload.event_id, 'Patient opted out of WhatsApp'); return { ok: false, status: 'opted-out', detail: 'This patient opted out of WhatsApp messages' }; }
  const r = await deliver(payload);
  await log(null, r.status, payload.event_id, `${payload.patient.name} · ${r.detail}`);
  return r;
}

/** Automatic send after a business event: runs in the background, once per event id. Never throws. */
function auto(type, ref, delayMs = 1200) {
  setTimeout(async () => {
    try {
      const cfg = await settings();
      if (!cfg.enabled) return;
      const payload = await build(db, type, ref);
      if (!payload) return;
      if (payload._optin === false) { await log(null, 'skipped', payload.event_id, 'Patient opted out of WhatsApp'); return; }
      const dup = (await db.query(`SELECT 1 FROM "admin"."integration_logs" WHERE integration='WhatsApp (n8n)' AND reference=$1 AND status='sent' LIMIT 1`, [payload.event_id])).rows.length;
      if (dup) return;
      const r = await deliver(payload);
      await log(null, r.status, payload.event_id, `${payload.patient.name} · ${r.detail}`);
    } catch (e) { if (e.code !== 'NOT_READY') console.error('[notify]', e.message); }
  }, delayMs).unref();
}

module.exports = { settings, resetCache, normalizePhone, signFile, verifyFile, build, deliver, sendNow, auto, PATHS };
