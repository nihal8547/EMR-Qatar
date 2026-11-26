'use strict';
/** Plain, printable PDFs for WhatsApp (invoice, lab report, radiology report). */
const PDFDocument = require('pdfkit');
const db = require('./db');

const money = (n) => Number(n || 0).toFixed(2);
const d10 = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

async function centre() {
  const s = (await db.query(`SELECT key, value FROM "admin"."settings" WHERE key IN ('centre_name','centre_address','centre_phone') AND is_deleted=false`)).rows;
  return Object.fromEntries(s.map((r) => [r.key, r.value]));
}
function start(title, sub, c, p) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: title } });
  doc.font('Helvetica-Bold').fontSize(16).text(c.centre_name || 'Medical Centre', { continued: false });
  doc.font('Helvetica').fontSize(9).fillColor('#555').text(`${c.centre_address || ''}  ${c.centre_phone || ''}`);
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(13).text(title, 40, 40, { align: 'right' });
  doc.font('Helvetica').fontSize(9).text(sub || '', { align: 'right' });
  doc.moveTo(40, 88).lineTo(555, 88).strokeColor('#999').stroke();
  doc.y = 98; doc.x = 40;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(p.full_name);
  doc.font('Helvetica').fontSize(9).text(`${p.mrn || ''}   QID ${p.qid || '-'}   ${p.gender || ''}   DOB ${d10(p.dob)}`);
  doc.moveDown(0.8);
  return doc;
}
function row(doc, cols, widths, opts = {}) {
  const y = doc.y; let x = 40;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
  const h = Math.max(...cols.map((t, i) => doc.heightOfString(String(t ?? ''), { width: widths[i] - 4 })));
  if (y + h > 780) { doc.addPage(); doc.y = 40; }
  const yy = doc.y;
  cols.forEach((t, i) => { doc.text(String(t ?? ''), x, yy, { width: widths[i] - 4, align: opts.right && opts.right.includes(i) ? 'right' : 'left' }); x += widths[i]; });
  doc.y = yy + h + 3; doc.x = 40;
  if (opts.line) { doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ddd').stroke(); doc.y += 3; }
}
const toBuffer = (doc) => new Promise((resolve) => { const b = []; doc.on('data', (c) => b.push(c)); doc.on('end', () => resolve(Buffer.concat(b))); doc.end(); });

async function invoicePdf(id) {
  const inv = (await db.query(
    `SELECT i.*, p.mrn, p.full_name, p.qid, p.gender, p.dob, v.visit_no, py.name AS payer FROM "billing"."invoices" i JOIN "mpi"."patients" p ON p.id=i.patient_id
       LEFT JOIN "scheduling"."visits" v ON v.id=i.visit_id LEFT JOIN "insurance"."payers" py ON py.id=i.payer_id WHERE i.id=$1 AND i.is_deleted=false`, [id])).rows[0];
  if (!inv) return null;
  const lines = (await db.query(`SELECT description, qty, unit_price, amount FROM "billing"."charges" WHERE invoice_id=$1 AND is_deleted=false AND status <> 'Cancelled' ORDER BY id`, [id])).rows;
  const pays = (await db.query(`SELECT receipt_no, kind, amount, method, paid_at FROM "billing"."payments" WHERE invoice_id=$1 AND is_deleted=false ORDER BY id`, [id])).rows;
  const doc = start('INVOICE', `${inv.invoice_no}  ·  ${inv.visit_no || ''}  ·  ${d10(inv.invoice_date)}`, await centre(), inv);
  if (inv.payer) doc.font('Helvetica').fontSize(9).text(`Payer: ${inv.payer}`).moveDown(0.4);
  const W = [250, 50, 90, 90];
  row(doc, ['Description', 'Qty', 'Unit price', 'Amount'], W, { bold: true, line: true, right: [1, 2, 3] });
  lines.forEach((l) => row(doc, [l.description, l.qty, money(l.unit_price), money(l.amount)], W, { right: [1, 2, 3], line: true }));
  doc.moveDown(0.6);
  const kv = (k, v, bold) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(`${k}   QAR ${money(v)}`, { align: 'right' }); };
  kv('Gross', inv.gross); if (Number(inv.discount)) kv('Discount', -inv.discount); kv('Net', inv.net);
  if (Number(inv.payer_share)) kv('Covered by payer', inv.payer_share);
  kv('Patient share', inv.patient_share, true); kv('Paid', inv.paid); kv('Balance', inv.balance, true);
  if (pays.length) { doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).text('Payments'); pays.forEach((p) => row(doc, [p.receipt_no, p.kind, p.method, d10(p.paid_at), money(p.amount)], [90, 70, 100, 90, 80], { right: [4] })); }
  doc.moveDown(1).font('Helvetica').fontSize(8).fillColor('#666').text('This is a computer generated document.');
  return toBuffer(doc);
}

