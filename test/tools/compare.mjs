// Re-pairs every round of complete tournaments (paired by javafo.jar) with the
// JavaScript engine and reports the differences.
// usage: node test/tools/compare.mjs <dir|file...> [--from-round n] [--verbose]
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Tournament } from '../../src/tournament.js';
import { truncateTrf, roundPairs, roundsIn, ROOT } from './common.mjs';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const ignoreColour1 = !args.includes('--colour1');
const files = [];
const shardArg = args.find((a) => a.startsWith('--shard='));
const [shard, shards] = shardArg ? shardArg.slice(8).split('/').map(Number) : [0, 1];
for (const a of args.filter((x) => !x.startsWith('--') && !/^\d+$/.test(x))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (f.endsWith('.trf')) files.push(path.join(a, f)); }
  else files.push(a);
}
const mine = files.filter((_, i) => i % shards === shard);
files.length = 0;
files.push(...mine);
const failDir = path.join(ROOT, 'test', 'work', 'fail');
mkdirSync(failDir, { recursive: true });
let rounds = 0, bad = 0, errors = 0, ms = 0, maxMs = 0;
const badFiles = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const total = roundsIn(text);
  for (let r = 1; r <= total; r++) {
    const trf = truncateTrf(text, r, total);
    const expected = roundPairs(text, r);
    let got;
    const t0 = performance.now();
    try {
      const t = Tournament.fromText(trf);
      const res = t.pair(r);
      got = res.pairs.map(([w, b]) => `${w.id}-${b.id}`);
      if (res.bye) got.push(`${res.bye.id}-0`);
      got.sort();
    } catch (e) {
      errors++;
      got = [`ERROR ${e.message}`];
      if (verbose) console.log(e.stack);
    }
    const dt = performance.now() - t0;
    ms += dt; if (dt > maxMs) maxMs = dt;
    rounds++;
    let exp = expected, g = got;
    if (r === 1 && ignoreColour1) {
      // the RTG draws its own initial colour: accept a complete colour flip
      const flip = (x) => x.map((s) => { const [a, b] = s.split('-'); return b === '0' ? s : `${b}-${a}`; }).sort();
      if (flip(got).join(' ') === expected.join(' ')) g = expected;
    }
    if (exp.join(' ') !== g.join(' ')) {
      bad++;
      const name = `${path.basename(f, '.trf')}_r${r}.trfx`;
      writeFileSync(path.join(failDir, name), trf);
      badFiles.push(name);
      if (verbose || bad <= 10) {
        const onlyE = exp.filter((x) => !g.includes(x));
        const onlyG = g.filter((x) => !exp.includes(x));
        console.log(`${f} round ${r}: javafo-only [${onlyE.join(' ')}] js-only [${onlyG.join(' ')}]`);
      }
    }
  }
}
console.log(`files ${files.length}, rounds ${rounds}, mismatches ${bad}, errors ${errors}, avg ${(ms / Math.max(1, rounds)).toFixed(1)} ms, max ${maxMs.toFixed(0)} ms`);
console.log(`#STAT ${JSON.stringify({ files: files.length, rounds, bad, errors, ms, maxMs })}`);
