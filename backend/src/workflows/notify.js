'use strict';
const express = require('express');
const db = require('../db');
const { wrap, bad, need, notFound, audit } = require('../lib');
const notify = require('../notify');
const router = express.Router();

/** Manual "Send on WhatsApp": type = welcome | result | bill | thanks. */
router.post('/notify/send', need('notify.send'), wrap(async (req, res) => {
  const t = String(req.body?.type || '');
  const n = (k) => { const v = Number(req.body?.[k]); return Number.isInteger(v) && v > 0 ? v : null; };
  let r;
  try {
    if (t === 'welcome') { if (!n('patient_id')) throw bad('patient_id is required'); r = await notify.sendNow('patient.registered', { patient_id: n('patient_id') }); }
    else if (t === 'result') { if (!n('lab_order_id') && !n('imaging_order_id')) throw bad('lab_order_id or imaging_order_id is required'); r = await notify.sendNow('result.ready', { lab_order_id: n('lab_order_id'), imaging_order_id: n('imaging_order_id') }); }
    else if (t === 'bill') { if (!n('visit_id')) throw bad('visit_id is required'); r = await notify.sendNow('bill.send', { visit_id: n('visit_id') }); }
    else if (t === 'thanks') { if (!n('visit_id')) throw bad('visit_id is required'); r = await notify.sendNow('visit.completed', { visit_id: n('visit_id') }); }
    else throw bad('Unknown message type');
  } catch (e) { if (e.code === 'NOT_READY') throw bad(e.message); throw e; }
  await audit(null, req.user, 'WHATSAPP_SEND', 'notify', null, { type: t, ok: r.ok, status: r.status }, req.ip);
  res.status(r.ok ? 200 : r.status === 'not-found' ? 404 : (r.status === 'opted-out' || r.status === 'no-phone' ? 409 : 502)).json(r);
}));

/** Setup check + recent deliveries (for the admin). */
router.get('/notify/status', need('notify.send'), wrap(async (req, res) => {
  const cfg = await notify.settings();
  const recent = (await db.query(`SELECT id, reference, status, message, created_at FROM "admin"."integration_logs" WHERE integration='WhatsApp (n8n)' ORDER BY id DESC LIMIT 15`)).rows;
  res.json({ enabled: cfg.enabled, webhook_base: !!cfg.base, secret: !!cfg.secret, public_base_url: cfg.publicBase || null, bill_on_complete: cfg.billOnComplete, recent });
}));

module.exports = router;
