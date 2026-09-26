// Generates tournaments with the JS generator and lets javafo.jar check every
// round (-c): any "Checker pairings" block is a disagreement.
// usage: node test/tools/rtgcheck.mjs <outdir> <count> [firstSeed] [--baku] [--cfg file]
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runJava, pool } from './common.mjs';
import { generate } from '../../src/rtg.js';

const args = process.argv.slice(2);
const [outdir, countStr, seedStr] = args.filter((a) => !a.startsWith('--'));
const baku = args.includes('--baku');
const ci = args.indexOf('--cfg');
const cfg = ci >= 0 ? args[ci + 1] : null;
mkdirSync(outdir, { recursive: true });
const count = parseInt(countStr || '20', 10);
const first = parseInt(seedStr || '1', 10);
let rounds = 0;
const res = await pool([...Array(count).keys()], async (k) => {
  const seed = first + k;
  let text;
  try {
    text = cfg ? generate({ config: cfg, baku }) : generate({ config: String(seed), baku });
  } catch (e) {
    return `seed ${seed}: generation failed: ${e.message}`;
  }
  const file = path.join(outdir, `r${seed}.trf`);
  writeFileSync(file, text);
  const r = await runJava([path.resolve(file), '-c']);
  rounds += (r.out.match(/Round #/g) || []).length;
  if (r.code !== 0 || r.out.includes('Checker pairings')) return `seed ${seed}: ${r.out.split(/\r?\n/).filter((l) => !/Round #/.test(l)).slice(0, 6).join(' | ')}`;
  return null;
}, 8);
const bad = res.filter(Boolean);
for (const b of bad.slice(0, 10)) console.log(b);
console.log(`rtgcheck: ${count} tournaments, ${rounds} rounds checked, ${bad.length} with differences`);
