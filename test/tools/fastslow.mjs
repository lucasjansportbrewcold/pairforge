// Differential check of the fast path against the full matching model: every
// round of generated tournaments is paired both ways; the results must agree.
// usage: node test/tools/fastslow.mjs <count> [firstSeed] [maxPlayers]
import { generate } from '../../src/rtg.js';
import { Tournament } from '../../src/tournament.js';
import { truncateTrf, roundsIn } from './common.mjs';

const count = parseInt(process.argv[2] || '50', 10);
const first = parseInt(process.argv[3] || '1', 10);
const maxPlayers = parseInt(process.argv[4] || '120', 10);
let rounds = 0, bad = 0, fastMs = 0, slowMs = 0;
const key = (r) => r.pairs.map(([w, b]) => `${w.id}-${b.id}`).concat(r.bye ? [`${r.bye.id}-0`] : []).join(' ');
for (let k = 0; k < count; k++) {
  const seed = first + k;
  const players = 10 + (seed * 7919) % (maxPlayers - 9);
  const rnds = 5 + (seed * 104729) % 9;
  let text;
  try {
    text = generate({ configText: `PlayersNumber=${players}\nRoundsNumber=${rnds}`, seed, baku: seed % 4 === 0 });
  } catch { continue; }
  const R = roundsIn(text);
  for (let r = 1; r <= R; r++) {
    const trf = truncateTrf(text, r, R);
    let a, b;
    try {
      const t0 = performance.now();
      a = key(Tournament.fromText(trf).pair(r));
      const t1 = performance.now();
      b = key(Tournament.fromText(trf).pair(r, { noFastPath: true }));
      const t2 = performance.now();
      fastMs += t1 - t0; slowMs += t2 - t1;
    } catch (e) {
      a = b = `error ${e.message}`;
    }
    rounds++;
    if (a !== b) {
      bad++;
      if (bad <= 5) console.log(`seed ${seed} round ${r}:\n  fast ${a}\n  slow ${b}`);
    }
  }
}
console.log(`fastslow: ${rounds} rounds, ${bad} differences, fast ${(fastMs / 1000).toFixed(1)}s, slow ${(slowMs / 1000).toFixed(1)}s`);
