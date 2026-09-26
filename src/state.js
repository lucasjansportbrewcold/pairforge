// Player state at the moment of pairing a given round.

export const SCALE = 1000; // scores are handled as integers (thousandths of a point)
export const toUnits = (x) => Math.round(x * SCALE);

export const ABS = 3;
export const STRONG = 2;
export const MILD = 1;
export const NONE = 0;

export class Player {
  constructor(rec, pn) {
    this.rec = rec;
    this.id = rec.id;
    this.pos = rec.pos;
    this.pn = pn;            // pairing number used for ranking (A.2.b)
    this.e5 = pn;            // pairing number used by rule E.5
    this.score = 0;          // pairing score in units (includes acceleration)
    this.realScore = 0;      // points scored in the previous rounds (units)
    this.colors = '';        // colours of the played games, e.g. "WBW"
    this.cd = 0;             // colour difference
    this.pref = null;        // 'W' | 'B' | null
    this.strength = NONE;    // ABS | STRONG | MILD | NONE
    this.twice = false;      // same colour in the two latest played games
    this.float1 = null;      // float in the previous round: 'D' | 'U' | null
    this.float2 = null;      // float two rounds before
    this.opponents = new Set();
    this.canGetBye = true;
    this.topscorer = false;
    this.present = true;
    this.idx = -1;           // index among the players to be paired
  }
}

function preferenceOf(p) {
  const c = p.colors;
  const n = c.length;
  let w = 0;
  for (let i = 0; i < n; i++) if (c[i] === 'W') w++;
  p.cd = w - (n - w);
  if (n === 0) return;
  const last = c[n - 1];
  p.twice = n >= 2 && c[n - 2] === last;
  if (p.cd < -1 || p.cd > 1 || p.twice) {
    // the colour difference decides; only when it is zero the last games do
    // (as JaVaFo, also when both conditions point to different colours)
    p.strength = ABS;
    if (p.cd !== 0) p.pref = p.cd < 0 ? 'W' : 'B';
    else p.pref = last === 'W' ? 'B' : 'W';
  } else if (p.cd !== 0) {
    p.strength = STRONG;
    p.pref = p.cd < 0 ? 'W' : 'B';
  } else {
    p.strength = MILD;
    p.pref = last === 'W' ? 'B' : 'W';
  }
}

// Builds the state of every player for pairing round `round` (1-based).
// `acc(id, round)` returns the fictitious points (in units) for that round.
// checking = true: `round` has been played already (pairings checker); the
// players paired in that round (game or pairing-allocated bye) are present.
export function buildState(data, scoring, round, acc, checking = false) {
  const recs = data.players;
  const players = recs.map((r) => new Player(r, data.config.rank ? r.pos : r.id));
  const byId = new Map(players.map((p) => [p.id, p]));
  const n = players.length;
  // before[k][i]: points of player i before round k+1 (units)
  const before = [];
  let cur = new Array(n).fill(0);
  for (let k = 0; k < round; k++) {
    before.push(cur);
    if (k === round - 1) break;
    const next = cur.slice();
    for (let i = 0; i < n; i++) {
      const g = recs[i].games[k];
      if (g) next[i] += toUnits(scoring.points(g));
      else next[i] += toUnits(scoring.values[6]); // blank round: zero-point-bye
    }
    cur = next;
  }
  const pairingScore = (i, k) => before[k][i] + acc(recs[i].id, k + 1);
  for (let i = 0; i < n; i++) {
    const p = players[i];
    const rec = recs[i];
    p.realScore = before[round - 1][i];
    p.score = pairingScore(i, round - 1);
    let colors = '';
    for (let k = 0; k < round - 1; k++) {
      const g = rec.games[k];
      if (!g) continue;
      if (g.code === 'U' || (g.opp === 0 && g.code === '+') || (g.opp > 0 && g.code === '+')) {
        p.canGetBye = false;
      }
      if (g.played) {
        colors += g.color === 'b' ? 'B' : 'W';
        p.opponents.add(g.opp);
      }
    }
    p.colors = colors;
    preferenceOf(p);
    const floatOf = (k) => { // k: 0-based round index
      if (k < 0) return null;
      const g = rec.games[k];
      if (!g || !g.played) return 'D';
      const o = byId.get(g.opp);
      if (!o) return 'D';
      const mine = pairingScore(i, k);
      const theirs = pairingScore(o.pos - 1, k);
      if (mine > theirs) return 'D';
      if (mine < theirs) return 'U';
      return null;
    };
    p.float1 = floatOf(round - 2);
    p.float2 = floatOf(round - 3);
    const g = rec.games[round - 1];
    if (checking) p.present = !!g && (g.opp > 0 || g.code === 'U');
    else if (data.absent.has(p.id) || (g && g.opp === 0 && !g.isBlank)) p.present = false;
  }
  return players;
}
