// Check-list (-l): the situation of every paired player after the pairing.

import { ABS, STRONG, MILD, SCALE } from './state.js';
import { VERSION } from './version.js';
import { formatScore } from './format.js';

const DOWN = '▼';
const UP = '▲';

function prefLabel(p) {
  if (!p.pref) return 'A';
  const c = p.pref;
  if (p.strength === ABS) {
    const big = p.cd > 1 || p.cd < -1;
    if (big && p.twice) return c + c + c;
    if (big) return c + c;
    return p.cd === 0 ? c : c + '1';
  }
  if (p.strength === STRONG) return `(${c})`;
  if (p.strength === MILD) return `(${c.toLowerCase()})`;
  return 'A';
}

const floatLabel = (f) => (f === 'D' ? DOWN : f === 'U' ? UP : ' ');
const lpad = (s, n) => String(s).padStart(n, ' ');

// result: { round, pairs: [[white, black]], bye, players } from Tournament.pair
export function checklist(result, eol = '\r\n') {
  const { round, pairs, bye, players } = result;
  const listed = players.filter((p) => p.present);
  const idW = Math.max(2, ...players.map((p) => String(p.id).length));
  // wide enough for the maximum possible score
  const maxScore = (round - 1) * Math.round((result.maxPerRound ?? 1) * SCALE);
  const ptsW = Math.max(formatScore(maxScore).length, ...players.map((p) => formatScore(p.score).length));
  const hist = round - 1;
  const histW = Math.max(1, hist);
  const gW = (k) => Math.max(`G-${k}`.length, idW);
  const cur = new Map();
  for (const [w, b] of pairs) {
    cur.set(w.id, `(${b.id}W)`);
    cur.set(b.id, `(${w.id}B)`);
  }
  if (bye) cur.set(bye.id, '(pab)');

  let head = `${lpad('ID', idW)}\t${lpad('Pts', ptsW)}\t ${'-'.repeat(histW)}\tPref\t-1R\t-2R\t${lpad('Cur', idW + 3)}\t`;
  for (let k = hist; k >= 1; k--) head += `${lpad(`G-${k}`, gW(k))}\t`;

  const sorted = listed.slice().sort((a, b) => (b.score - a.score) || (a.pn - b.pn));
  const groups = [];
  for (const p of sorted) {
    if (!groups.length || groups[groups.length - 1][0].score !== p.score) groups.push([]);
    groups[groups.length - 1].push(p);
  }
  const row = (p) => {
    let s = `${lpad(p.id, idW)}\t${lpad(formatScore(p.score), ptsW)}\t ${lpad(p.colors, histW)}\t`;
    s += `${lpad(prefLabel(p), 4)}\t ${floatLabel(p.float1)} \t ${floatLabel(p.float2)} \t`;
    s += `${lpad(cur.get(p.id) || '', idW + 3)}\t`;
    const opps = [];
    for (const g of p.rec.games.slice(0, round - 1)) if (g.played) opps.push(g.opp);
    const last = opps.slice(-hist);
    const cols = new Array(hist - last.length).fill('').concat(last.map(String));
    if (!p.canGetBye && hist > 0) cols[0] = '[X]';
    cols.forEach((c, i) => { s += `${lpad(c, gW(hist - i))}\t`; });
    return s;
  };
  let out = '\ufeff' + head + eol + eol;
  out += groups.map((g) => g.map((p) => row(p) + eol).join('')).join(eol);
  out += eol + eol + VERSION;
  return out;
}

