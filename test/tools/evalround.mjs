// Evaluates a round pairing (javafo.jar's and ours) criterion by criterion.
// usage: node test/tools/evalround.mjs <file.trfx>
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJava } from './common.mjs';
import { Tournament } from '../../src/tournament.js';
import { whiteFor } from '../../src/colors.js';

const file = process.argv[2];
const dir = mkdtempSync(path.join(tmpdir(), 'ev-'));
await runJava([path.resolve(file), '-p', path.join(dir, 'j.txt')]);
const jp = readFileSync(path.join(dir, 'j.txt'), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(' ').map(Number));
const t = Tournament.fromText(readFileSync(file, 'utf8'), file);
const res = t.pair();
const mp = res.pairs.map(([w, b]) => [w.id, b.id]);
if (res.bye) mp.push([res.bye.id, 0]);
const by = new Map(res.players.map((p) => [p.id, p]));
const X = t.initialWhite(res.round);
console.log('round', res.round, 'last', res.lastRound);
const show = (label, pairs) => {
  const rows = [];
  for (const [w, b] of pairs) {
    if (!b) { rows.push(`bye ${w}`); continue; }
    const W = by.get(w), B = by.get(b);
    const ok = whiteFor(W, B, X) ? 'W' : 'B';
    const info = [];
    for (const [p, c] of [[W, 'W'], [B, 'B']]) {
      if (p.pref && p.pref !== c) info.push(`${p.id}!pref(${p.strength})`);
      if (res.lastRound && (W.topscorer || B.topscorer)) {
        const cd = p.cd + (c === 'W' ? 1 : -1);
        if (Math.abs(cd) > 2) info.push(`${p.id}!cd${cd}`);
        if (p.twice && p.pref !== c) info.push(`${p.id}!3row`);
      }
    }
    const f = W.score === B.score ? '' : (W.score > B.score ? `${w}D ${b}U` : `${b}D ${w}U`);
    rows.push(`${w}(${W.score / 1000})-${b}(${B.score / 1000}) alloc:${ok === 'W' ? 'ok' : 'SWAPPED'} ${info.join(',')} ${f}`);
  }
  console.log(`--- ${label}\n` + rows.join('\n'));
};
const key = (p) => [...p].sort((a, b) => a - b).join('-');
const js = new Set(jp.map(key)), ms = new Set(mp.map(key));
show('javafo only', jp.filter((p) => !ms.has(key(p))));
show('js only', mp.filter((p) => !js.has(key(p))));
for (const id of new Set([...jp.filter((p) => !ms.has(key(p))).flat()].filter(Boolean))) {
  const p = by.get(id);
  console.log(`  ${id}: score ${p.score / 1000} colors ${p.colors} cd ${p.cd} pref ${p.pref}/${p.strength} twice ${p.twice} f1 ${p.float1} f2 ${p.float2} top ${p.topscorer}`);
}
