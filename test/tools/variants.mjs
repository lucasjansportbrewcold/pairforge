// Builds TRFX inputs with extra features from complete tournaments.
// usage: node test/tools/variants.mjs <srcDir> <outDir> <kind> [count] [seed]
// kind: plain | accel | forbid | rank | colour | absent | score | mix
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { truncateTrf, roundsIn } from './common.mjs';

const [srcDir, outDir, kind = 'mix', countStr = '200', seedStr = '1'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
let seed = parseInt(seedStr, 10) >>> 0 || 1;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const files = readdirSync(srcDir).filter((f) => f.endsWith('.trf')).sort();
const count = parseInt(countStr, 10);

const SCORES = {
  '310': { W: 3, D: 1, L: 0, xxs: 'XXS W=3 D=1 PAB=3' },
  '3210': { W: 3, D: 2, L: 1, xxs: 'XXS W=3 D=2 WL=1 BL=1 PAB=3 ZPB=0 HPB=0 FPB=0' },
  'pab05': { W: 1, D: 0.5, L: 0, xxs: 'XXS PAB=.5' },
};

for (let n = 0; n < count; n++) {
  const f = files[n % files.length];
  const full = readFileSync(path.join(srcDir, f), 'utf8');
  const R = roundsIn(full);
  const r = 1 + Math.floor(rnd() * R);
  const kinds = kind === 'mix' ? ['accel', 'forbid', 'rank', 'colour', 'absent', 'score'].filter(() => rnd() < 0.4) : [kind];
  let scoring = null;
  if (kinds.includes('score')) scoring = SCORES[pick(Object.keys(SCORES))];
  const pointsOf = scoring ? (c, col, hasOpp) => {
    if ('1W+'.includes(c) && c !== ' ') return c === '+' && !hasOpp ? scoring.W : scoring.W;
    if ('=D'.includes(c)) return hasOpp ? scoring.D : (scoring.xxs.includes('HPB=0') ? 0 : scoring.D);
    if ('0L'.includes(c) && hasOpp) return scoring.L;
    if (c === 'U') return scoring.xxs.includes('PAB=.5') ? 0.5 : scoring.xxs.match(/PAB=(\d+)/) ? +scoring.xxs.match(/PAB=(\d+)/)[1] : 1;
    if (c === 'H') return scoring.xxs.includes('HPB=0') ? 0 : scoring.D;
    if (c === 'F') return scoring.xxs.includes('FPB=0') ? 0 : scoring.W;
    return 0;
  } : undefined;
  let text = truncateTrf(full, r, R, pointsOf);
  let lines = text.trimEnd().split('\n');
  const players = lines.filter((l) => l.startsWith('001'));
  const ids = players.map((l) => parseInt(l.substring(4, 8), 10));
  const extra = [];
  if (scoring) extra.push(scoring.xxs);
  if (kinds.includes('accel')) {
    const upto = Math.min(r, 1 + Math.floor(rnd() * 4));
    const top = Math.ceil(ids.length * (0.3 + rnd() * 0.3));
    for (const id of ids.slice(0, top)) {
      let s = `XXA ${String(id).padStart(4)}`;
      for (let k = 1; k <= upto; k++) s += ' ' + (k <= upto / 2 + 0.5 ? '1.0' : '0.5').padStart(4);
      extra.push(s);
    }
  }
  if (kinds.includes('forbid')) {
    const k = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < k; i++) {
      const a = pick(ids.slice(0, Math.min(ids.length, 30)));
      const b = pick(ids.slice(0, Math.min(ids.length, 30)));
      if (a !== b) extra.push(`XXP ${a} ${b}`);
    }
  }
  if (kinds.includes('absent')) {
    const k = 1 + Math.floor(rnd() * 3);
    extra.push('XXZ ' + Array.from({ length: k }, () => pick(ids)).join(' '));
  }
  const cfg = [];
  if (kinds.includes('rank')) cfg.push('rank');
  if (kinds.includes('colour')) cfg.push(pick(['white1', 'black1']));
  if (cfg.length) extra.push('XXC ' + cfg.join(' '));
  if (kinds.includes('rank')) {
    // positional ids differ from pairing ids: move some players around
    const idx = lines.map((l, i) => (l.startsWith('001') ? i : -1)).filter((i) => i >= 0);
    const pl = idx.map((i) => lines[i]);
    for (let s = 0; s < Math.max(2, pl.length / 5); s++) {
      const a = Math.floor(rnd() * pl.length), b = Math.floor(rnd() * pl.length);
      [pl[a], pl[b]] = [pl[b], pl[a]];
    }
    idx.forEach((i, k) => { lines[i] = pl[k]; });
  }
  lines = lines.concat(extra);
  writeFileSync(path.join(outDir, `v${String(n).padStart(4, '0')}_${kinds.join('-') || 'plain'}_${path.basename(f, '.trf')}_r${r}.trfx`), lines.join('\n') + '\n');
}
console.log(`written ${count} files to ${outDir}`);
