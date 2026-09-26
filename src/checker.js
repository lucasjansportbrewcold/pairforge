// Pairings checker (-c): re-pairs every round of a tournament and lists the
// pairs that differ from the ones in the file.

import { sortBoards } from './tournament.js';

const pad = (x, n) => String(x).padStart(n, ' ');

function actualPairs(t, round, players) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const pairs = [];
  let bye = null;
  const seen = new Set();
  for (const p of players) {
    const g = p.rec.games[round - 1];
    if (!g) continue;
    if (g.opp > 0) {
      const o = byId.get(g.opp);
      if (!o || seen.has(p.id)) continue;
      seen.add(p.id);
      seen.add(o.id);
      pairs.push(g.color === 'b' ? [o, p] : [p, o]);
    } else if (g.code === 'U') {
      bye = p;
    }
  }
  return { pairs: sortBoards(pairs), bye };
}

// Returns the checker report for one round, as an array of lines.
export function checkRound(t, round, name) {
  const lines = [`${name}: Round #${round}`];
  const res = t.pair(round, { checking: true, total: t.data.totalRounds || t.played });
  const act = actualPairs(t, round, res.players);
  const key = ([w, b]) => `${w.id}-${b.id}`;
  const mine = new Set(res.pairs.map(key));
  const theirs = new Set(act.pairs.map(key));
  const left = res.pairs.filter((pr) => !theirs.has(key(pr))).map(([w, b]) => `${pad(w.id, 7)} - ${pad(b.id, 3)}`);
  const right = act.pairs.filter((pr) => !mine.has(key(pr))).map(([w, b]) => `${pad(w.id, 19)} - ${pad(b.id, 3)}`);
  const byeL = res.bye ? res.bye.id : 0;
  const byeR = act.bye ? act.bye.id : 0;
  if (byeL !== byeR) {
    if (byeL) left.push(`    PAB:${pad(byeL, 5)}`);
    if (byeR) right.push(`                PAB:${pad(byeR, 5)}`);
  }
  if (left.length || right.length) {
    lines.push('  Checker pairings        Tournament pairings ');
    const n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i++) lines.push((left[i] ?? ' '.repeat(13)) + (right[i] ?? ''));
    lines.push('');
  }
  return lines;
}

export function checkTournament(t, name, onlyRound) {
  const out = [];
  const rounds = onlyRound ? [onlyRound] : Array.from({ length: t.played }, (_, i) => i + 1);
  for (const r of rounds) out.push(...checkRound(t, r, name));
  return out;
}
