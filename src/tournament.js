// Glue between the TRF(x) data and the pairing engine.

import { parseTrf, pairedRounds } from './trf.js';
import { buildScoring } from './scoring.js';
import { buildState, toUnits, SCALE } from './state.js';
import { pairRound, pairKey } from './dutch.js';
import { initialColourIsWhite, fileBase } from './initialColour.js';

export class Tournament {
  constructor(data) {
    this.data = data;
    this.scoring = buildScoring(data);
    this.played = pairedRounds(data);
  }

  // fileName (optional): the TRF file name, used for the initial colour choice
  static fromText(text, fileName) {
    const data = parseTrf(text);
    data.fileBase = fileBase(fileName);
    return new Tournament(data);
  }

  get name() { return (this.data.headers.get('012') || '').trim(); }

  acceleration(id, round) {
    const a = this.data.acceleration.get(id);
    return a && a[round - 1] ? toUnits(a[round - 1]) : 0;
  }

  // Total number of rounds (XXR, otherwise the rounds found in the file).
  totalRounds(round) {
    return this.data.totalRounds || Math.max(this.played, round);
  }

  // Player states for pairing `round` (1-based).
  state(round, { total, checking } = {}) {
    const players = buildState(this.data, this.scoring, round, (id, r) => this.acceleration(id, r), checking);
    const last = round === (total ?? this.totalRounds(round));
    if (last) {
      const limit = (round - 1) * toUnits(this.scoring.maxPerRound);
      for (const p of players) p.topscorer = 2 * p.score > limit;
    }
    return { players, lastRound: last };
  }

  forbiddenPairs() {
    const set = new Set();
    for (const ids of this.data.forbidden) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) if (ids[i] !== ids[j]) set.add(pairKey(ids[i], ids[j]));
      }
    }
    return set;
  }

  pnOf(rec) { return this.data.config.rank ? rec.pos : rec.id; }

  // Numbers used by rule E.5 when pairing `round`: consecutive numbers, in
  // pairing-number order, of the players who are present or have already been
  // paired in an earlier round (absent players never paired get no number).
  e5Numbers(round, isPresent) {
    const paired = (rec) => rec.games.slice(0, round - 1).some((g) => g.opp > 0 || g.code === 'U');
    const recs = this.data.players.filter((r) => isPresent(r) || paired(r))
      .sort((a, b) => this.pnOf(a) - this.pnOf(b));
    return new Map(recs.map((r, k) => [r.id, k + 1]));
  }

  // Initial colour: XXC white1/black1; otherwise, once round 1 has been played,
  // the one that rule E.5 must have used there (seen from the first pair of the
  // top player who had a coloured game); before that, the file/name hash.
  initialWhite(round) {
    const c = this.data.config;
    if (c.white1) return true;
    if (c.black1) return false;
    if (round > 1) {
      const recs = this.data.players;
      const byId = this.data.byId;
      const inR1 = (r) => r.games[0] && (r.games[0].opp > 0 || r.games[0].code === 'U');
      const e1 = this.e5Numbers(1, inR1);
      const g = recs.filter((r) => r.games[0] && r.games[0].opp > 0 && 'wb'.includes(r.games[0].color))
        .sort((a, b) => this.pnOf(a) - this.pnOf(b))[0];
      if (g) {
        const o = byId.get(g.games[0].opp);
        let hi = g;
        if (o) {
          const sg = this.acceleration(g.id, 1), so = this.acceleration(o.id, 1);
          if (so > sg || (so === sg && this.pnOf(o) < this.pnOf(g))) hi = o;
        }
        const hg = hi.games[0];
        if (hg && 'wb'.includes(hg.color) && e1.has(hi.id)) {
          return (hg.color === 'w') === (e1.get(hi.id) % 2 === 1);
        }
      }
    }
    return initialColourIsWhite(this.data);
  }

  // Pairs round `round` (default: the next one). Returns
  // { round, pairs: [[white, black]] (Player), bye: Player|null, players }
  pair(round = this.played + 1, opts = {}) {
    const { players, lastRound } = this.state(round, opts);
    const present = players.filter((p) => p.present);
    const presentIds = new Set(present.map((p) => p.id));
    const e5 = this.e5Numbers(round, (r) => presentIds.has(r.id));
    for (const p of present) p.e5 = e5.get(p.id);
    const res = pairRound(present, {
      lastRound,
      initialWhite: this.initialWhite(round),
      forbidden: this.forbiddenPairs(),
      trace: opts.trace,
    });
    const pairs = sortBoards(res.pairs);
    return { round, pairs, bye: res.bye, players, lastRound };
  }
}

// Board order: higher score of the pair first, then the sum of the scores,
// then the rank of the higher ranked player.
export function sortBoards(pairs) {
  const key = (pr) => {
    const [a, b] = pr;
    const hi = a.score !== b.score ? (a.score > b.score ? a : b) : (a.pn < b.pn ? a : b);
    return { max: Math.max(a.score, b.score), sum: a.score + b.score, pn: hi.pn };
  };
  return pairs
    .map((pr) => ({ pr, k: key(pr) }))
    .sort((x, y) => (y.k.max - x.k.max) || (y.k.sum - x.k.sum) || (x.k.pn - y.k.pn))
    .map((x) => x.pr);
}

export { SCALE };
