// Runs compare.mjs in parallel shards and aggregates the results.
// usage: node test/tools/pcompare.mjs <dir> [compare options]
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const n = Math.max(1, cpus().length - 2);
const args = process.argv.slice(2);
const runs = Array.from({ length: n }, (_, i) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(here, 'compare.mjs'), ...args, `--shard=${i}/${n}`]);
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', () => resolve(out));
}));
const outs = await Promise.all(runs);
const tot = { files: 0, rounds: 0, bad: 0, errors: 0, ms: 0, maxMs: 0 };
for (const o of outs) {
  for (const line of o.split('\n')) {
    if (line.startsWith('#STAT ')) {
      const s = JSON.parse(line.slice(6));
      for (const k of ['files', 'rounds', 'bad', 'errors', 'ms']) tot[k] += s[k];
      tot.maxMs = Math.max(tot.maxMs, s.maxMs);
    } else if (line.trim() && !line.startsWith('files ')) console.log(line);
  }
}
console.log(`TOTAL files ${tot.files}, rounds ${tot.rounds}, mismatches ${tot.bad}, errors ${tot.errors}, avg ${(tot.ms / Math.max(1, tot.rounds)).toFixed(1)} ms, max ${tot.maxMs.toFixed(0)} ms`);
