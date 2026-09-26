// Generates random tournaments with the original javafo.jar (RTG).
// usage: node test/tools/gen.mjs <outdir> <count> [--cfg file] [--baku] [--seed0 n]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { runJava, pool } from './common.mjs';

const [outdir, countStr, ...rest] = process.argv.slice(2);
const count = parseInt(countStr || '10', 10);
const cfgIdx = rest.indexOf('--cfg');
const cfg = cfgIdx >= 0 ? rest[cfgIdx + 1] : null;
const baku = rest.includes('--baku');
const seedIdx = rest.indexOf('--seed0');
const seed0 = seedIdx >= 0 ? parseInt(rest[seedIdx + 1], 10) : null;
mkdirSync(outdir, { recursive: true });
const t0 = Date.now();
const res = await pool([...Array(count).keys()], async (i) => {
  const file = path.join(outdir, `t${String(i).padStart(5, '0')}.trf`);
  const args = ['-g'];
  if (seed0 !== null) args.push(String(seed0 + i));
  else if (cfg) args.push(cfg);
  if (baku) args.push('-b');
  args.push('-o', file);
  const r = await runJava(args);
  if (r.code !== 0) return `${file}: ${r.err || r.out}`;
  return null;
});
const errs = res.filter(Boolean);
console.log(`generated ${count - errs.length}/${count} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const e of errs.slice(0, 5)) console.log(e);
