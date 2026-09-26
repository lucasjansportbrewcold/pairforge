// FIDE (Dutch) System pairing engine, rules C.04.3 as approved in 2016/2017.
//
// Every bracket is paired by searching, among all candidates, the one that best
// satisfies the quality criteria C.5-C.19 and, among the equally good ones, the
// candidate that the sequential procedure of sections B and D generates first.
// Both goals are expressed as lexicographic edge weights of a maximum weight
// matching. The quality part is identical in every stage; the generation order
// is reproduced in stages:
//   A1  which MDPs are paired, i.e. S1 after MDP-exchanges (D.3)
//   A2  their opponents: transposition of S2 (D.1)
//   B1  resident-exchange of the remainder (D.2)
//   B2  transposition of the remainder (D.1)

import { maxWeightMatching } from './blossom.js';
import { maxCardinalityMatching } from './cardinality.js';
import { whiteFor } from './colors.js';
import { ABS, STRONG, SCALE } from './state.js';
import { PairingImpossibleError } from './errors.js';

const CLS_B = 0;     // pair inside the current bracket
const CLS_NEXT = 1;  // pair of the following bracket (C.7 look-ahead)
const CLS_REST = 2;  // pair needed only for completion (PPB), or the bye dummy
const CLS_BYE = 3;   // bye of the following bracket when that one is the last

export function pairKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

export function pairRound(present, opts) {
  return new Engine(present, opts).run();
}

class Engine {
  constructor(present, opts) {
    this.opts = opts;
    const ps = present.slice().sort((a, b) => (b.score - a.score) || (a.pn - b.pn));
    ps.forEach((p, i) => { p.idx = i; });
    this.ps = ps;
    const n = ps.length;
    this.n = n;
    const compat = new Uint8Array(n * n);
    const forbidden = opts.forbidden || new Set();
    for (let i = 0; i < n; i++) {
      const a = ps[i];
      for (let j = i + 1; j < n; j++) {
        const b = ps[j];
        let ok = !a.opponents.has(b.id) && !b.opponents.has(a.id);
        if (ok && forbidden.size && forbidden.has(pairKey(a.id, b.id))) ok = false;
        if (ok && a.strength === ABS && b.strength === ABS && a.pref === b.pref &&
            !a.topscorer && !b.topscorer) ok = false;
        compat[i * n + j] = compat[j * n + i] = ok ? 1 : 0;
      }
    }
    this.compat = compat;
    this.colorCache = new Map();
  }

  ok(i, j) { return this.compat[i * this.n + j] === 1; }

  // Can the players be completely paired (at most one bye), knowing that no two
  // `floaters` may meet (they are moved down together)?
  completable(floaters, rest) {
    const list = floaters.concat(rest);
    const m = list.length;
    if (m === 0) return true;
    const odd = m % 2 === 1;
    const size = odd ? m + 1 : m;
    const adj = Array.from({ length: size }, () => []);
    const nf = floaters.length;
    for (let a = 0; a < m; a++) {
      for (let b = a + 1; b < m; b++) {
        if (b < nf) continue;
        if (this.ok(list[a], list[b])) { adj[a].push(b); adj[b].push(a); }
      }
      if (odd && this.ps[list[a]].canGetBye) { adj[a].push(m); adj[m].push(a); }
    }
    const mate = maxCardinalityMatching(size, adj);
    for (let v = 0; v < size; v++) if (mate[v] === -1) return false;
    return true;
  }

