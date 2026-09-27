// Builds dist/pairforge.exe (or dist/pairforge on macOS/Linux): the program
// bundled into one script and injected into a copy of the running Node binary
// (Node "single executable application"). The result needs no Node install.
// usage: npm run build
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build', 'out');
const dist = path.join(root, 'dist');
mkdirSync(out, { recursive: true });
mkdirSync(dist, { recursive: true });

// 1. one CommonJS script (a single executable runs one CommonJS file)
const script = path.join(out, 'pairforge.cjs');
await build({
  entryPoints: [path.join(root, 'bin', 'pairforge.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: script,
  legalComments: 'none',
});

// 2. preparation blob
const blob = path.join(out, 'pairforge.blob');
const config = path.join(out, 'sea-config.json');
writeFileSync(config, JSON.stringify({ main: script, output: blob, disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });

// 3. copy of the Node binary with the blob injected
const exe = path.join(dist, process.platform === 'win32' ? 'pairforge.exe' : 'pairforge');
if (existsSync(exe)) rmSync(exe);
copyFileSync(process.execPath, exe);
if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', exe]);
const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');
const args = [postject, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
execFileSync(process.execPath, args, { stdio: 'inherit' });
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', exe]);
console.log(`built ${path.relative(root, exe)}`);
