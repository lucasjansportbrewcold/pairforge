// Times the JS engine on every round of complete tournaments (single thread).
// usage: node test/tools/timing.mjs <dir> [maxFiles]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Tournament } from '../../src/tournament.js';
import { truncateTrf, roundsIn } from './common.mjs';
const dir = process.argv[2];
const max = parseInt(process.argv[3] || '1000000', 10);
const rows = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.trf')).slice(0, max)) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  const R = roundsIn(text);
  const n = (text.match(/^001/gm) || []).length;
  for (let r = 1; r <= R; r++) {
    const trf = truncateTrf(text, r, R);
    const t0 = performance.now();
    Tournament.fromText(trf).pair(r);
    rows.push([performance.now() - t0, f, r, n]);
  }
}
rows.sort((a, b) => b[0] - a[0]);
console.log(rows.slice(0, 10).map((x) => `${x[0].toFixed(0)}ms ${x[1]} r${x[2]} n=${x[3]}`).join('\n'));
const tot = rows.reduce((s, x) => s + x[0], 0);
console.log(`rounds ${rows.length} total ${(tot / 1000).toFixed(1)}s avg ${(tot / rows.length).toFixed(1)}ms`);