  run() {
    const ps = this.ps;
    const n = this.n;
    const all = ps.map((p) => p.idx);
    if (!this.completable([], all)) throw new PairingImpossibleError();
    const groups = [];
    for (let i = 0; i < n;) {
      let j = i;
      while (j < n && ps[j].score === ps[i].score) j++;
      groups.push(all.slice(i, j));
      i = j;
    }
    const pairs = [];
    let bye = -1;
    let mdps = [];
    for (let g = 0; g < groups.length; g++) {
      const residents = groups[g];
      if (g === groups.length - 1) {
        const res = this.pairBracket(mdps, residents, { mode: 'last' });
        pairs.push(...res.pairs);
        if (res.floaters.length) bye = res.floaters[0];
        break;
      }
      const lower = [].concat(...groups.slice(g + 1));
      const res = this.pairBracket(mdps, residents,
        { mode: 'normal', extra: groups[g + 1], nextIsLast: g + 1 === groups.length - 1 });
      if (this.completable(res.floaters, lower)) {
        pairs.push(...res.pairs);
        mdps = res.floaters;
        continue;
      }
      // A.9: this bracket is the PPB; all lower players collapse into the CLB.
      const ppb = this.pairBracket(mdps, residents, { mode: 'ppb', extra: lower });
      pairs.push(...ppb.pairs);
      const clb = this.pairBracket(ppb.floaters, lower, { mode: 'last' });
      pairs.push(...clb.pairs);
      if (clb.floaters.length) bye = clb.floaters[0];
      break;
    }
    const out = pairs.map(([i, j]) => {
      const a = ps[i];
      const b = ps[j];
      return whiteFor(a, b, this.opts.initialWhite) ? [a, b] : [b, a];
    });
    return { pairs: out, bye: bye >= 0 ? ps[bye] : null };
  }

  // Colour criteria of the pair (i, j): players not getting their preference etc.
  colorInfo(i, j) {
    const key = i < j ? i * this.n + j : j * this.n + i;
    let info = this.colorCache.get(key);
    if (info) return info;
    const a = this.ps[Math.min(i, j)];
    const b = this.ps[Math.max(i, j)];
    const aw = whiteFor(a, b, this.opts.initialWhite);
    const ca = aw ? 'W' : 'B';
    const cb = aw ? 'B' : 'W';
    let c8 = 0, c9 = 0, c10 = 0, c11 = 0;
    for (const [p, c] of [[a, ca], [b, cb]]) {
      if (p.pref && p.pref !== c) {
        c10++;
        if (p.strength >= STRONG) c11++;
      }
    }
    if (this.opts.lastRound && (a.topscorer || b.topscorer)) {
      for (const [p, c] of [[a, ca], [b, cb]]) {
        const cd = p.cd + (c === 'W' ? 1 : -1);
        if (cd > 2 || cd < -2) c8++;
        const h = p.colors;
        if (h.length >= 2 && h[h.length - 1] === c && h[h.length - 2] === c) c9++;
      }
    }
    info = { c8, c9, c10, c11 };
    this.colorCache.set(key, info);
    return info;
  }

  // Fast path. Walks the candidates in the order of sections B/D (no exchange)
  // and accepts the first one that reaches, criterion by criterion, the best
  // value any candidate could have: such a candidate is optimal and generated
  // first, i.e. exactly the one the full model would choose. Gives up (null)
  // as soon as that cannot be decided cheaply.
  perfectCandidate(mdps, residents, cfg) {
    if (cfg.mode === 'ppb' || residents.length === 0) return null;
    const ps = this.ps;
    const s0 = ps[residents[0]].score;
    for (const i of residents) if (ps[i].score !== s0) return null; // collapsed bracket
    const md = mdps.slice().sort((a, b) => a - b);
    const res = residents.slice().sort((a, b) => a - b);
    if (md.length > res.length) return null;
    const last = this.opts.lastRound;
    const clean = (i, j) => {
      if (!this.ok(i, j)) return false;
      const c = this.colorInfo(i, j);
      return c.c10 === 0 && c.c11 === 0 && (!last || (c.c8 === 0 && c.c9 === 0));
    };
    let budget = 2000 + 20 * (md.length + res.length);
    const used = new Uint8Array(this.n);
    const pairs = [];

    const leaf = (floaters) => {
      for (const f of floaters) {
        const p = ps[f];
        if (p.float1 === 'D' || p.float2 === 'D') return false;
      }
      if (cfg.mode === 'last') return floaters.length === 0 || (floaters.length === 1 && ps[floaters[0]].canGetBye);
      if (floaters.length === 0) return true;
      return this.idealNext(floaters, cfg.extra, cfg.nextIsLast);
    };

    // remainder (homogeneous): S1R = first P, transpositions of S2R in order
    const remainder = () => {
      const rem = res.filter((i) => !used[i]);
      const P = Math.floor(rem.length / 2);
      const S1 = rem.slice(0, P);
      const S2 = rem.slice(P);
      const dfs = (k) => {
        if (--budget < 0) return null;
        if (k === P) {
          const fl = S2.filter((i) => !used[i]);
          return leaf(fl) ? fl : undefined;
        }
        const x = S1[k];
        for (const y of S2) {
          if (used[y] || !clean(x, y)) continue;
          used[y] = 1;
          pairs.push([x, y]);
          const r = dfs(k + 1);
          if (r !== undefined) return r;
          pairs.pop();
          used[y] = 0;
        }
        return undefined;
      };
      return dfs(0);
    };

    // MDP-pairing: every MDP paired, opponents taken in S2 (residents) order.
    // Only the first complete MDP-pairing is tried: a later one comes after all
    // the resident-exchanges of this one in the generation order.
    let attempted = false;
    const dfsM = (k) => {
      if (--budget < 0) return null;
      if (k === md.length) {
        attempted = true;
        const r = remainder();
        return r === undefined ? null : r;
      }
      const m = md[k];
      for (const r of res) {
        if (used[r] || !clean(m, r)) continue;
        if (ps[r].float1 === 'U' || ps[r].float2 === 'U') continue;
        used[r] = 1;
        pairs.push([m, r]);
        const out = dfsM(k + 1);
        if (out !== undefined || attempted) return out;
        pairs.pop();
        used[r] = 0;
      }
      return undefined;
    };
    const floaters = dfsM(0);
    if (!floaters) return null;
    return { pairs, floaters };
  }

