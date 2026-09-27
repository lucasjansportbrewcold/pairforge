// Command line interface compatible with javafo.jar:
//   javafo [-r]
//   javafo [-r] input-file -c [round-number]
//   javafo [-r] input-file [-b] -p [output-file] [-l [check-list-file]]
//   javafo [-r] [model-file] -g [-b] -o trf-file
//   javafo [-r] -g config-file|seed [-b] -o trf-file

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { EOL } from 'node:os';
import path from 'node:path';
import { Tournament } from './tournament.js';
import { checklist } from './checklist.js';
import { checkTournament } from './checker.js';
import { VERSION } from './version.js';
import { JaVaFoError, PairingImpossibleError } from './errors.js';

const isOpt = (a) => a !== undefined && a.startsWith('-') && a.length > 1 && !/^-\d/.test(a);

export function parseArgs(argv) {
  const o = { input: null, version: false, pair: false, pairOut: null, list: false, listOut: null,
    check: false, checkRound: null, gen: false, genArg: null, trfOut: null, baku: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case '-r': o.version = true; break;
      case '-p': o.pair = true; if (next !== undefined && !isOpt(next)) { o.pairOut = next; i++; } break;
      case '-l': o.list = true; if (next !== undefined && !isOpt(next)) { o.listOut = next; i++; } break;
      case '-c': o.check = true; if (next !== undefined && /^\d+$/.test(next)) { o.checkRound = parseInt(next, 10); i++; } break;
      case '-g': o.gen = true; if (next !== undefined && !isOpt(next)) { o.genArg = next; i++; } break;
      case '-o': if (next !== undefined) { o.trfOut = next; i++; } break;
      case '-b': o.baku = true; break;
      case '-w': break;
      case '-q': if (next !== undefined && /^\d+$/.test(next)) i++; break;
      default:
        if (isOpt(a)) throw new JaVaFoError(`Unknown option ${a}`);
        if (o.input === null) o.input = a;
        break;
    }
  }
  return o;
}

// Output paths are relative to the directory of the input file.
function resolveOut(file, input) {
  if (path.isAbsolute(file) || !input) return file;
  return path.join(path.dirname(input), file);
}

function writeChecked(file, text) {
  const dir = path.dirname(file);
  if (dir && !existsSync(dir)) throw new JaVaFoError(`${dir} does not exist`);
  writeFileSync(file, text);
}

function readInput(file) {
  if (!existsSync(file) || statSync(file).isDirectory()) {
    throw new JaVaFoError(`java.io.FileNotFoundException: ${file} (The system cannot find the file specified)`);
  }
  return readFileSync(file, 'utf8');
}

export function pairingText(res, eol = EOL) {
  const lines = [String(res.pairs.length + (res.bye ? 1 : 0))];
  for (const [w, b] of res.pairs) lines.push(`${w.id} ${b.id}`);
  if (res.bye) lines.push(`${res.bye.id} 0`);
  return lines.join(eol) + eol;
}

export async function main(argv, io = { out: (s) => process.stdout.write(s) }) {
  if (argv.length === 0) {
    io.out(VERSION + EOL);
    return 0;
  }
  try {
    const o = parseArgs(argv);
    if (o.version) io.out(VERSION + EOL);
    if (o.gen) {
      const { generate } = await import('./rtg.js');
      const model = o.input ? readInput(o.input) : null;
      const text = generate({ model, config: o.genArg, baku: o.baku });
      if (!o.trfOut) throw new JaVaFoError('No output specified for the generated tournament');
      writeChecked(o.trfOut, text);
      return 0;
    }
    if (!o.input) return 0;
    const t = Tournament.fromText(readInput(o.input), o.input);
    if (o.check) {
      const name = t.data.fileBase;
      const lines = checkTournament(t, name, o.checkRound);
      io.out(lines.map((l) => l + EOL).join(''));
      return 0;
    }
    if (!o.pair && !o.list) {
      io.out('No output specified for the pairing' + EOL);
      return 0;
    }
    t.assertPairable();
    const res = t.pair(undefined, { baku: o.baku });
    if (o.pair) {
      const text = pairingText(res);
      if (o.pairOut) writeChecked(resolveOut(o.pairOut, o.input), text);
      else io.out(text);
    }
    if (o.list) {
      const file = o.listOut
        ? resolveOut(o.listOut, o.input)
        : path.join(path.dirname(o.input), path.basename(o.input).replace(/\.[^.]*$/, '') + '.list');
      writeChecked(file, checklist(res, EOL));
    }
    return 0;
  } catch (e) {
    if (e instanceof PairingImpossibleError) {
      io.out(`java.lang.Exception: ${e.message}${EOL}Assertion Error (java.lang.AssertionError)${EOL}Ask for help to javafo@rrweb.org${EOL}`);
    } else if (e instanceof JaVaFoError && e.message === 'Assertion Error') {
      io.out(`Assertion Error (java.lang.AssertionError)${EOL}Ask for help to javafo@rrweb.org${EOL}`);
    } else {
      const msg = e instanceof JaVaFoError ? (e.label ?? e.message) : `${e.name}: ${e.message}`;
      io.out(`Error in processing (${msg})${EOL}Ask for help to javafo@rrweb.org${EOL}`);
      if (!(e instanceof JaVaFoError) && process.env.JAVAFO_DEBUG) io.out(e.stack + EOL);
    }
    return 1;
  }
}
