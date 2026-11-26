'use strict';
/** WHO Child Growth Standards (0-60 months): z-score, percentile and reference curves from the official LMS tables. */
const T = require('./catalog/who_growth.json');

const IND = {
  wfa: { label: 'Weight-for-age', unit: 'kg', adjust: true },
  lhfa: { label: 'Length / height-for-age', unit: 'cm', adjust: false },
  hcfa: { label: 'Head circumference-for-age', unit: 'cm', adjust: false },
  bmifa: { label: 'BMI-for-age', unit: 'kg/m²', adjust: true },
};
const sexKey = (g) => (String(g).toLowerCase().startsWith('f') ? 'girls' : 'boys');

function lms(ind, sex, month) {
  const rows = T[`${ind}_${sex}`];
  if (!rows || month < 0 || month > 60) return null;
  const i = Math.min(Math.floor(month), 59);
  const a = rows[i], b = rows[i + 1], f = month - a[0];
  return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f };
}
const valueAtZ = ({ L, M, S }, z) => (L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L));

function zscore(ind, sex, month, x) {
  const p = lms(ind, sex, month);
  if (!p || !(x > 0)) return null;
  let z = p.L === 0 ? Math.log(x / p.M) / p.S : (Math.pow(x / p.M, p.L) - 1) / (p.L * p.S);
  if (IND[ind].adjust && Math.abs(z) > 3) { // WHO adjustment for extreme values
    const s2 = valueAtZ(p, z > 0 ? 2 : -2), s3 = valueAtZ(p, z > 0 ? 3 : -3);
    z = z > 0 ? 3 + (x - s3) / (s3 - s2) : -3 + (x - s3) / (s2 - s3);
  }
  return z;
}
// standard normal CDF (Abramowitz-Stegun 7.1.26)
function percentile(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return (z > 0 ? 1 - p : p) * 100;
}
const r1 = (v) => Math.round(v * 10) / 10;

/** Reference curves at z = -3,-2,0,2,3, monthly from 0 to 60 */
function curves(ind, sex) {
  const out = {};
  for (const z of [-3, -2, 0, 2, 3]) out[z] = (T[`${ind}_${sex}`] || []).map((r) => [r[0], r1(valueAtZ({ L: r[1], M: r[2], S: r[3] }, z) * 100) / 100]);
  return out;
}

const FLAGS = {
  wfa: [[-3, 'Severely underweight (z < -3)', 'red'], [-2, 'Underweight (z < -2)', 'amber'], [Infinity, null], [2, 'High weight-for-age (z > +2): check weight-for-length / BMI', 'amber']],
  lhfa: [[-3, 'Severe stunting (z < -3)', 'red'], [-2, 'Stunted (z < -2)', 'amber'], [Infinity, null], [3, 'Very tall (z > +3): consider endocrine causes', 'amber']],
  hcfa: [[-3, 'Severe microcephaly (z < -3)', 'red'], [-2, 'Small head (z < -2): review', 'amber'], [Infinity, null], [2, 'Large head (z > +2): review', 'amber']],
  bmifa: [[-3, 'Severe wasting (z < -3)', 'red'], [-2, 'Wasting (z < -2)', 'amber'], [Infinity, null], [2, 'Overweight (z > +2)', 'amber'], [3, 'Obesity (z > +3)', 'red']],
};
function flag(ind, z) {
  if (z === null || z === undefined) return null;
  const f = FLAGS[ind];
  if (z < -3) return { text: f[0][1], level: f[0][2] };
  if (z < -2) return { text: f[1][1], level: f[1][2] };
  let hit = null;
  for (const [lim, text, level] of f.slice(3)) if (z > lim) hit = { text, level };
  return hit;
}

module.exports = { IND, sexKey, lms, valueAtZ, zscore, percentile, curves, flag, r1 };
