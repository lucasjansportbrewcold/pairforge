// Reference output of the original javafo.jar (2.2, build 3222) for a set of
// inputs covering its features; the files in test/fixtures were produced by it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import { setDecimalSeparator } from '../src/format.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const out = mkdtempSync(path.join(tmpdir(), 'javafo-golden-'));
// the fixtures come from a JVM with a Dutch locale on Windows
setDecimalSeparator(',');
const norm = (s) => s.replace(/\r\n/g, '\n');
const read = (f) => norm(readFileSync(f, 'utf8'));

for (const f of readdirSync(dir).filter((x) => x.endsWith('.trfx'))) {
  const name = f.replace(/\.trfx$/, '');
  test(`pairing and check-list: ${name}`, async () => {
    const p = path.join(out, `${name}.txt`);
    const l = path.join(out, `${name}.list`);
    const args = [path.join(dir, f), '-p', p, '-l', l];
    if (name === 'baku') args.splice(1, 0, '-b');
    assert.equal(await main(args, { out: () => {} }), 0);
    assert.equal(read(p), read(path.join(dir, `${name}.pairing.txt`)));
    // the last line names the program (JaVaFo in the reference files)
    const body = (s) => s.replace(/[^\n]*$/, '');
    assert.equal(body(read(l)), body(read(path.join(dir, `${name}.list`))));
  });
}

for (const f of readdirSync(dir).filter((x) => x.endsWith('.trf'))) {
  const name = f.replace(/\.trf$/, '');
  test(`checker: ${name}`, async () => {
    let text = '';
    await main([path.join(dir, f), '-c'], { out: (s) => { text += s; } });
    assert.equal(norm(text), read(path.join(dir, `${name}.check.txt`)));
  });
}
