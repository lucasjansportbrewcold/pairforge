// Delta debugging: shrinks a TRFX (removing players, renumbering the rest)
// while javafo.jar and the JS engine still disagree on the pairing.
// usage: node test/tools/ddmin.mjs in.trfx out.trfx
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJava } from './common.mjs';
import { Tournament } from '../../src/tournament.js';

const [inp, outp] = process.argv.slice(2);
const colourOnly = process.argv.includes('--colour-only');
const ki = process.argv.indexOf('--keep');
const fixedIds = new Set(ki >= 0 ? process.argv[ki + 1].split(',').map(Number) : []);
const src = readFileSync(inp, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'dd-'));
const allIds = src.split(/\r?\n/).filter((l) => l.startsWith('001')).map((l) => +l.substring(4, 8));

function subset(keep) {
  const ks = [...keep].sort((a, b) => a - b);
  const map = new Map(ks.map((id, i) => [id, i + 1]));
  const res = [];
  for (const l of src.split(/\r?\n/)) {
    if (l.startsWith('XXP') || l.startsWith('XXZ')) continue;
    if (!l.startsWith('001')) { res.push(l); continue; }
    const id = +l.substring(4, 8);
    if (!map.has(id)) continue;
    let s = l.substring(0, 4) + String(map.get(id)).padStart(4) + l.substring(8, 91);
    let pts = 0;
    const P = { '1': 1, '+': 1, W: 1, '=': 0.5, D: 0.5, H: 0.5, U: 1, F: 1 };
    for (let at = 91; at < l.length; at += 10) {
      let slot = l.substring(at, at + 10);
      const opp = +slot.substring(0, 4) || 0;
      if (opp > 0 && !map.has(opp)) {
        const c = slot[7];
        slot = '0000 - ' + ('1+W'.includes(c) ? 'F' : '=D'.includes(c) ? 'H' : 'Z') + '  ';
      } else if (opp > 0) slot = String(map.get(opp)).padStart(4) + slot.substring(4);
      pts += P[slot[7]] || 0;
      s += slot;
    }
    s = s.substring(0, 80) + pts.toFixed(1).padStart(4) + s.substring(84);
    res.push(s.trimEnd());
  }
  return res.join('\n') + '\n';
}

async function differs(keep) {
  const text = subset(keep);
  const k = ++calls;
  const f = path.join(dir, `x${k}.trfx`);
  writeFileSync(f, text);
  const o = path.join(dir, `x${k}.out`);
  const r = await runJava([f, '-p', o]);
  if (r.code !== 0 || !existsSync(o)) return false;
  const j = readFileSync(o, 'utf8').trim().split(/\r?\n/).join('|');
  if (!j) return false;
  let mine;
  try {
    const res = Tournament.fromText(text).pair();
    mine = [String(res.pairs.length + (res.bye ? 1 : 0)), ...res.pairs.map(([w, b]) => `${w.id} ${b.id}`)];
    if (res.bye) mine.push(`${res.bye.id} 0`);
  } catch { return false; }
  if (colourOnly) {
    const norm = (x) => x.split('|').slice(1).map((pr) => pr.split(' ').map(Number).sort((a, b) => a - b).join(' ')).sort().join('|');
    if (norm(j) !== norm(mine.join('|'))) return false;
  }
  if (process.env.DDDEBUG) console.log(k, JSON.stringify(j), JSON.stringify(mine.join('|')));
  return j !== mine.join('|');
}

let calls = 0;
let keep = new Set(allIds);
if (!(await differs(keep))) { console.log('no difference to start with'); process.exit(1); }
let n = 2;
while (keep.size - fixedIds.size >= 2) {
  const ids = [...keep].filter((id) => !fixedIds.has(id));
  const chunk = Math.ceil(ids.length / n);
  let reduced = false;
  for (let i = 0; i < ids.length; i += chunk) {
    const trial = new Set([...fixedIds, ...ids.filter((_, k) => k < i || k >= i + chunk)]);
    if (trial.size && await differs(trial)) { keep = trial; n = Math.max(n - 1, 2); reduced = true; break; }
  }
  if (!reduced) { if (n >= ids.length) break; n = Math.min(ids.length, n * 2); }
  process.stdout.write(`${keep.size} `);
}
writeFileSync(outp, subset(keep));
console.log(`\nminimal: ${keep.size} players -> ${outp}`);
