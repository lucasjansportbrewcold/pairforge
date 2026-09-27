// For a complete tournament where the checker outputs of javafo.jar and the JS
// CLI differ: finds the first differing round, writes it as a .trfx next to the
// file and prints the differing check-list lines.
// usage: node test/tools/firstdiff.mjs <file.trf>
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJava, truncateTrf, roundsIn } from './common.mjs';
import { main } from '../../src/cli.js';

const file = process.argv[2];
const text = readFileSync(file, 'utf8');
const R = roundsIn(text);
const j = (await runJava([path.resolve(file), '-c'])).out;
let m = '';
await main([file, '-c'], { out: (s) => { m += s; } });
const split = (s) => s.split(/(?=^\S+: Round #\d+)/m);
const js = split(j), ms = split(m);
let r = 0;
for (let i = 0; i < Math.max(js.length, ms.length); i++) if (js[i] !== ms[i]) { r = i + 1; break; }
if (!r) { console.log('no difference'); process.exit(0); }
console.log(`first difference in round ${r}\n--- javafo\n${js[r - 1]}--- js\n${ms[r - 1]}`);
const out = file.replace(/\.trf$/, `_r${r}.trfx`);
writeFileSync(out, truncateTrf(text, r, R));
const dir = mkdtempSync(path.join(tmpdir(), 'fd-'));
const jl = path.join(dir, 'j.list');
await runJava([path.resolve(out), '-p', path.join(dir, 'j.txt'), '-l', jl]);
let ml = '';
const mlf = path.join(dir, 'm.list');
await main([out, '-p', path.join(dir, 'm.txt'), '-l', mlf], { out: () => {} });
if (existsSync(jl) && existsSync(mlf)) {
  const a = readFileSync(jl, 'utf8').split(/\r?\n/), b = readFileSync(mlf, 'utf8').split(/\r?\n/);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) console.log(`J: ${a[i]}\nM: ${b[i]}`);
}
console.log(`round file: ${out}`);
