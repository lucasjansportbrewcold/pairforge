// Glue between the TRF(x) data and the pairing engine.

import { parseTrf, pairedRounds } from './trf.js';
import { buildScoring } from './scoring.js';
import { buildState, toUnits, SCALE } from './state.js';
import { pairRound, pairKey } from './dutch.js';
import { initialColourIsWhite } from './initialColour.js';

export class Tournament {
  constructor(data) {
    this.data = data;
    this.scoring = buildScoring(data);
    this.played = pairedRounds(data);
  }

  static fromText(text) {
    return new Tournament(parseTrf(text));
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
  state(round, { total } = {}) {
    const players = buildState(this.data, this.scoring, round, (id, r) => this.acceleration(id, r));
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

  initialWhite() {
    const c = this.data.config;
    if (c.white1) return true;
    if (c.black1) return false;
    return initialColourIsWhite(this.data);
  }

  // Pairs round `round` (default: the next one). Returns
  // { round, pairs: [[white, black]] (Player), bye: Player|null, players }
  pair(round = this.played + 1, opts = {}) {
    const { players, lastRound } = this.state(round, opts);
    const present = players.filter((p) => p.present);
    const res = pairRound(present, {
      lastRound,
      initialWhite: this.initialWhite(),
      forbidden: this.forbiddenPairs(),
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
