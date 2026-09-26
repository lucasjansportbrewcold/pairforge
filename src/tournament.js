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

  // Initial colour: XXC white1/black1; otherwise, once round 1 has been
  // played, the colour of the highest ranked player who had a game in round 1;
  // before that, derived from the tournament name.
  initialWhite(round) {
    const c = this.data.config;
    if (c.white1) return true;
    if (c.black1) return false;
    if (round > 1) {
      const first = this.data.players
        .filter((p) => p.games[0] && p.games[0].opp > 0 && 'wb'.includes(p.games[0].color))
        .map((p) => ({ p, s: this.acceleration(p.id, 1), pn: this.data.config.rank ? p.pos : p.id }))
        .sort((a, b) => (b.s - a.s) || (a.pn - b.pn))[0];
      if (first) return first.p.games[0].color === 'w';
    }
    return initialColourIsWhite(this.data);
  }

  // Pairs round `round` (default: the next one). Returns
  // { round, pairs: [[white, black]] (Player), bye: Player|null, players }
  pair(round = this.played + 1, opts = {}) {
    const { players, lastRound } = this.state(round, opts);
    const present = players.filter((p) => p.present);
    if (round === 1) {
      // E.5 in the first round: consecutive numbers among the present players
      present.slice().sort((a, b) => a.pn - b.pn).forEach((p, k) => { p.e5 = k + 1; });
    }
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