  // Does the following bracket (floaters moved down + next scoregroup) admit the
  // best conceivable pairing: every floater paired, as many pairs as possible,
  // an eligible resident left for the bye when it is the last bracket?
  idealNext(floaters, next, nextIsLast) {
    const list = floaters.concat(next);
    const m = list.length;
    const nf = floaters.length;
    if (nf > next.length) return false;
    const odd = m % 2 === 1;
    const size = odd ? m + 1 : m;
    const adj = Array.from({ length: size }, () => []);
    for (let a = 0; a < m; a++) {
      for (let b = Math.max(a + 1, nf); b < m; b++) {
        if (this.ok(list[a], list[b])) { adj[a].push(b); adj[b].push(a); }
      }
      if (odd && a >= nf && (!nextIsLast || this.ps[list[a]].canGetBye)) { adj[a].push(m); adj[m].push(a); }
    }
    const mate = maxCardinalityMatching(size, adj);
    for (let v = 0; v < size; v++) if (mate[v] === -1) return false;
    return true;
  }

  // Pairs one bracket. cfg.mode: 'normal' (look-ahead on cfg.extra = next
  // scoregroup), 'ppb' (completion together with cfg.extra = all lower players)
  // or 'last' (last bracket: completion including the bye).
  pairBracket(mdps, residents, cfg) {
    if (!this.opts.noFastPath) {
      const fast = this.perfectCandidate(mdps, residents, cfg);
      if (fast) return fast;
    }
    const B = mdps.concat(residents).sort((a, b) => a - b);
    const isMdp = new Set(mdps);
    const ctx = new BracketModel(this, B, isMdp, cfg);
    const removed = new Set();
    const bNoPair = new Set();
    const fixed = [];
    let qStar = null;
    let P = null;

    const mdpList = B.filter((i) => isMdp.has(i));
    if (mdpList.length) {
      if (residents.length === 0) {
        for (const i of mdpList) bNoPair.add(i);
      } else {
        // A2 assuming that every MDP gets paired (the usual case), else A1 first
        let sol = ctx.solve({ stage: 'A2', s1: mdpList, removed, bNoPair });
        let paired = mdpList.filter((i) => sol.pairedInB(i));
        if (paired.length !== mdpList.length) {
          const a1 = ctx.solve({ stage: 'A1', removed, bNoPair });
          paired = mdpList.filter((i) => a1.pairedInB(i));
          for (const i of mdpList) if (!paired.includes(i)) bNoPair.add(i);
          sol = paired.length ? ctx.solve({ stage: 'A2', s1: paired, removed, bNoPair }) : a1;
        }
        qStar = sol.q;
        for (const i of paired) {
          const j = sol.mateOf(i);
          fixed.push([i, j]);
          removed.add(i);
          removed.add(j);
        }
        P = sol.residentPairs(removed);
      }
    }
    const rem = B.filter((i) => !removed.has(i) && !isMdp.has(i));
    const remPairs = [];
    if (P === null) P = ctx.maxResidentPairs(rem, removed, bNoPair);
    if (P > 0) {
      let done = null;
      if (qStar !== null) {
        // no resident-exchange needed? (the first alternative in D.2 order)
        const opt = ctx.solve({ stage: 'B2', s1: rem.slice(0, P), removed, bNoPair, fixed });
        if (opt.q === qStar) done = opt;
      }
      if (!done) {
        const b1 = ctx.solve({ stage: 'B1', rem, P, removed, bNoPair, fixed });
        const s1 = rem.filter((i) => {
          const j = b1.mateOf(i);
          return j > i && !isMdp.has(j) && B.includes(j);
        });
        done = ctx.solve({ stage: 'B2', s1, removed, bNoPair, fixed });
      }
      for (const i of rem) {
        const j = done.mateOf(i);
        if (j > i && rem.includes(j)) remPairs.push([i, j]);
      }
    }
    const pairs = fixed.concat(remPairs);
    const inPair = new Set();
    for (const [i, j] of pairs) { inPair.add(i); inPair.add(j); }
    return { pairs, floaters: B.filter((i) => !inPair.has(i)) };
  }
}

