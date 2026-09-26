// Maximum cardinality matching in a general graph (Edmonds, O(V^3)).
// adj: array of neighbour arrays. Returns Int32Array mate.

export function maxCardinalityMatching(n, adj) {
  const match = new Int32Array(n).fill(-1);
  // greedy start: saves most of the augmenting work
  for (let v = 0; v < n; v++) {
    if (match[v] !== -1) continue;
    for (const w of adj[v]) if (match[w] === -1) { match[v] = w; match[w] = v; break; }
  }
  const p = new Int32Array(n);
  const base = new Int32Array(n);
  const used = new Uint8Array(n);
  const blossom = new Uint8Array(n);
  const mark = new Uint8Array(n);
  const q = new Int32Array(n);

  function lca(a, b) {
    mark.fill(0);
    for (;;) {
      a = base[a];
      mark[a] = 1;
      if (match[a] === -1) break;
      a = p[match[a]];
    }
    for (;;) {
      b = base[b];
      if (mark[b]) return b;
      b = p[match[b]];
    }
  }
  function markPath(v, b, child) {
    while (base[v] !== b) {
      blossom[base[v]] = blossom[base[match[v]]] = 1;
      p[v] = child;
      child = match[v];
      v = p[match[v]];
    }
  }
  function findPath(root) {
    used.fill(0);
    p.fill(-1);
    for (let i = 0; i < n; i++) base[i] = i;
    used[root] = 1;
    let qh = 0, qt = 0;
    q[qt++] = root;
    while (qh < qt) {
      const v = q[qh++];
      for (const to of adj[v]) {
        if (base[v] === base[to] || match[v] === to) continue;
        if (to === root || (match[to] !== -1 && p[match[to]] !== -1)) {
          const cur = lca(v, to);
          blossom.fill(0);
          markPath(v, cur, to);
          markPath(to, cur, v);
          for (let i = 0; i < n; i++) {
            if (blossom[base[i]]) {
              base[i] = cur;
              if (!used[i]) { used[i] = 1; q[qt++] = i; }
            }
          }
        } else if (p[to] === -1) {
          p[to] = v;
          if (match[to] === -1) return to;
          used[match[to]] = 1;
          q[qt++] = match[to];
        }
      }
    }
    return -1;
  }
  for (let v = 0; v < n; v++) {
    if (match[v] !== -1) continue;
    let u = findPath(v);
    while (u !== -1) {
      const pv = p[u];
      const ppv = match[pv];
      match[u] = pv;
      match[pv] = u;
      u = ppv;
    }
  }
  return match;
}
