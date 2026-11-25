'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const reg = require('./registry');
const hooks = require('./hooks');
const auth = require('./auth');
const crud = require('./crud');
const { wrap, HttpError, can } = require('./lib');

hooks.validate(reg);

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': req.path.startsWith('/api') ? 'no-store' : 'no-cache' });
  next();
});
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', wrap(async (req, res) => {
  await db.query('SELECT 1');
  res.json({ ok: true, time: new Date().toISOString() });
}));

app.use('/api/auth', auth.router);

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
app.use('/api', require('./workflows/admin'));
app.use('/api', require('./workflows/reports'));
app.use('/api', require('./workflows/clinical'));
app.use('/api', require('./workflows/diagnostics'));
app.use('/api', require('./workflows/pharmacy'));
app.use('/api', require('./workflows/billing'));
app.use('/api', crud.router); // generic CRUD last: it blocks portal users

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built Nuxt app (nuxt generate) so one process runs everything.
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', '..', 'frontend', '.output', 'public');
if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(STATIC_DIR, '200.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra ? { extra: err.extra } : {}) });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err && ['22P02','22003','22007','22008','22001','23502','23503','23505','23514'].includes(err.code)) return res.status(400).json({ error: 'Invalid value in request' });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = Number(process.env.PORT || 4000);
if (require.main === module) {
  app.listen(PORT, () => console.log(`Qatar HMS API listening on http://localhost:${PORT}`));
}
module.exports = app;