// -----------------------------------------------------------------------------
// Weighted-matching model of one bracket. Vertices: the bracket B, then the
// extra players (next scoregroup, or all lower players for the PPB), then an
// optional dummy vertex standing for the bye.

class BracketModel {
  constructor(engine, B, isMdp, cfg) {
    this.e = engine;
    this.B = B;
    this.isMdp = isMdp;
    this.cfg = cfg;
    this.bsn = new Map(B.map((i, k) => [i, k + 1]));
    const ps = engine.ps;
    let extra = cfg.extra || [];
    this.floaterRank = null;
    // C.7 only depends on who floats. When the bracket can be paired completely
    // nobody does; when exactly one player must float, the value of the
    // following bracket is computed per possible floater. Only otherwise the
    // following bracket becomes part of the model.
    if (cfg.mode === 'normal' && extra.length && !process.env.JVF_FULLC7) {
      const floating = B.length - 2 * this.pairsInside(B, isMdp);
      if (floating === 0) extra = [];
      else if (floating === 1) {
        this.floaterRank = this.nextBracketRanks(B, extra, cfg.nextIsLast);
        extra = [];
      }
    }
    const verts = B.concat(cfg.mode === 'last' ? [] : extra);
    this.verts = verts;
    this.pos = new Map(verts.map((i, k) => [i, k]));
    this.nb = B.length;
    const total = verts.length;
    this.total = total;
    // bye dummy: completion of the round (PPB / last bracket), or the bye of the
    // following bracket when it is the last one (C.7 respects C.2 there)
    this.dummy = (cfg.mode !== 'normal' || (cfg.nextIsLast && extra.length)) && total % 2 === 1 ? total : -1;
    this.nv = total + (this.dummy >= 0 ? 1 : 0);
    this.maxPairs = BigInt(Math.floor(this.nv / 2));

    // all potential edges
    const nb = this.nb;
    const eu = [], ev = [], ecls = [];
    for (let a = 0; a < nb; a++) {
      for (let b = a + 1; b < nb; b++) {
        if (isMdp.has(verts[a]) && isMdp.has(verts[b])) continue;
        if (engine.ok(verts[a], verts[b])) { eu.push(a); ev.push(b); ecls.push(CLS_B); }
      }
    }
    const xcls = cfg.mode === 'normal' ? CLS_NEXT : CLS_REST;
    for (let a = 0; a < total; a++) {
      for (let b = Math.max(a + 1, nb); b < total; b++) {
        if (engine.ok(verts[a], verts[b])) { eu.push(a); ev.push(b); ecls.push(xcls); }
      }
    }
    if (this.dummy >= 0) {
      for (let a = 0; a < total; a++) {
        if (ps[verts[a]].canGetBye) {
          eu.push(a); ev.push(this.dummy); ecls.push(cfg.mode === 'normal' ? CLS_BYE : CLS_REST);
        }
      }
    }
    this.eu = eu;
    this.ev = ev;
    this.ecls = ecls;
    this.qw = this.qualityWeights();
  }

