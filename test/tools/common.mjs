// Shared helpers for the comparison tools against the original javafo.jar.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const JAR = process.env.JAVAFO_JAR || path.join(ROOT, 'javafo.jar');

export function javaExe() {
  if (process.env.JAVA) return process.env.JAVA;
  const guess = 'C:/Program Files/Eclipse Adoptium/jre-21.0.12.101-hotspot/bin/java.exe';
  return existsSync(guess) ? guess : 'java';
}

export function runJava(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(javaExe(), ['-ea', '-jar', JAR, ...args], { cwd: opts.cwd });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

export async function pool(items, worker, width = Math.max(1, cpus().length - 2)) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, lane));
  return results;
}

const PTS = { '1': 1, '+': 1, W: 1, '=': 0.5, D: 0.5, H: 0.5, U: 1, F: 1 };

// TRF text for pairing round `round` of a complete tournament: results of the
// earlier rounds, absences of the round itself, Points recomputed.
// pointsOf(code, colour, hasOpp) may be given for non-standard scoring systems.
export function truncateTrf(text, round, total, pointsOf) {
  const pts = pointsOf || ((c) => PTS[c] || 0);
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.startsWith('001')) {
      if (raw.startsWith('XXR')) continue;
      out.push(raw);
      continue;
    }
    const line = raw.padEnd(91 + 10 * round);
    let keep = line.substring(91, 91 + 10 * (round - 1));
    let p = 0;
    for (let i = 0; i < round - 1; i++) {
      const s = line.substring(91 + 10 * i, 101 + 10 * i);
      p += pts(s[7], s[5], s.substring(0, 4).trim() !== '0000' && s.trim() !== '');
    }
    const cur = line.substring(91 + 10 * (round - 1), 101 + 10 * (round - 1));
    if (cur.startsWith('0000') && 'HZF-'.includes(cur[7])) {
      keep += cur;
      p += pts(cur[7], cur[5], false);
    } else if (cur.trim() === '') {
      keep += '0000 - - '.padEnd(10); // not paired in that round: absent
    }
    const pstr = p.toFixed(1).padStart(4);
    out.push((line.substring(0, 80) + pstr + line.substring(84, 91) + keep).trimEnd());
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  out.push(`XXR ${total}`);
  return out.join('\n') + '\n';
}

// Pairings of a round as stored in a complete TRF: sorted list of "w-b" / "id-0".
export function roundPairs(text, round) {
  const res = new Set();
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.startsWith('001')) continue;
    const id = parseInt(raw.substring(4, 8), 10);
    const s = raw.padEnd(101 + 10 * round).substring(91 + 10 * (round - 1), 101 + 10 * (round - 1));
    const opp = parseInt(s.substring(0, 4), 10) || 0;
    if (opp > 0) {
      if (s[5] === 'w') res.add(`${id}-${opp}`);
      else if (s[5] === 'b') res.add(`${opp}-${id}`);
      else res.add(id < opp ? `${id}?${opp}` : `${opp}?${id}`);
    } else if (s[7] === 'U') res.add(`${id}-0`);
  }
  return [...res].sort();
}

export function roundsIn(text) {
  let n = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.startsWith('001')) continue;
    const len = raw.trimEnd().length;
    if (len > 91) n = Math.max(n, Math.ceil((len - 91) / 10));
  }
  return n;
}

// A check-list without its last line (program name and version).
export function withoutVersion(text) {
  return text.replace(/[^\r\n]*$/, '');
}
