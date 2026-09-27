// Number formatting like Java's String.format("%.1f") in the default locale.

import { SCALE } from './state.js';

function localeDecimalSeparator() {
  const env = process.env.PAIRFORGE_DECIMAL;
  if (env) return env;
  try {
    const parts = new Intl.NumberFormat(undefined).formatToParts(1.5);
    const d = parts.find((x) => x.type === 'decimal');
    return d ? d.value : '.';
  } catch {
    return '.';
  }
}

let SEP = null;
export function decimalSeparator() {
  if (SEP === null) SEP = localeDecimalSeparator();
  return SEP;
}
export function setDecimalSeparator(sep) { SEP = sep; }

// value given in score units; one decimal, rounding half up
export function formatScore(units) {
  const neg = units < 0;
  const tenths = Math.floor((Math.abs(units) * 10) / SCALE + 0.5 + 1e-9);
  const s = `${Math.floor(tenths / 10)}${decimalSeparator()}${tenths % 10}`;
  return neg && tenths !== 0 ? `-${s}` : s;
}

// A plain number (e.g. a scoring value) with one decimal.
export function formatNumber(x) {
  return formatScore(Math.round(x * SCALE));
}