  // Maximum number of pairs inside the bracket (MDPs never meet each other).
  pairsInside(B, isMdp) {
    const n = B.length;
    const adj = Array.from({ length: n }, () => []);
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (isMdp.has(B[a]) && isMdp.has(B[b])) continue;
        if (this.e.ok(B[a], B[b])) { adj[a].push(b); adj[b].push(a); }
      }
    }
    return matchingSize(n, adj);
  }

  // C.7 with a single floater f: rank (0 = best) of the following bracket
  // {f} + N for every possible f, ordered like the full model does: complete
  // pairing of a last bracket (bye to an eligible player), number of pairs,
  // then PSD. With N a single scoregroup, the PSD only depends on whether f
  // can be paired: the other elements are all 1 point (unpaired) or 0.
  nextBracketRanks(B, N, nextIsLast) {
    const e = this.e;
    const ps = e.ps;
    const nN = N.length;
    const sN = ps[N[0]].score;
    const base = Array.from({ length: nN }, () => []);
    for (let a = 0; a < nN; a++) {
      for (let b = a + 1; b < nN; b++) if (e.ok(N[a], N[b])) { base[a].push(b); base[b].push(a); }
    }
    const g = nN + 1;
    const withBye = nextIsLast && g % 2 === 1;
    const keys = B.map((f) => {
      const adj = base.map((l) => l.slice());
      adj.push([]);
      for (let a = 0; a < nN; a++) if (e.ok(f, N[a])) { adj[a].push(nN); adj[nN].push(a); }
      const hasNb = adj[nN].length > 0;
      const nu = matchingSize(g, adj);
      let covered = 2 * nu;
      let fp = hasNb;
      if (withBye) {
        const eligible = (v) => (v === nN ? ps[f].canGetBye : ps[N[v]].canGetBye);
        const bye = (skipF) => {
          const h = adj.map((l) => l.slice());
          h.push([]);
          for (let v = 0; v < g; v++) {
            if (eligible(v) && !(skipF && v === nN)) { h[v].push(g); h[g].push(v); }
          }
          return matchingSize(g + 1, h);
        };
        if (bye(false) === nu + 1) {
          covered += 1;
          fp = hasNb && bye(true) === nu + 1;
        }
      }
      const unpaired = g - 2 * nu;
      const els = fp
        ? [ps[f].score - sN].concat(new Array(unpaired).fill(SCALE))
        : [ps[f].score - sN + SCALE].concat(new Array(unpaired - 1).fill(SCALE));
      els.sort((x, y) => y - x);
      return [nextIsLast ? -covered : 0, -nu, ...els];
    });
    const cmp = (x, y) => {
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] ?? 0) - (y[i] ?? 0);
        if (d) return d;
      }
      return 0;
    };
    const uniq = [];
    for (const k of keys.slice().sort(cmp)) if (!uniq.length || cmp(uniq[uniq.length - 1], k) !== 0) uniq.push(k);
    return keys.map((k) => uniq.findIndex((u) => cmp(u, k) === 0));
  }

  score(v) { return this.e.ps[this.verts[v]].score; }

  // Quality criteria (completion, C.5 - C.19) as BigInt weights of every edge.
  qualityWeights() {
    const e = this.e;
    const ps = e.ps;
    const { eu, ev, ecls, nb, total, cfg } = this;
    const m = eu.length;
    const verts = this.verts;
    const levels = [];
    const isB = (k) => ecls[k] === CLS_B;

    if (cfg.mode !== 'normal') levels.push(eu.map(() => 1n)); // completion
    levels.push(ecls.map((c) => (c === CLS_B ? 1n : 0n)));   // C.5

    const lmin = this.score(nb - 1);
    const df = (v) => this.score(v) - (lmin - SCALE);
    const sd = (a, b) => Math.abs(this.score(a) - this.score(b));
    levels.push(this.lexLevel((v) => df(v), (a, b) => [sd(a, b)]));  // C.6

    if (this.floaterRank) {                                         // C.7 (one floater)
      const r = this.floaterRank;
      levels.push(this.lexLevel((v) => r[v], () => []));
    }
    if (cfg.mode === 'normal' && total > nb) {                      // C.7
      if (cfg.nextIsLast) {
        // the following bracket is the last one: its pairing must be complete
        levels.push(ecls.map((c) => (c === CLS_B || c === CLS_NEXT ? 2n : c === CLS_BYE ? 1n : 0n)));
      }
      levels.push(ecls.map((c) => (c === CLS_NEXT ? 1n : 0n)));
      const sN = this.score(nb);
      const dfN = (v) => this.score(v) - (sN - SCALE);
      const values = new Set();
      for (let v = 0; v < total; v++) values.add(dfN(v));
      for (let k = 0; k < m; k++) if (ecls[k] === CLS_NEXT) values.add(sd(eu[k], ev[k]));
      const F = rankPow(values, BigInt(total + 1));
      levels.push(eu.map((a, k) => {
        const b = ev[k];
        if (ecls[k] === CLS_B) return F(dfN(a)) + F(dfN(b));
        if (ecls[k] === CLS_NEXT) return F(dfN(a)) + F(dfN(b)) - F(sd(a, b));
        return 0n;
      }));
    }

    const colorKeys = e.opts.lastRound ? ['c8', 'c9', 'c10', 'c11'] : ['c10', 'c11'];
    for (const key of colorKeys) {                                  // C.8 - C.11
      levels.push(eu.map((a, k) => (isB(k) ? -BigInt(e.colorInfo(verts[a], verts[ev[k]])[key]) : 0n)));
    }

    const flt = (v, w) => (w === 1 ? ps[verts[v]].float1 : ps[verts[v]].float2);
    // [player receiving the downfloat, player receiving the upfloat] of a pair
    const floats = (a, b) => {
      const sa = this.score(a), sb = this.score(b);
      if (sa === sb) return null;
      return sa > sb ? [a, b] : [b, a];
    };
    const sameDown = (w) => (a, b) => { const f = floats(a, b); return f && flt(f[0], w) === 'D'; };
    const sameUp = (w) => (a, b) => { const f = floats(a, b); return f && flt(f[1], w) === 'U'; };
    for (const w of [1, 2]) {                                       // C.12 - C.15
      const d = sameDown(w);
      const u = sameUp(w);
      levels.push(this.lexLevel((v) => (flt(v, w) === 'D' ? 0 : null), (a, b) => (d(a, b) ? [0] : []), true));
      levels.push(this.lexLevel(() => null, (a, b) => (u(a, b) ? [0] : []), true));
    }
    for (const w of [1, 2]) {                                       // C.16 - C.19
      const d = sameDown(w);
      const u = sameUp(w);
      levels.push(this.lexLevel((v) => (flt(v, w) === 'D' ? df(v) : null), (a, b) => (d(a, b) ? [sd(a, b)] : [])));
      levels.push(this.lexLevel(() => null, (a, b) => (u(a, b) ? [sd(a, b)] : [])));
    }
    return combineLevels(levels, ecls, this.maxPairs).w;
  }

  // "Minimise the sorted list of values" criterion as edge benefits. Every B
  // player unpaired in the bracket adds floaterVal(v) (null: nothing), every
  // bracket pair adds pairVals(a, b). With count = true only the number counts.
  lexLevel(floaterVal, pairVals, count = false) {
    const { eu, ev, ecls, nb } = this;
    const m = eu.length;
    const values = new Set();
    const fv = new Array(nb);
    for (let v = 0; v < nb; v++) {
      fv[v] = floaterVal(v);
      if (fv[v] !== null) values.add(fv[v]);
    }
    const pv = new Array(m);
    for (let k = 0; k < m; k++) {
      if (ecls[k] !== CLS_B) continue;
      pv[k] = pairVals(eu[k], ev[k]);
      for (const x of pv[k]) values.add(x);
    }
    const F = count ? () => 1n : rankPow(values, BigInt(nb + 1));
    const out = new Array(m);
    for (let k = 0; k < m; k++) {
      if (ecls[k] !== CLS_B) { out[k] = 0n; continue; }
      let s = 0n;
      const a = eu[k], b = ev[k];
      if (fv[a] !== null) s += F(fv[a]);
      if (fv[b] !== null) s += F(fv[b]);
      for (const x of pv[k]) s -= F(x);
      out[k] = s;
    }
    return out;
  }

  // Maximum number of resident pairs (C.5) of a homogeneous bracket.
  maxResidentPairs(rem, removed, bNoPair) {
    if (this.cfg.mode === 'last' && !this.B.some((i) => this.isMdp.has(i))) {
      return Math.floor(rem.length / 2);
    }
    if (this.cfg.mode === 'normal') {
      const n = rem.length;
      const adj = Array.from({ length: n }, () => []);
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          if (this.e.ok(rem[a], rem[b])) { adj[a].push(b); adj[b].push(a); }
        }
      }
      const mate = maxCardinalityMatching(n, adj);
      let c = 0;
      for (let v = 0; v < n; v++) if (mate[v] > v) c++;
      return c;
    }
    const sol = this.solve({ stage: 'Q', removed, bNoPair, fixed: [] });
    return sol.residentPairs(removed);
  }

  // Solves one stage. st: { stage, s1, rem, P, removed, bNoPair, fixed }
  solve(st) {
    const { eu, ev, ecls, qw, verts, nb, isMdp } = this;
    const m = eu.length;
    const removedPos = new Set([...st.removed].map((i) => this.pos.get(i)));
    const s1set = st.s1 ? new Set(st.s1) : null;
    const sel = [];
    for (let k = 0; k < m; k++) {
      const a = eu[k], b = ev[k];
      if (removedPos.has(a) || removedPos.has(b)) continue;
      if (ecls[k] === CLS_B) {
        const i = verts[a], j = verts[b];
        if (st.bNoPair.has(i) || st.bNoPair.has(j)) continue;
        if (st.stage === 'A2' && ((isMdp.has(i) && !s1set.has(i)) || (isMdp.has(j) && !s1set.has(j)))) continue;
        if (st.stage === 'B2' && s1set.has(i) === s1set.has(j)) continue;
      }
      sel.push(k);
    }
    // tie-break levels, lowest priority
    const tie = [];
    const bsn = (v) => this.bsn.get(verts[v]);
    const nB = this.B.length;
    const onB = (f) => sel.map((k) => (ecls[k] === CLS_B ? f(eu[k], ev[k]) : 0n));
    if (st.stage === 'A1') {
      // D.3: the paired MDPs with the highest scores, then the lowest BSNs
      const scores = [...new Set(this.B.filter((i) => isMdp.has(i)).map((i) => this.e.ps[i].score))]
        .sort((x, y) => x - y);
      const base = BigInt(nB + 1);
      const mdpOf = (a, b) => (isMdp.has(verts[a]) ? a : isMdp.has(verts[b]) ? b : -1);
      tie.push(onB((a, b) => {
        const x = mdpOf(a, b);
        return x < 0 ? 0n : base ** BigInt(scores.indexOf(this.score(x)));
      }));
      tie.push(onB((a, b) => {
        const x = mdpOf(a, b);
        return x < 0 ? 0n : 1n << BigInt(nB - bsn(x));
      }));
    } else if (st.stage === 'A2' || st.stage === 'B2') {
      // D.1: lexicographically smallest BSNs of the opponents of S1 in order
      const s1 = [...s1set].sort((x, y) => this.bsn.get(x) - this.bsn.get(y));
      const rank = new Map(s1.map((i, k) => [i, k]));
      const c = BigInt(nB + 1);
      const L = s1.length;
      tie.push(onB((a, b) => {
        let x = a, y = b;
        if (!rank.has(verts[x])) { x = b; y = a; }
        if (!rank.has(verts[x])) return 0n;
        return BigInt(nB + 1 - bsn(y)) * c ** BigInt(L - 1 - rank.get(verts[x]));
      }));
    } else if (st.stage === 'B1') {
      // D.2 on the remainder: S1R = its first P players. A remainder pairing is
      // generated first by the exchange that puts the lower BSN of each pair in S1.
      const R = st.rem.length;
      const P = st.P;
      const ridx = new Map(st.rem.map((i, k) => [i, k]));
      const low = (a, b) => ridx.get(verts[bsn(a) < bsn(b) ? a : b]);
      tie.push(onB((a, b) => (low(a, b) < P ? 1n : 0n)));                       // (a)
      tie.push(onB((a, b) => BigInt(R - low(a, b))));                            // (b)
      tie.push(onB((a, b) => { const r = low(a, b); return r < P ? (1n << BigInt(P)) - (1n << BigInt(r)) : 0n; })); // (c)
      tie.push(onB((a, b) => { const r = low(a, b); return r < P ? 0n : 1n << BigInt(R - 1 - r); }));              // (d)
    }
    const tieW = combineLevels(tie, sel.map((k) => ecls[k]), this.maxPairs);
    const w = new Array(sel.length);
    for (let t = 0; t < sel.length; t++) w[t] = qw[sel[t]] * tieW.range + tieW.w[t];
    const mate = maxWeightMatching(this.nv, sel.map((k) => eu[k]), sel.map((k) => ev[k]), w);

    let q = 0n;
    for (const k of sel) if (mate[eu[k]] === ev[k]) q += qw[k];
    if (st.fixed) {
      for (const [i, j] of st.fixed) q += this.edgeQ(this.pos.get(i), this.pos.get(j));
    }
    const self = this;
    return {
      q,
      mateOf(i) {
        const b = mate[self.pos.get(i)];
        return b >= 0 && b < self.total ? verts[b] : -1;
      },
      pairedInB(i) {
        const b = mate[self.pos.get(i)];
        return b >= 0 && b < nb;
      },
      residentPairs(removed) {
        let c = 0;
        for (let a = 0; a < nb; a++) {
          const b = mate[a];
          if (b > a && b < nb && !removed.has(verts[a]) && !isMdp.has(verts[a]) && !isMdp.has(verts[b])) c++;
        }
        return c;
      },
    };
  }

  edgeQ(a, b) {
    if (a > b) { const t = a; a = b; b = t; }
    if (!this.edgeIndex) {
      this.edgeIndex = new Map();
      for (let k = 0; k < this.eu.length; k++) this.edgeIndex.set(this.eu[k] * this.nv + this.ev[k], k);
    }
    return this.qw[this.edgeIndex.get(a * this.nv + b)];
  }
}

