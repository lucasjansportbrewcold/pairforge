// Scoring point system: explicit (XXS) or inferred from the Points field.

import { PairingError } from './errors.js';

export const CODES = ['WW', 'BW', 'WD', 'BD', 'WL', 'BL', 'ZPB', 'HPB', 'FPB', 'PAB', 'FW', 'FL'];
export const IDX = Object.fromEntries(CODES.map((c, i) => [c, i]));
export const DEFAULT_VALUES = [1, 1, 0.5, 0.5, 0, 0, 0, 0.5, 1, 1, 1, 0];

const SHORTCUTS = {
  W: ['WW', 'BW', 'FW', 'FPB'],
  D: ['WD', 'BD', 'HPB'],
  L: ['WL', 'BL'],
};

// Category (index into CODES) of the points obtained in one round.
export function category(game) {
  const c = game.code;
  if (game.opp > 0) {
    const black = game.color === 'b';
    switch (c) {
      case '1': case 'W': return black ? IDX.BW : IDX.WW;
      case '=': case 'D': return black ? IDX.BD : IDX.WD;
      case '0': case 'L': return black ? IDX.BL : IDX.WL;
      case '+': return IDX.FW;
      default: return IDX.FL;
    }
  }
  switch (c) {
    case 'U': case '+': return IDX.PAB;
    case 'F': return IDX.FPB;
    case 'H': case '=': return IDX.HPB;
    default: return IDX.ZPB;
  }
}

export class ScoringSystem {
  constructor(values) {
    this.values = values.slice();
  }
  get(code) { return this.values[IDX[code]]; }
  points(game) { return this.values[category(game)]; }
  // Highest number of points obtainable in a single round.
  get maxPerRound() { return Math.max(this.values[IDX.WW], this.values[IDX.BW]); }
  get pab() { return this.values[IDX.PAB]; }
}

const near = (a, b) => Math.abs(a - b) < 1e-6;

function countsOf(player) {
  const row = new Array(CODES.length).fill(0);
  for (const g of player.games) row[category(g)]++;
  return row;
}

export function explicitScoring(entries) {
  const v = DEFAULT_VALUES.slice();
  for (const [code, value] of entries) {
    if (SHORTCUTS[code]) for (const c of SHORTCUTS[code]) v[IDX[c]] = value;
    else if (code in IDX) v[IDX[code]] = value;
    else throw new PairingError(`Unknown scoring code '${code}'`);
  }
  return new ScoringSystem(v);
}

// Scoring system inferred from the Points field, the way JaVaFo does it: the
// players are taken in file order, each one giving an equation (counts of the
// result categories = Points), solved by Gaussian elimination. The first
// equation that contradicts the ones before stops the process; the values that
// are still undetermined keep their defaults.
function inferValues(rows, points) {
  const K = CODES.length;
  const v = DEFAULT_VALUES.slice();
  const pivots = []; // [column, normalised row, rhs]
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].slice();
    let rhs = points[i];
    for (const [c, pr, prhs] of pivots) {
      const f = row[c];
      if (!f) continue;
      for (let j = 0; j < K; j++) row[j] -= f * pr[j];
      rhs -= f * prhs;
    }
    let c = -1;
    for (let j = 0; j < K; j++) if (Math.abs(row[j]) > 1e-9) { c = j; break; }
    if (c < 0) {
      if (Math.abs(rhs) > 1e-6) break; // inconsistent: stop here
      continue;
    }
    const d = row[c];
    for (let j = 0; j < K; j++) row[j] /= d;
    rhs /= d;
    for (const pv of pivots) {
      const g = pv[1][c];
      if (!g) continue;
      for (let j = 0; j < K; j++) pv[1][j] -= g * row[j];
      pv[2] -= g * rhs;
    }
    pivots.push([c, row, rhs]);
  }
  const pivotCols = new Set(pivots.map((pv) => pv[0]));
  for (const [c, row, rhs] of pivots) {
    let x = rhs;
    for (let j = 0; j < K; j++) if (j !== c && row[j] && !pivotCols.has(j)) x -= row[j] * v[j];
    v[c] = x;
  }
  return v.map((x) => Math.round(x * 1e6) / 1e6);
}

export function buildScoring(data) {
  if (data.scoring.length) {
    const sys = explicitScoring(data.scoring);
    for (const p of data.players) {
      const total = p.games.reduce((s, g) => s + sys.points(g), 0);
      if (!near(total, p.points)) {
        throw new PairingError(`Points of player ${p.id} do not match the XXS scoring system`);
      }
    }
    return sys;
  }
  const rows = data.players.map(countsOf);
  return new ScoringSystem(inferValues(rows, data.players.map((p) => p.points)));
}
