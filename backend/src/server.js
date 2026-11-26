'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const db = require('./db');
const reg = require('./registry');
const hooks = require('./hooks');
const auth = require('./auth');
const crud = require('./crud');
const { wrap, HttpError, can } = require('./lib');

hooks.validate(reg);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression({ threshold: 1024 }));
// request timing: log slow API calls so loading problems are visible in the server log
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => { const ms = Date.now() - t0; if (req.path.startsWith('/api') && (ms > 1500 || res.statusCode >= 500)) console.warn(`[api] ${req.method} ${req.originalUrl.split('?')[0]} -> ${res.statusCode} in ${ms}ms`); });
  next();
});
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': req.path.startsWith('/api') ? 'no-store' : 'no-cache' });
  next();
});
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', wrap(async (req, res) => {
  const t0 = Date.now();
  await db.query('SELECT 1');
  res.json({ ok: true, time: new Date().toISOString(), db_ms: Date.now() - t0, uptime_s: Math.round(process.uptime()) });
}));

app.use('/api/auth', auth.router);
// Signed, expiring PDF links used by the WhatsApp (n8n) integration. No login: the signature is the credential.
app.get('/api/public/f/:token', wrap(async (req, res) => {
  const t = require('./notify').verifyFile(String(req.params.token).replace(/\.pdf$/, ''));
  if (!t) return res.status(403).json({ error: 'This link is invalid or has expired' });
  const pdfs = require('./pdfs');
  const buf = t.kind === 'inv' ? await pdfs.invoicePdf(t.id) : t.kind === 'lab' ? await pdfs.labPdf(t.id) : t.kind === 'img' ? await pdfs.imagingPdf(t.id) : null;
  if (!buf) return res.status(404).json({ error: 'Document not available' });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${t.kind}-${t.id}.pdf"`, 'Cache-Control': 'private, max-age=300' }).send(buf);
}));

// everything below needs a logged-in user
app.use('/api', auth.authenticate);

/** Resource metadata for the UI, limited to what this user may view. */
app.get('/api/meta', (req, res) => {
  const out = {};
  for (const key of reg.order) {
    if (!can(req, `${key}.view`)) continue;
    const r = reg.publicResource(reg.resources[key]);
    const mine = (p) => can(req, p);
    r.can = {
      create: !r.noCreate && mine(`${key}.create`),
      edit: !r.noEdit && mine(`${key}.edit`),
      delete: !r.noDelete && mine(`${key}.delete`),
    };
    r.actions = r.actions.filter((a) => mine(a.perm));
    out[key] = r;
  }
  res.json(out);
});

app.use('/api', require('./workflows/portal'));
app.use('/api', require('./workflows/dental'));
app.use('/api', require('./workflows/pricing'));
app.use('/api', require('./workflows/admin'));
app.use('/api', require('./workflows/reports'));
app.use('/api', require('./workflows/clinical'));
app.use('/api', require('./workflows/diagnostics'));
app.use('/api', require('./workflows/pharmacy'));
app.use('/api', require('./workflows/billing'));
app.use('/api', require('./workflows/walkin'));
app.use('/api', require('./workflows/visitmanage'));
app.use('/api', require('./workflows/notify'));
app.use('/api', crud.router); // generic CRUD last: it blocks portal users

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built Nuxt app (nuxt generate) so one process runs everything.
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', '..', 'frontend', '.output', 'public');
if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  app.use('/_nuxt', express.static(path.join(STATIC_DIR, '_nuxt'), { index: false, maxAge: '365d', immutable: true }));   // hashed build files never change
  app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(STATIC_DIR, '200.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra ? { extra: err.extra } : {}) });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  if (err && (err.code === '57014')) return res.status(503).json({ error: 'The request took too long. Please narrow the search and try again.' });
  if (err && (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '53300', '08006', '08001'].includes(err.code) || /timeout exceeded when trying to connect|Connection terminated/i.test(err.message || ''))) {
    console.error('[db] unavailable:', err.message);
    return res.status(503).json({ error: 'The database is busy or unavailable. Please try again in a moment.' });
  }
  if (err && ['22P02','22003','22007','22008','22001','23502','23503','23505','23514'].includes(err.code)) return res.status(400).json({ error: 'Invalid value in request' });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = Number(process.env.PORT || 4000);
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Qatar HMS API listening on http://localhost:${PORT}`));
  server.keepAliveTimeout = 65000; server.headersTimeout = 66000; server.requestTimeout = 60000;
  process.on('unhandledRejection', (e) => console.error('[process] unhandledRejection:', e));
  process.on('uncaughtException', (e) => console.error('[process] uncaughtException:', e));
  const stop = (sig) => { console.log(`${sig}: shutting down`); server.close(() => db.pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(0), 10000).unref(); };
  process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
}
module.exports = app;