function matchingSize(n, adj) {
  const mate = maxCardinalityMatching(n, adj);
  let c = 0;
  for (let v = 0; v < n; v++) if (mate[v] > v) c++;
  return c;
}

function rankPow(values, base) {
  const sorted = [...values].sort((a, b) => a - b);
  const map = new Map();
  let p = 1n;
  for (const v of sorted) { map.set(v, p); p *= base; }
  return (x) => map.get(x);
}

// Combines levels (highest priority first) into BigInt edge weights. Negative
// values are shifted per edge class: the number of matched edges of a class is
// fixed by the higher levels wherever that class carries a value.
function combineLevels(levels, ecls, maxPairs) {
  const m = ecls.length;
  const norm = levels.map((vals) => {
    const minBy = new Map();
    for (let k = 0; k < m; k++) {
      const c = ecls[k];
      const v = vals[k];
      if (!minBy.has(c) || v < minBy.get(c)) minBy.set(c, v);
    }
    const out = new Array(m);
    let max = 0n;
    for (let k = 0; k < m; k++) {
      let v = vals[k];
      const mn = minBy.get(ecls[k]);
      if (mn < 0n) v -= mn;
      out[k] = v;
      if (v > max) max = v;
    }
    return { out, range: max * maxPairs + 1n };
  });
  const L = norm.length;
  const mul = new Array(L);
  let acc = 1n;
  for (let l = L - 1; l >= 0; l--) { mul[l] = acc; acc *= norm[l].range; }
  const w = new Array(m);
  for (let k = 0; k < m; k++) {
    let s = 0n;
    for (let l = 0; l < L; l++) if (norm[l].out[k]) s += norm[l].out[k] * mul[l];
    w[k] = s;
  }
  return { w, range: acc };
}
