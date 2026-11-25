'use strict';
/**
 * Registry DSL.
 *
 * Field spec string:  "name:type[=arg]:Label:flag,flag,flag=value"
 *   types : text textarea email phone int decimal money date time datetime bool
 *           select=A/B/C   ref=<resource key>   password   json
 *   flags : req list search ro hide uniq secret filter
 *           def=<value>  (today | now | true | false | literal)
 *           auto=PREFIX/pad
 *
 * ONE registry drives: SQL DDL, REST API, permissions, sidebar menu and the Nuxt forms/lists.
 */

const TYPES = new Set(['text', 'textarea', 'email', 'phone', 'int', 'decimal', 'money', 'date', 'time', 'datetime', 'bool', 'select', 'ref', 'password', 'json']);

function titleCase(name) {
  return name
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function parseField(spec) {
  const parts = spec.split(':');
  const name = parts[0].trim();
  const typeRaw = (parts[1] || 'text').trim() || 'text';
  const label = (parts[2] || '').trim() || titleCase(name);
  const flagRaw = (parts[3] || '').split(',').map((s) => s.trim()).filter(Boolean);

  let type = typeRaw;
  let arg = null;
  const eq = typeRaw.indexOf('=');
  if (eq >= 0) {
    type = typeRaw.slice(0, eq);
    arg = typeRaw.slice(eq + 1);
  }
  if (!TYPES.has(type)) throw new Error(`Unknown field type "${type}" in spec "${spec}"`);

  const f = { name, type, label, flags: {} };
  if (type === 'select') {
    if (!arg) throw new Error(`select needs options: ${spec}`);
    f.options = arg.split('/');
  }
  if (type === 'ref') {
    if (!arg) throw new Error(`ref needs target: ${spec}`);
    f.ref = arg;
  }
  for (const fl of flagRaw) {
    const i = fl.indexOf('=');
    if (i >= 0) f.flags[fl.slice(0, i)] = fl.slice(i + 1);
    else f.flags[fl] = true;
  }
  f.required = !!f.flags.req;
  f.list = !!f.flags.list;
  f.search = !!f.flags.search;
  f.readonly = !!f.flags.ro;
  f.hidden = !!f.flags.hide;
  f.unique = !!f.flags.uniq;
  f.secret = !!f.flags.secret;
  f.filter = !!f.flags.filter;
  f.def = f.flags.def !== undefined ? f.flags.def : null;
  if (f.flags.auto) {
    const [prefix, pad] = String(f.flags.auto).split('/');
    f.auto = { prefix, pad: parseInt(pad || '6', 10) };
    f.readonly = true;
  }
  delete f.flags;
  return f;
}

module.exports = { parseField, titleCase };