async function labPdf(id) {
  const o = (await db.query(`SELECT o.id, o.order_no, o.ordered_at, p.mrn, p.full_name, p.qid, p.gender, p.dob, d.full_name AS doctor FROM "lab"."lab_orders" o JOIN "mpi"."patients" p ON p.id=o.patient_id LEFT JOIN "auth"."users" d ON d.id=o.doctor_id WHERE o.id=$1 AND o.is_deleted=false`, [id])).rows[0];
  if (!o) return null;
  const items = (await db.query(
    `SELECT t.name AS test, t.unit, t.ref_low, t.ref_high, i.result_value, i.result_text, i.flag, i.validated_at FROM "lab"."lab_order_items" i JOIN "lab"."lab_tests" t ON t.id=i.test_id
      WHERE i.order_id=$1 AND i.status='Validated' AND i.is_deleted=false ORDER BY i.id`, [id])).rows;
  const doc = start('LABORATORY REPORT', `${o.order_no}  ·  ${d10(o.ordered_at)}`, await centre(), o);
  if (o.doctor) doc.font('Helvetica').fontSize(9).text(`Requested by: ${o.doctor}`).moveDown(0.4);
  const W = [190, 80, 55, 120, 70];
  row(doc, ['Test', 'Result', 'Unit', 'Reference range', 'Flag'], W, { bold: true, line: true });
  items.forEach((i) => row(doc, [i.test, i.result_value != null ? i.result_value : (i.result_text || ''), i.result_value != null ? (i.unit || '') : '', i.ref_low != null || i.ref_high != null ? `${i.ref_low ?? ''} - ${i.ref_high ?? ''}` : '', i.flag && i.flag !== 'Normal' ? i.flag : ''], W, { line: true }));
  doc.moveDown(1).font('Helvetica').fontSize(8).fillColor('#666').text('Only validated results are shown. Interpret results together with clinical findings.');
  return toBuffer(doc);
}

async function imagingPdf(id) {
  const o = (await db.query(`SELECT o.id, o.order_no, o.ordered_at, o.clinical_info, s.name AS study, p.mrn, p.full_name, p.qid, p.gender, p.dob FROM "radiology"."imaging_orders" o JOIN "billing"."services" s ON s.id=o.service_id JOIN "mpi"."patients" p ON p.id=o.patient_id WHERE o.id=$1 AND o.is_deleted=false`, [id])).rows[0];
  if (!o) return null;
  const r = (await db.query(`SELECT r.findings, r.impression, r.reported_at, u.full_name AS by FROM "radiology"."imaging_reports" r LEFT JOIN "auth"."users" u ON u.id=r.reported_by WHERE r.order_id=$1 AND r.status='Final' AND r.is_deleted=false ORDER BY r.id DESC LIMIT 1`, [id])).rows[0];
  if (!r) return null;
  const doc = start('RADIOLOGY REPORT', `${o.order_no}  ·  ${d10(o.ordered_at)}`, await centre(), o);
  doc.font('Helvetica-Bold').fontSize(11).text(o.study).moveDown(0.3);
  if (o.clinical_info) doc.font('Helvetica').fontSize(9).text(`Clinical information: ${o.clinical_info}`).moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(10).text('Findings').font('Helvetica').fontSize(10).text(r.findings || '').moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10).text('Impression').font('Helvetica-Bold').text(r.impression || '').moveDown(1);
  doc.font('Helvetica').fontSize(8).fillColor('#666').text(`Reported by ${r.by || '-'} · ${d10(r.reported_at)} · Final`);
  return toBuffer(doc);
}

module.exports = { invoicePdf, labPdf, imagingPdf };
