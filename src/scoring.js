// Scoring point system: explicit (XXS) or inferred from the Points field.

import { JaVaFoError } from './errors.js';

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
    else throw new JaVaFoError(`Unknown scoring code '${code}'`);
  }
  return new ScoringSystem(v);
}

// Least-squares solution closest to the default values:
// v = v0 + A+ (p - A v0), restricted to the categories that actually occur.
function inferValues(rows, points) {
  const v0 = DEFAULT_VALUES.slice();
  const used = CODES.map((_, j) => rows.some((r) => r[j] > 0));
  const cols = used.map((u, j) => (u ? j : -1)).filter((j) => j >= 0);
  const resid = rows.map((r, i) => points[i] - r.reduce((s, c, j) => s + c * v0[j], 0));
  if (resid.every((x) => Math.abs(x) < 1e-6)) return v0;
  const k = cols.length;
  // Normal equations (A^T A) d = A^T r, solved by Gauss-Jordan with a minimum-norm
  // treatment of dependent columns (they get a zero correction).
  const M = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < rows.length; i++) {
    for (let a = 0; a < k; a++) {
      const ca = rows[i][cols[a]];
      if (!ca) continue;
      for (let b = 0; b < k; b++) M[a][b] += ca * rows[i][cols[b]];
      M[a][k] += ca * resid[i];
    }
  }
  const pivotOf = new Array(k).fill(-1);
  let r = 0;
  for (let c = 0; c < k && r < k; c++) {
    let best = r;
    for (let i = r + 1; i < k; i++) if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    if (Math.abs(M[best][c]) < 1e-9) continue;
    [M[r], M[best]] = [M[best], M[r]];
    const pv = M[r][c];
    for (let j = c; j <= k; j++) M[r][j] /= pv;
    for (let i = 0; i < k; i++) {
      if (i === r || M[i][c] === 0) continue;
      const f = M[i][c];
      for (let j = c; j <= k; j++) M[i][j] -= f * M[r][j];
    }
    pivotOf[c] = r++;
  }
  const v = v0.slice();
  for (let c = 0; c < k; c++) {
    if (pivotOf[c] >= 0) v[cols[c]] = v0[cols[c]] + M[pivotOf[c]][k];
  }
  return v.map((x) => Math.round(x * 1e6) / 1e6);
}

export function buildScoring(data) {
  if (data.scoring.length) {
    const sys = explicitScoring(data.scoring);
    for (const p of data.players) {
      const total = p.games.reduce((s, g) => s + sys.points(g), 0);
      if (!near(total, p.points)) {
        throw new JaVaFoError('Assertion Error', `Points of player ${p.id} do not match the XXS scoring system`);
      }
    }
    return sys;
  }
  const rows = data.players.map(countsOf);
  return new ScoringSystem(inferValues(rows, data.players.map((p) => p.points)));
}
