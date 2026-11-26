'use strict';
/** Connect the centre's WhatsApp number (Evolution API instance): status, QR code, disconnect, test message, n8n options. */
const express = require('express');
const db = require('../db');
const { wrap, bad, need, audit } = require('../lib');
const notify = require('../notify');
const router = express.Router();

const KEYS = ['evolution_base_url', 'whatsapp_instance', 'evolution_api_key', 'n8n_enabled', 'n8n_webhook_base', 'public_base_url', 'n8n_send_bill_on_complete'];
const DESC = {
  evolution_base_url: 'Evolution API base URL', whatsapp_instance: 'Evolution instance name used by HMS', evolution_api_key: 'Evolution API key (admin only)',
  n8n_enabled: 'WhatsApp via n8n: true / false', n8n_webhook_base: 'n8n webhook base URL', public_base_url: 'Public URL of this HMS (PDF links)', n8n_send_bill_on_complete: 'Attach the bill to the thank-you message: true / false',
};

async function cfg() {
  const rows = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE is_deleted=false AND key = ANY($1)`, [KEYS])).rows;
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    base: String(process.env.EVOLUTION_BASE_URL || s.evolution_base_url || '').replace(/\/+$/, ''),
    instance: String(s.whatsapp_instance || 'qatar-hms').trim(),
    key: process.env.EVOLUTION_API_KEY || s.evolution_api_key || '',
    raw: s,
  };
}

async function evo(c, method, path, body) {
  if (!c.base) throw bad('Evolution API URL is not set');
  if (!c.key) throw bad('Evolution API key is not set');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`${c.base}${path}`, { method, headers: { apikey: c.key, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* not json */ }
    return { status: r.status, ok: r.ok, data: j || txt };
  } catch (e) {
    throw bad(e.name === 'AbortError' ? 'Evolution API did not answer in time' : `Cannot reach Evolution API: ${e.message}`);
  } finally { clearTimeout(t); }
}
const stateOf = (d) => String((d && (d.instance && d.instance.state)) || (d && d.state) || '').toLowerCase();

router.get('/whatsapp/config', need('whatsapp.manage'), wrap(async (req, res) => {
  const c = await cfg(); const s = c.raw; const n = await notify.settings();
  res.json({
    evolution_base_url: c.base, whatsapp_instance: c.instance, evolution_api_key_set: !!c.key, key_from_env: !!process.env.EVOLUTION_API_KEY,
    n8n_enabled: String(s.n8n_enabled || 'false') === 'true', n8n_webhook_base: s.n8n_webhook_base || '', n8n_secret_set: !!n.secret, public_base_url: s.public_base_url || '',
    n8n_send_bill_on_complete: String(s.n8n_send_bill_on_complete || 'false') === 'true',
  });
}));

router.put('/whatsapp/config', need('whatsapp.manage'), wrap(async (req, res) => {
  const b = req.body || {}; const out = {};
  const url = (k) => { if (b[k] === undefined) return; const v = String(b[k] || '').trim().replace(/\/+$/, ''); if (v && !/^https?:\/\/[^\s]+$/i.test(v)) throw bad(`${k} must be a full http(s) URL`); out[k] = v; };
  url('evolution_base_url'); url('n8n_webhook_base'); url('public_base_url');
  if (b.whatsapp_instance !== undefined) { const v = String(b.whatsapp_instance || '').trim(); if (!/^[A-Za-z0-9_-]{2,60}$/.test(v)) throw bad('Instance name: letters, numbers, - and _ only'); out.whatsapp_instance = v; }
  if (b.evolution_api_key) out.evolution_api_key = String(b.evolution_api_key).trim();
  for (const k of ['n8n_enabled', 'n8n_send_bill_on_complete']) if (b[k] !== undefined) out[k] = b[k] ? 'true' : 'false';
  for (const [k, v] of Object.entries(out)) {
    const u = await db.query(`UPDATE "admin"."settings" SET value=$2, updated_at=now() WHERE key=$1 AND is_deleted=false`, [k, v]);
    if (!u.rowCount) await db.query(`INSERT INTO "admin"."settings"(key,value,description) VALUES ($1,$2,$3)`, [k, v, DESC[k] || k]);
  }
  notify.resetCache();
  await audit(null, req.user, 'WHATSAPP_CONFIG', 'settings', null, { keys: Object.keys(out) }, req.ip);
  res.json({ ok: true, saved: Object.keys(out) });
}));

/** Connection state of the HMS instance. */
router.get('/whatsapp/status', need('whatsapp.manage'), wrap(async (req, res) => {
  const c = await cfg();
  if (!c.base || !c.key) return res.json({ configured: false, state: 'not-configured', instance: c.instance });
  let r;
  try { r = await evo(c, 'GET', `/instance/connectionState/${encodeURIComponent(c.instance)}`); } catch (e) { return res.json({ configured: true, state: 'error', instance: c.instance, detail: e.message }); }
  if (r.status === 404) return res.json({ configured: true, state: 'no-instance', instance: c.instance });
  if (!r.ok) return res.json({ configured: true, state: 'error', instance: c.instance, detail: typeof r.data === 'string' ? r.data.slice(0, 200) : (r.data && (r.data.message || r.data.error)) || `HTTP ${r.status}` });
  res.json({ configured: true, state: stateOf(r.data) || 'unknown', instance: c.instance });
}));

/** Creates the instance when missing, then returns a fresh QR code (base64 PNG) to scan from WhatsApp > Linked devices. */
router.post('/whatsapp/connect', need('whatsapp.manage'), wrap(async (req, res) => {
  const c = await cfg(); const name = encodeURIComponent(c.instance);
  let st = await evo(c, 'GET', `/instance/connectionState/${name}`);
  let qr = null;
  if (st.status === 404) {
    const cr = await evo(c, 'POST', '/instance/create', { instanceName: c.instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    if (!cr.ok) throw bad(`Could not create the instance: ${typeof cr.data === 'string' ? cr.data.slice(0, 160) : JSON.stringify(cr.data.response || cr.data.message || cr.data).slice(0, 200)}`);
    qr = cr.data && cr.data.qrcode;
    st = await evo(c, 'GET', `/instance/connectionState/${name}`);
  }
  if (stateOf(st.data) === 'open') return res.json({ state: 'open', instance: c.instance });
  if (!qr || !qr.base64) { const r = await evo(c, 'GET', `/instance/connect/${name}`); if (!r.ok) throw bad(`Evolution API refused: HTTP ${r.status}`); qr = r.data; }
  await audit(null, req.user, 'WHATSAPP_CONNECT', 'whatsapp', null, { instance: c.instance }, req.ip);
  res.json({ state: 'connecting', instance: c.instance, qr: qr && qr.base64 ? qr.base64 : null, pairing_code: (qr && qr.pairingCode) || null });
}));

router.post('/whatsapp/disconnect', need('whatsapp.manage'), wrap(async (req, res) => {
  const c = await cfg(); const r = await evo(c, 'DELETE', `/instance/logout/${encodeURIComponent(c.instance)}`);
  if (!r.ok && r.status !== 404) throw bad(`Evolution API refused: HTTP ${r.status}`);
  await audit(null, req.user, 'WHATSAPP_DISCONNECT', 'whatsapp', null, { instance: c.instance }, req.ip);
  res.json({ ok: true });
}));

/** Sends a short test text directly through Evolution (checks the link without n8n). */
router.post('/whatsapp/test', need('whatsapp.manage'), wrap(async (req, res) => {
  const number = notify.normalizePhone(req.body && req.body.phone); if (!number) throw bad('Enter a valid mobile number');
  const c = await cfg(); const n = await notify.settings();
  const r = await evo(c, 'POST', `/message/sendText/${encodeURIComponent(c.instance)}`, { number, text: `Test message from ${n.centre.name} HMS ✅` });
  if (!r.ok) throw bad(`Not sent: ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data.response || r.data.message || r.data).slice(0, 200)}`);
  res.json({ ok: true });
}));

module.exports = router;
