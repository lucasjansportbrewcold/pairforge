// Maximum weight matching in a general graph (Edmonds' blossom algorithm with
// the primal-dual method of Galil, O(n^3)). Weights are BigInt, so arbitrarily
// wide lexicographic weights can be used exactly.
//
// maxWeightMatching(n, us, vs, ws) -> Int32Array mate (mate[v] = partner or -1)

export function maxWeightMatching(nvertex, us, vs, wsIn) {
  const nedge = us.length;
  const mateOut = new Int32Array(nvertex).fill(-1);
  if (nedge === 0) return mateOut;
  const ws = new Array(nedge);
  let maxweight = 0n;
  for (let k = 0; k < nedge; k++) {
    const w = wsIn[k] * 2n; // doubled: keeps every dual variable integral
    ws[k] = w;
    if (w > maxweight) maxweight = w;
  }
  const endpoint = new Int32Array(2 * nedge);
  const degree = new Int32Array(nvertex);
  for (let k = 0; k < nedge; k++) {
    endpoint[2 * k] = us[k];
    endpoint[2 * k + 1] = vs[k];
    degree[us[k]]++;
    degree[vs[k]]++;
  }
  // neighbend[v]: remote endpoints of the edges incident to v (CSR layout)
  const nbStart = new Int32Array(nvertex + 1);
  for (let v = 0; v < nvertex; v++) nbStart[v + 1] = nbStart[v] + degree[v];
  const nbFill = nbStart.slice(0, nvertex);
  const neighbend = new Int32Array(2 * nedge);
  for (let k = 0; k < nedge; k++) {
    neighbend[nbFill[us[k]]++] = 2 * k + 1;
    neighbend[nbFill[vs[k]]++] = 2 * k;
  }

  const n2 = 2 * nvertex;
  const mate = new Int32Array(nvertex).fill(-1);
  const label = new Int8Array(n2);
  const labelend = new Int32Array(n2).fill(-1);
  const inblossom = new Int32Array(nvertex);
  for (let v = 0; v < nvertex; v++) inblossom[v] = v;
  const blossomparent = new Int32Array(n2).fill(-1);
  const blossomchilds = new Array(n2).fill(null);
  const blossombase = new Int32Array(n2).fill(-1);
  for (let v = 0; v < nvertex; v++) blossombase[v] = v;
  const blossomendps = new Array(n2).fill(null);
  const bestedge = new Int32Array(n2).fill(-1);
  const blossombestedges = new Array(n2).fill(null);
  const unusedblossoms = [];
  for (let b = n2 - 1; b >= nvertex; b--) unusedblossoms.push(b);
  const dualvar = new Array(n2);
  for (let v = 0; v < nvertex; v++) dualvar[v] = maxweight;
  for (let b = nvertex; b < n2; b++) dualvar[b] = 0n;
  const allowedge = new Uint8Array(nedge);
  let queue = [];

  const slack = (k) => dualvar[endpoint[2 * k]] + dualvar[endpoint[2 * k + 1]] - ws[k];

  function blossomLeaves(b, out) {
    if (b < nvertex) { out.push(b); return out; }
    const stack = [b];
    while (stack.length) {
      const x = stack.pop();
      if (x < nvertex) out.push(x);
      else { const ch = blossomchilds[x]; for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]); }
    }
    return out;
  }

  function assignLabel(w, t, p) {
    const b = inblossom[w];
    label[w] = label[b] = t;
    labelend[w] = labelend[b] = p;
    bestedge[w] = bestedge[b] = -1;
    if (t === 1) {
      blossomLeaves(b, queue);
    } else if (t === 2) {
      const base = blossombase[b];
      assignLabel(endpoint[mate[base]], 1, mate[base] ^ 1);
    }
  }

  function scanBlossom(v, w) {
    const path = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v];
      if (label[b] & 4) { base = blossombase[b]; break; }
      path.push(b);
      label[b] = 5;
      if (labelend[b] === -1) {
        v = -1;
      } else {
        v = endpoint[labelend[b]];
        b = inblossom[v];
        v = endpoint[labelend[b]];
      }
      if (w !== -1) { const t = v; v = w; w = t; }
    }
    for (const b of path) label[b] = 1;
    return base;
  }

  function addBlossom(base, k) {
    let v = endpoint[2 * k];
    let w = endpoint[2 * k + 1];
    const bb = inblossom[base];
    let bv = inblossom[v];
    let bw = inblossom[w];
    const b = unusedblossoms.pop();
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path = [];
    const endps = [];
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]);
      v = endpoint[labelend[bv]];
      bv = inblossom[v];
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw] ^ 1);
      w = endpoint[labelend[bw]];
      bw = inblossom[w];
    }
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    label[b] = 1;
    labelend[b] = labelend[bb];
    dualvar[b] = 0n;
    const leaves = blossomLeaves(b, []);
    for (const x of leaves) {
      if (label[inblossom[x]] === 2) queue.push(x);
      inblossom[x] = b;
    }
    const bestedgeto = new Int32Array(n2).fill(-1);
    for (const bv2 of path) {
      let nblists;
      if (blossombestedges[bv2] === null) {
        nblists = [];
        for (const x of blossomLeaves(bv2, [])) {
          const lst = [];
          for (let i = nbStart[x]; i < nbStart[x + 1]; i++) lst.push(neighbend[i] >> 1);
          nblists.push(lst);
        }
      } else {
        nblists = [blossombestedges[bv2]];
      }
      for (const nblist of nblists) {
        for (const kk of nblist) {
          let i = endpoint[2 * kk];
          let j = endpoint[2 * kk + 1];
          if (inblossom[j] === b) { const t = i; i = j; j = t; }
          const bj = inblossom[j];
          if (bj !== b && label[bj] === 1 &&
              (bestedgeto[bj] === -1 || slack(kk) < slack(bestedgeto[bj]))) {
            bestedgeto[bj] = kk;
          }
        }
      }
      blossombestedges[bv2] = null;
      bestedge[bv2] = -1;
    }
    const best = [];
    for (let i = 0; i < n2; i++) if (bestedgeto[i] !== -1) best.push(bestedgeto[i]);
    blossombestedges[b] = best;
    bestedge[b] = -1;
    for (const kk of best) {
      if (bestedge[b] === -1 || slack(kk) < slack(bestedge[b])) bestedge[b] = kk;
    }
  }

  function expandBlossom(b, endstage) {
    for (const s of blossomchilds[b]) {
      blossomparent[s] = -1;
      if (s < nvertex) inblossom[s] = s;
      else if (endstage && dualvar[s] === 0n) expandBlossom(s, endstage);
      else for (const v of blossomLeaves(s, [])) inblossom[v] = s;
    }
    if (!endstage && label[b] === 2) {
      const childs = blossomchilds[b];
      const endps = blossomendps[b];
      const L = childs.length;
      const entrychild = inblossom[endpoint[labelend[b] ^ 1]];
      let j = childs.indexOf(entrychild);
      let jstep, endptrick;
      if (j & 1) { j -= L; jstep = 1; endptrick = 0; } else { jstep = -1; endptrick = 1; }
      const at = (arr, idx) => arr[((idx % L) + L) % L];
      let p = labelend[b];
      while (j !== 0) {
        label[endpoint[p ^ 1]] = 0;
        label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]] = 0;
        assignLabel(endpoint[p ^ 1], 2, p);
        allowedge[at(endps, j - endptrick) >> 1] = 1;
        j += jstep;
        p = at(endps, j - endptrick) ^ endptrick;
        allowedge[p >> 1] = 1;
        j += jstep;
      }
      let bv = at(childs, j);
      label[endpoint[p ^ 1]] = label[bv] = 2;
      labelend[endpoint[p ^ 1]] = labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (at(childs, j) !== entrychild) {
        bv = at(childs, j);
        if (label[bv] === 1) { j += jstep; continue; }
        let v = -1;
        for (const x of blossomLeaves(bv, [])) { if (label[x] !== 0) { v = x; break; } }
        if (v !== -1) {
          label[v] = 0;
          label[endpoint[mate[blossombase[bv]]]] = 0;
          assignLabel(v, 2, labelend[v]);
        }
        j += jstep;
      }
    }
    label[b] = labelend[b] = -1;
    label[b] = 0;
    blossomchilds[b] = blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  }

  function augmentBlossom(b, v) {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t];
    if (t >= nvertex) augmentBlossom(t, v);
    const childs = blossomchilds[b];
    const endps = blossomendps[b];
    const L = childs.length;
    const at = (arr, idx) => arr[((idx % L) + L) % L];
    const i = childs.indexOf(t);
    let j = i;
    let jstep, endptrick;
    if (i & 1) { j -= L; jstep = 1; endptrick = 0; } else { jstep = -1; endptrick = 1; }
    while (j !== 0) {
      j += jstep;
      t = at(childs, j);
      const p = at(endps, j - endptrick) ^ endptrick;
      if (t >= nvertex) augmentBlossom(t, endpoint[p]);
      j += jstep;
      t = at(childs, j);
      if (t >= nvertex) augmentBlossom(t, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1;
      mate[endpoint[p ^ 1]] = p;
    }
    blossomchilds[b] = childs.slice(i).concat(childs.slice(0, i));
    blossomendps[b] = endps.slice(i).concat(endps.slice(0, i));
    blossombase[b] = blossombase[blossomchilds[b][0]];
  }

  function augmentMatching(k) {
    const v0 = endpoint[2 * k];
    const w0 = endpoint[2 * k + 1];
    for (const [s0, p0] of [[v0, 2 * k + 1], [w0, 2 * k]]) {
      let s = s0;
      let p = p0;
      for (;;) {
        const bs = inblossom[s];
        if (bs >= nvertex) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const t = endpoint[labelend[bs]];
        const bt = inblossom[t];
        s = endpoint[labelend[bt]];
        const j = endpoint[labelend[bt] ^ 1];
        if (bt >= nvertex) augmentBlossom(bt, j);
        mate[j] = labelend[bt];
        p = labelend[bt] ^ 1;
      }
    }
  }

  for (let stage = 0; stage < nvertex; stage++) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = nvertex; b < n2; b++) blossombestedges[b] = null;
    allowedge.fill(0);
    queue = [];
    for (let v = 0; v < nvertex; v++) {
      if (mate[v] === -1 && label[inblossom[v]] === 0) assignLabel(v, 1, -1);
    }
    let augmented = false;
    for (;;) {
      while (queue.length && !augmented) {
        const v = queue.pop();
        for (let ii = nbStart[v]; ii < nbStart[v + 1]; ii++) {
          const p = neighbend[ii];
          const k = p >> 1;
          const w = endpoint[p];
          if (inblossom[v] === inblossom[w]) continue;
          let kslack = 0n;
          if (!allowedge[k]) {
            kslack = slack(k);
            if (kslack <= 0n) allowedge[k] = 1;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]] === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (label[inblossom[w]] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) addBlossom(base, k);
              else { augmentMatching(k); augmented = true; break; }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (label[inblossom[w]] === 1) {
            const b = inblossom[v];
            if (bestedge[b] === -1 || kslack < slack(bestedge[b])) bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || kslack < slack(bestedge[w])) bestedge[w] = k;
          }
        }
      }
      if (augmented) break;

      let deltatype = -1;
      let delta = 0n;
      let deltaedge = -1;
      let deltablossom = -1;
      // delta1: minimum vertex dual (no max-cardinality requirement)
      deltatype = 1;
      delta = dualvar[0];
      for (let v = 1; v < nvertex; v++) if (dualvar[v] < delta) delta = dualvar[v];
      for (let v = 0; v < nvertex; v++) {
        if (label[inblossom[v]] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]);
          if (d < delta) { delta = d; deltatype = 2; deltaedge = bestedge[v]; }
        }
      }
      for (let b = 0; b < n2; b++) {
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const d = slack(bestedge[b]) / 2n;
          if (d < delta) { delta = d; deltatype = 3; deltaedge = bestedge[b]; }
        }
      }
      for (let b = nvertex; b < n2; b++) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1 && label[b] === 2 && dualvar[b] < delta) {
          delta = dualvar[b]; deltatype = 4; deltablossom = b;
        }
      }
      for (let v = 0; v < nvertex; v++) {
        const l = label[inblossom[v]];
        if (l === 1) dualvar[v] -= delta;
        else if (l === 2) dualvar[v] += delta;
      }
      for (let b = nvertex; b < n2; b++) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] += delta;
          else if (label[b] === 2) dualvar[b] -= delta;
        }
      }
      if (deltatype === 1) break;
      else if (deltatype === 2) {
        allowedge[deltaedge] = 1;
        let i = endpoint[2 * deltaedge];
        let j = endpoint[2 * deltaedge + 1];
        if (label[inblossom[i]] === 0) { const t = i; i = j; j = t; }
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = 1;
        queue.push(endpoint[2 * deltaedge]);
      } else if (deltatype === 4) {
        expandBlossom(deltablossom, false);
      }
    }
    if (!augmented) break;
    for (let b = nvertex; b < n2; b++) {
      if (blossomparent[b] === -1 && blossombase[b] >= 0 && label[b] === 1 && dualvar[b] === 0n) {
        expandBlossom(b, true);
      }
    }
  }
  for (let v = 0; v < nvertex; v++) if (mate[v] >= 0) mateOut[v] = endpoint[mate[v]];
  return mateOut;
}
