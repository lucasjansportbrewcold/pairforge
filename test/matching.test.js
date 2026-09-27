// The matching algorithms against exhaustive search on small random graphs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxWeightMatching } from '../src/blossom.js';
import { maxCardinalityMatching } from '../src/cardinality.js';

let seed = 20260927;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };

function randomGraph(n, density, maxW, negative) {
  const edges = [];
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      if (rnd() < density) edges.push([u, v, BigInt(Math.floor(rnd() * maxW) - (negative ? Math.floor(maxW / 3) : 0))]);
    }
  }
  return edges;
}

// best total weight and best cardinality by exhaustive search
function brute(n, edges) {
  let bestW = 0n, bestC = 0;
  const used = new Array(n).fill(false);
  const rec = (i, w, c) => {
    while (i < n && used[i]) i++;
    if (i >= n) { if (w > bestW) bestW = w; if (c > bestC) bestC = c; return; }
    used[i] = true;
    rec(i + 1, w, c);
    for (const [u, v, x] of edges) {
      const o = u === i ? v : v === i ? u : -1;
      if (o > i && !used[o]) { used[o] = true; rec(i + 1, w + x, c + 1); used[o] = false; }
    }
    used[i] = false;
  };
  rec(0, 0n, 0);
  return { bestW, bestC };
}

test('maximum weight matching is optimal and consistent', () => {
  for (let t = 0; t < 1500; t++) {
    const n = 1 + Math.floor(rnd() * 10);
    const edges = randomGraph(n, 0.2 + rnd() * 0.6, t % 2 ? 6 : 1000, t % 5 === 0);
    const mate = maxWeightMatching(n, edges.map((e) => e[0]), edges.map((e) => e[1]), edges.map((e) => e[2]));
    let w = 0n;
    for (const [u, v, x] of edges) if (mate[u] === v) w += x;
    for (let v = 0; v < n; v++) if (mate[v] >= 0) assert.equal(mate[mate[v]], v);
    assert.equal(w, brute(n, edges).bestW);
  }
});

test('maximum cardinality matching is maximum', () => {
  for (let t = 0; t < 1500; t++) {
    const n = 1 + Math.floor(rnd() * 11);
    const edges = randomGraph(n, 0.1 + rnd() * 0.5, 1, false);
    const adj = Array.from({ length: n }, () => []);
    for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
    const mate = maxCardinalityMatching(n, adj);
    let c = 0;
    for (let v = 0; v < n; v++) {
      if (mate[v] >= 0) {
        assert.equal(mate[mate[v]], v);
        assert.ok(adj[v].includes(mate[v]));
        if (mate[v] > v) c++;
      }
    }
    assert.equal(c, brute(n, edges).bestC);
  }
});
