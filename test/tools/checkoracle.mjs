// Compares the pairings checker (-c) of javafo.jar and the JS CLI on complete
// tournaments; with --mutate, some pairs of a random round are swapped first
// (same results, so the Points stay consistent).
// usage: node test/tools/checkoracle.mjs <dir> [--mutate] [maxFiles]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runJava, pool, roundsIn } from './common.mjs';
import { main } from '../../src/cli.js';

const args = process.argv.slice(2);
const dir = args[0];
const mutate = args.includes('--mutate');
const max = parseInt(args.find((a) => /^\d+$/.test(a)) || '100000', 10);
const work = path.join(dir, '_chk');
mkdirSync(work, { recursive: true });
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };

function swapPairs(text) {
  const lines = text.split(/\r?\n/);
  const R = roundsIn(text);
  const r = 1 + Math.floor(rnd() * R);
  const at = 91 + 10 * (r - 1);
  const games = [];
  lines.forEach((l, i) => {
    if (!l.startsWith('001')) return;
    const s = l.padEnd(at + 10).substring(at, at + 10);
    const opp = parseInt(s.substring(0, 4), 10) || 0;
    const id = parseInt(l.substring(4, 8), 10);
    if (opp > id && '10='.includes(s[7]) && (s[5] === 'w' || s[5] === 'b')) games.push({ i, id, opp, s });
  });
  if (games.length < 2) return null;
  const a = games[Math.floor(rnd() * games.length)];
  const b = games[Math.floor(rnd() * games.length)];
  if (a === b || a.s[7] !== b.s[7] || a.s[5] !== b.s[5]) return null;
  // a.id-a.opp and b.id-b.opp become a.id-b.opp and b.id-a.opp
  const idx = new Map(lines.map((l, i) => [l.startsWith('001') ? parseInt(l.substring(4, 8), 10) : -1, i]));
  const set = (id, opp) => {
    const i = idx.get(id);
    const l = lines[i].padEnd(at + 10);
    lines[i] = (l.substring(0, at) + String(opp).padStart(4) + l.substring(at + 4)).trimEnd();
  };
  set(a.id, b.opp); set(b.opp, a.id); set(b.id, a.opp); set(a.opp, b.id);
  return lines.join('\n');
}

const files = readdirSync(dir).filter((f) => f.endsWith('.trf')).sort().slice(0, max);
const res = await pool(files, async (f) => {
  let text = readFileSync(path.join(dir, f), 'utf8');
  if (mutate) {
    let m = null;
    for (let k = 0; k < 20 && !m; k++) m = swapPairs(text);
    if (!m) return null;
    text = m;
  }
  const file = path.join(work, f);
  writeFileSync(file, text);
  const j = await runJava([path.resolve(file), '-c']);
  let mine = '';
  await main([file, '-c'], { out: (s) => { mine += s; } });
  return j.out === mine ? null : `${f}: differs\n--- javafo\n${j.out.slice(0, 600)}\n--- js\n${mine.slice(0, 600)}`;
});
const bad = res.filter(Boolean);
for (const b of bad.slice(0, 3)) console.log(b);
console.log(`checker oracle: ${files.length} files, ${bad.length} differences`);
