// Compares pairing output and check-list of javafo.jar and the JS engine for TRFX files.
// usage: node test/tools/cl.mjs file.trfx [--show]
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJava } from './common.mjs';
import { Tournament } from '../../src/tournament.js';
import { checklist } from '../../src/checklist.js';

const show = process.argv.includes('--show');
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jvf-'));
  const out = path.join(dir, 'o.txt');
  const lst = path.join(dir, 'o.list');
  const r = await runJava([path.resolve(f), '-p', out, '-l', lst]);
  const jOut = existsSync(out) ? readFileSync(out, 'utf8').trim().split(/\r?\n/) : [`ERR ${r.out}${r.err}`];
  const jList = existsSync(lst) ? readFileSync(lst, 'utf8').split(/\r?\n/) : [];
  const t = Tournament.fromText(readFileSync(f, 'utf8'));
  const res = t.pair();
  const mine = [String(res.pairs.length + (res.bye ? 1 : 0))];
  for (const [w, b] of res.pairs) mine.push(`${w.id} ${b.id}`);
  if (res.bye) mine.push(`${res.bye.id} 0`);
  const myList = checklist(res).split(/\r?\n/);
  console.log(`== ${f}`);
  console.log(`pairs ${jOut.join(' | ') === mine.join(' | ') ? 'SAME' : 'DIFF'}`);
  if (show || jOut.join('|') !== mine.join('|')) {
    console.log(' javafo: ' + jOut.join(' | '));
    console.log(' js    : ' + mine.join(' | '));
  }
  let d = 0;
  const n = Math.max(jList.length, myList.length);
  for (let i = 0; i < n; i++) {
    if (jList[i] !== myList[i]) {
      if (d++ < 15) console.log(` L${i}\n  J:${JSON.stringify(jList[i])}\n  M:${JSON.stringify(myList[i])}`);
    }
  }
  console.log(`checklist ${d ? d + ' lines differ' : 'SAME'}`);
}
