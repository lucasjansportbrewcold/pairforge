// Runs javafo.jar and the JS CLI on every .trfx file of a directory (pairing
// and check-list) and compares the produced files byte by byte.
// usage: node test/tools/oracle.mjs <dir> [extra javafo args, e.g. -b]
import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runJava, pool } from './common.mjs';
import { main } from '../../src/cli.js';

const [dir, ...extra] = process.argv.slice(2);
const out = path.join(dir, '_out');
mkdirSync(out, { recursive: true });
const files = readdirSync(dir).filter((f) => f.endsWith('.trfx')).sort();
const results = await pool(files, async (f) => {
  const src = path.join(dir, f);
  const b = f.replace(/\.trfx$/, '');
  const jp = path.join(out, `${b}.j.txt`), jl = path.join(out, `${b}.j.list`);
  const mp = path.join(out, `${b}.m.txt`), ml = path.join(out, `${b}.m.list`);
  for (const x of [jp, jl, mp, ml]) if (existsSync(x)) rmSync(x);
  const r = await runJava([path.resolve(src), ...extra, '-p', path.resolve(jp), '-l', path.resolve(jl)]);
  let mout = '';
  await main([src, ...extra, '-p', path.resolve(mp), '-l', path.resolve(ml)], { out: (s) => { mout += s; } });
  const read = (x) => (existsSync(x) ? readFileSync(x) : null);
  const [a, bb, c, d] = [read(jp), read(mp), read(jl), read(ml)];
  const same = (x, y) => (x === null && y === null) || (x && y && x.equals(y));
  const errJ = r.out.trim().split(/\r?\n/)[0] || '';
  const errM = mout.trim().split(/\r?\n/)[0] || '';
  if (!a && !bb) return errJ === errM ? null : `${f}: errors differ\n  J: ${errJ}\n  M: ${errM}`;
  if (!same(a, bb)) return `${f}: PAIRING differs\n  J: ${a ? a.toString().trim().split(/\r?\n/).join('|') : errJ}\n  M: ${bb ? bb.toString().trim().split(/\r?\n/).join('|') : errM}`;
  if (!same(c, d)) return `${f}: CHECKLIST differs`;
  return null;
});
const bad = results.filter(Boolean);
for (const x of bad.slice(0, process.env.ORACLE_ALL ? 100000 : 20)) console.log(x);
console.log(`oracle: ${files.length} files, ${bad.length} differences`);
