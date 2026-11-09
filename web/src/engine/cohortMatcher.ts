import type {
  AllocatedTeam,
  AllocationFormat,
  CohortAllocationResult,
  GraphEdge,
  LouvainCommunity,
  StudentProfile,
} from './types';

interface BlossomNode {
  id: number;
  childs: number[];
  edges: Array<[number, number]>;
  mybestedges: Array<[number, number]> | null;
}

interface ScoredDraftTeam {
  memberIds: string[];
  isLockedCustomTeam: boolean;
  meanCompatibility: number;
  weakestCompatibility: number;
  internalWeightSum: number;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortIds(ids: readonly string[]): string[] {
  return [...ids].sort(compareIds);
}

function atMod<T>(arr: readonly T[], index: number): T {
  const len = arr.length;
  const mod = ((index % len) + len) % len;
  return arr[mod];
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Exact General-Graph Maximum-Cardinality Maximum-Weight Matching
 * using Jack Edmonds' Blossom & Zvi Galil's (1986) O(V^3) primal-dual algorithm
 * with exact safe-integer dual arithmetic (100% parity with NetworkX
 * `nx.max_weight_matching(G, maxcardinality=True, weight="weight")`).
 */
export function maxWeightCardinalityMatching(
  nodeIds: string[],
  edges: Array<{ source: string; target: string; weight: number }>,
): Array<[string, string]> {
  const uniqueNodes: string[] = [];
  const nodeIndex = new Map<string, number>();
  for (const rawId of nodeIds) {
    if (!nodeIndex.has(rawId)) {
      nodeIndex.set(rawId, uniqueNodes.length);
      uniqueNodes.push(rawId);
    }
  }

  const n = uniqueNodes.length;
  if (n < 2 || edges.length === 0) {
    return [];
  }

  const edgeKey = (u: number, v: number): number => (u < v ? u * n + v : v * n + u);

  const dedupRawWeights = new Map<number, { u: number; v: number; weight: number }>();
  let minRawWeight = Infinity;
  let maxRawWeight = -Infinity;

  for (const edge of edges) {
    if (!Number.isFinite(edge.weight)) {
      continue;
    }
    const u = nodeIndex.get(edge.source);
    const v = nodeIndex.get(edge.target);
    if (u === undefined || v === undefined || u === v) {
      continue;
    }
    const a = u < v ? u : v;
    const b = u < v ? v : u;
    const key = a * n + b;
    const prev = dedupRawWeights.get(key);
    if (prev === undefined || edge.weight > prev.weight) {
      dedupRawWeights.set(key, { u: a, v: b, weight: edge.weight });
    }
  }

  if (dedupRawWeights.size === 0) {
    return [];
  }

  for (const entry of dedupRawWeights.values()) {
    if (entry.weight < minRawWeight) {
      minRawWeight = entry.weight;
    }
    if (entry.weight > maxRawWeight) {
      maxRawWeight = entry.weight;
    }
  }

  // Shift and scale edge weights into exact positive safe integers so all
  // dual variables (2 * u_v), blossom duals, slacks, and deltas remain exact integers.
  const shift = minRawWeight >= -99.0 ? 100.0 : 100.0 - minRawWeight;
  const maxShifted = shift + maxRawWeight;
  const scale =
    maxShifted <= 1100.0
      ? 1_000_000_000
      : Math.max(1, Math.floor(1_000_000_000_000 / maxShifted));

  const adj: number[][] = Array.from({ length: n }, () => []);
  const intWeightMap = new Map<number, number>();
  let maxWeight = 0;

  for (const [key, entry] of dedupRawWeights.entries()) {
    const wInt = Math.max(1, Math.round((shift + entry.weight) * scale));
    intWeightMap.set(key, wInt);
    adj[entry.u].push(entry.v);
    adj[entry.v].push(entry.u);
    if (wInt > maxWeight) {
      maxWeight = wInt;
    }
  }

  const getEdgeWeight = (u: number, v: number): number => intWeightMap.get(edgeKey(u, v)) ?? 0;

  const mate = new Int32Array(n).fill(-1);
  const label = new Map<number, number>();
  const labeledge = new Map<number, [number, number] | null>();
  const inblossom = new Int32Array(n);
  const blossomparent = new Map<number, number | null>();
  const blossombase = new Map<number, number>();
  const bestedge = new Map<number, [number, number] | null>();
  const dualvar = new Float64Array(n).fill(maxWeight);
  const blossomdual = new Map<number, number>();
  const blossoms = new Map<number, BlossomNode>();
  const allowedge = new Set<number>();
  const queue: number[] = [];

  for (let v = 0; v < n; v += 1) {
    inblossom[v] = v;
    blossomparent.set(v, null);
    blossombase.set(v, v);
  }

  let nextBlossomId = n;

  const getLabel = (id: number): number => label.get(id) ?? 0;

  const slack = (v: number, w: number): number =>
    dualvar[v] + dualvar[w] - 2 * getEdgeWeight(v, w);

  const blossomLeaves = (bId: number): number[] => {
    const bObj = blossoms.get(bId);
    if (!bObj) {
      return [bId];
    }
    const leaves: number[] = [];
    const stack: number[] = [...bObj.childs];
    while (stack.length > 0) {
      const t = stack.pop();
      if (t === undefined) {
        break;
      }
      const sub = blossoms.get(t);
      if (sub) {
        stack.push(...sub.childs);
      } else {
        leaves.push(t);
      }
    }
    return leaves;
  };

  const assignLabel = (w: number, t: 1 | 2, v: number | null): void => {
    const b = inblossom[w];
    label.set(w, t);
    label.set(b, t);
    if (v !== null) {
      const edge: [number, number] = [v, w];
      labeledge.set(w, edge);
      labeledge.set(b, edge);
    } else {
      labeledge.set(w, null);
      labeledge.set(b, null);
    }
    bestedge.set(w, null);
    bestedge.set(b, null);
    if (t === 1) {
      if (blossoms.has(b)) {
        queue.push(...blossomLeaves(b));
      } else {
        queue.push(b);
      }
    } else {
      const base = blossombase.get(b);
      if (base === undefined) {
        throw new Error('Missing blossom base during T-label assignment.');
      }
      const partner = mate[base];
      if (partner < 0) {
        throw new Error('Expected matched blossom base during T-label assignment.');
      }
      assignLabel(partner, 1, base);
    }
  };

  const scanBlossom = (vInit: number, wInit: number): number => {
    const path: number[] = [];
    let base = -1;
    let v = vInit;
    let w = wInit;
    while (v !== -1) {
      let b = inblossom[v];
      if ((getLabel(b) & 4) !== 0) {
        const foundBase = blossombase.get(b);
        if (foundBase === undefined) {
          throw new Error('Missing blossom base in scanBlossom.');
        }
        base = foundBase;
        break;
      }
      path.push(b);
      label.set(b, 5);
      const leB = labeledge.get(b) ?? null;
      if (leB === null) {
        v = -1;
      } else {
        v = leB[0];
        b = inblossom[v];
        const leT = labeledge.get(b);
        if (!leT) {
          throw new Error('Missing T-blossom labeledge in scanBlossom.');
        }
        v = leT[0];
      }
      if (w !== -1) {
        const tmp = v;
        v = w;
        w = tmp;
      }
    }
    for (const b of path) {
      label.set(b, 1);
    }
    return base;
  };

  const addBlossom = (base: number, vInit: number, wInit: number): void => {
    const bb = inblossom[base];
    let v = vInit;
    let w = wInit;
    let bv = inblossom[v];
    let bw = inblossom[w];
    const bId = nextBlossomId;
    nextBlossomId += 1;

    const path: number[] = [];
    const edgs: Array<[number, number]> = [[v, w]];
    const bNode: BlossomNode = {
      id: bId,
      childs: path,
      edges: edgs,
      mybestedges: null,
    };
    blossoms.set(bId, bNode);
    blossombase.set(bId, base);
    blossomparent.set(bId, null);
    blossomparent.set(bb, bId);

    while (bv !== bb) {
      blossomparent.set(bv, bId);
      path.push(bv);
      const le = labeledge.get(bv);
      if (!le) {
        throw new Error('Missing labeledge while tracing v in addBlossom.');
      }
      edgs.push(le);
      v = le[0];
      bv = inblossom[v];
    }
    path.push(bb);
    path.reverse();
    edgs.reverse();

    while (bw !== bb) {
      blossomparent.set(bw, bId);
      path.push(bw);
      const le = labeledge.get(bw);
      if (!le) {
        throw new Error('Missing labeledge while tracing w in addBlossom.');
      }
      edgs.push([le[1], le[0]]);
      w = le[0];
      bw = inblossom[w];
    }

    label.set(bId, 1);
    labeledge.set(bId, labeledge.get(bb) ?? null);
    blossomdual.set(bId, 0);

    for (const leaf of blossomLeaves(bId)) {
      if (getLabel(inblossom[leaf]) === 2) {
        queue.push(leaf);
      }
      inblossom[leaf] = bId;
    }

    const bestedgeto = new Map<number, [number, number]>();
    for (const sub of path) {
      const subNode = blossoms.get(sub);
      let nblist: Array<[number, number]>;
      if (subNode) {
        if (subNode.mybestedges !== null) {
          nblist = subNode.mybestedges;
          subNode.mybestedges = null;
        } else {
          nblist = [];
          for (const leaf of blossomLeaves(sub)) {
            for (const nb of adj[leaf]) {
              nblist.push([leaf, nb]);
            }
          }
        }
      } else {
        nblist = [];
        for (const nb of adj[sub]) {
          nblist.push([sub, nb]);
        }
      }

      for (const pair of nblist) {
        let [i, j] = pair;
        if (inblossom[j] === bId) {
          const tmp = i;
          i = j;
          j = tmp;
        }
        const bj = inblossom[j];
        if (bj !== bId && getLabel(bj) === 1) {
          const prev = bestedgeto.get(bj);
          if (prev === undefined || slack(i, j) < slack(prev[0], prev[1])) {
            bestedgeto.set(bj, [i, j]);
          }
        }
      }
      bestedge.set(sub, null);
    }

    const mybestedges = Array.from(bestedgeto.values());
    bNode.mybestedges = mybestedges;
    let mybestedge: [number, number] | null = null;
    let mybestslack = 0;
    for (const edge of mybestedges) {
      const kslack = slack(edge[0], edge[1]);
      if (mybestedge === null || kslack < mybestslack) {
        mybestedge = edge;
        mybestslack = kslack;
      }
    }
    bestedge.set(bId, mybestedge);
  };

  const expandBlossom = (bId: number, endstage: boolean): void => {
    const bNode = blossoms.get(bId);
    if (!bNode) {
      return;
    }

    for (const s of bNode.childs) {
      blossomparent.set(s, null);
      if (blossoms.has(s)) {
        if (endstage && blossomdual.get(s) === 0) {
          expandBlossom(s, endstage);
        } else {
          for (const leaf of blossomLeaves(s)) {
            inblossom[leaf] = s;
          }
        }
      } else {
        inblossom[s] = s;
      }
    }

    if (!endstage && getLabel(bId) === 2) {
      const bLabelEdge = labeledge.get(bId);
      if (!bLabelEdge) {
        throw new Error('Missing labeledge on expanding T-blossom.');
      }
      const entrychild = inblossom[bLabelEdge[1]];
      let j = bNode.childs.indexOf(entrychild);
      let jstep: number;
      if ((j & 1) !== 0) {
        j -= bNode.childs.length;
        jstep = 1;
      } else {
        jstep = -1;
      }

      let [v, w] = bLabelEdge;
      while (j !== 0) {
        let p: number;
        let q: number;
        if (jstep === 1) {
          [p, q] = atMod(bNode.edges, j);
        } else {
          [q, p] = atMod(bNode.edges, j - 1);
        }
        label.delete(w);
        label.delete(q);
        assignLabel(w, 2, v);
        allowedge.add(edgeKey(p, q));
        j += jstep;
        if (jstep === 1) {
          [v, w] = atMod(bNode.edges, j);
        } else {
          [w, v] = atMod(bNode.edges, j - 1);
        }
        allowedge.add(edgeKey(v, w));
        j += jstep;
      }

      const bw = atMod(bNode.childs, j);
      label.set(w, 2);
      label.set(bw, 2);
      const baseEdge: [number, number] = [v, w];
      labeledge.set(w, baseEdge);
      labeledge.set(bw, baseEdge);
      bestedge.set(bw, null);

      j += jstep;
      while (atMod(bNode.childs, j) !== entrychild) {
        const bv = atMod(bNode.childs, j);
        if (getLabel(bv) === 1) {
          j += jstep;
          continue;
        }
        let reachableLeaf: number | null = null;
        if (blossoms.has(bv)) {
          for (const leaf of blossomLeaves(bv)) {
            if (getLabel(leaf) !== 0) {
              reachableLeaf = leaf;
              break;
            }
          }
        } else if (getLabel(bv) !== 0) {
          reachableLeaf = bv;
        }
        if (reachableLeaf !== null) {
          const leafEdge = labeledge.get(reachableLeaf);
          const bvBase = blossombase.get(bv);
          if (!leafEdge || bvBase === undefined) {
            throw new Error('Missing labeledge or base while relabeling expanded blossom.');
          }
          label.delete(reachableLeaf);
          label.delete(mate[bvBase]);
          assignLabel(reachableLeaf, 2, leafEdge[0]);
        }
        j += jstep;
      }
    }

    label.delete(bId);
    labeledge.delete(bId);
    bestedge.delete(bId);
    blossomparent.delete(bId);
    blossombase.delete(bId);
    blossomdual.delete(bId);
    blossoms.delete(bId);
  };

  const augmentBlossom = (bId: number, v: number): void => {
    const bNode = blossoms.get(bId);
    if (!bNode) {
      return;
    }
    let t = v;
    while (blossomparent.get(t) !== bId) {
      const parent = blossomparent.get(t);
      if (parent === null || parent === undefined) {
        throw new Error('Broken blossomparent chain in augmentBlossom.');
      }
      t = parent;
    }
    if (blossoms.has(t)) {
      augmentBlossom(t, v);
    }

    const i = bNode.childs.indexOf(t);
    let j = i;
    let jstep: number;
    if ((i & 1) !== 0) {
      j -= bNode.childs.length;
      jstep = 1;
    } else {
      jstep = -1;
    }

    while (j !== 0) {
      j += jstep;
      t = atMod(bNode.childs, j);
      let w: number;
      let x: number;
      if (jstep === 1) {
        [w, x] = atMod(bNode.edges, j);
      } else {
        [x, w] = atMod(bNode.edges, j - 1);
      }
      if (blossoms.has(t)) {
        augmentBlossom(t, w);
      }
      j += jstep;
      t = atMod(bNode.childs, j);
      if (blossoms.has(t)) {
        augmentBlossom(t, x);
      }
      mate[w] = x;
      mate[x] = w;
    }

    bNode.childs = bNode.childs.slice(i).concat(bNode.childs.slice(0, i));
    bNode.edges = bNode.edges.slice(i).concat(bNode.edges.slice(0, i));
    const newBase = blossombase.get(bNode.childs[0]);
    if (newBase === undefined) {
      throw new Error('Missing new blossom base after rotation.');
    }
    blossombase.set(bId, newBase);
  };

  const augmentMatching = (v: number, w: number): void => {
    const directions: Array<[number, number]> = [
      [v, w],
      [w, v],
    ];
    for (const [sInit, jInit] of directions) {
      let s = sInit;
      let j = jInit;
      while (true) {
        const bs = inblossom[s];
        if (blossoms.has(bs)) {
          augmentBlossom(bs, s);
        }
        mate[s] = j;
        const leBs = labeledge.get(bs) ?? null;
        if (leBs === null) {
          break;
        }
        const t = leBs[0];
        const bt = inblossom[t];
        const leBt = labeledge.get(bt);
        if (!leBt) {
          throw new Error('Missing T-blossom labeledge in augmentMatching.');
        }
        s = leBt[0];
        j = leBt[1];
        if (blossoms.has(bt)) {
          augmentBlossom(bt, j);
        }
        mate[j] = s;
      }
    }
  };

  // Main primal-dual stages (maxcardinality = true)
  while (true) {
    label.clear();
    labeledge.clear();
    bestedge.clear();
    for (const bId of blossomdual.keys()) {
      const bNode = blossoms.get(bId);
      if (bNode) {
        bNode.mybestedges = null;
      }
    }
    allowedge.clear();
    queue.length = 0;

    for (let v = 0; v < n; v += 1) {
      if (mate[v] === -1 && getLabel(inblossom[v]) === 0) {
        assignLabel(v, 1, null);
      }
    }

    let augmented = false;
    while (true) {
      while (queue.length > 0 && !augmented) {
        const v = queue.pop();
        if (v === undefined) {
          break;
        }
        for (const w of adj[v]) {
          const bv = inblossom[v];
          const bw = inblossom[w];
          if (bv === bw) {
            continue;
          }
          const eKey = edgeKey(v, w);
          let kslack = 0;
          if (!allowedge.has(eKey)) {
            kslack = slack(v, w);
            if (kslack <= 0) {
              allowedge.add(eKey);
            }
          }
          if (allowedge.has(eKey)) {
            const bwLabel = getLabel(bw);
            if (bwLabel === 0) {
              assignLabel(w, 2, v);
            } else if (bwLabel === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) {
                addBlossom(base, v, w);
              } else {
                augmentMatching(v, w);
                augmented = true;
                break;
              }
            } else if (getLabel(w) === 0) {
              label.set(w, 2);
              labeledge.set(w, [v, w]);
            }
          } else if (getLabel(bw) === 1) {
            const curBest = bestedge.get(bv) ?? null;
            if (curBest === null || kslack < slack(curBest[0], curBest[1])) {
              bestedge.set(bv, [v, w]);
            }
          } else if (getLabel(w) === 0) {
            const curBest = bestedge.get(w) ?? null;
            if (curBest === null || kslack < slack(curBest[0], curBest[1])) {
              bestedge.set(w, [v, w]);
            }
          }
        }
      }

      if (augmented) {
        break;
      }

      let deltatype = -1;
      let delta = 0;
      let deltaedge: [number, number] | null = null;
      let deltablossom = -1;

      // delta2: minimum slack on any edge between an S-vertex and a free vertex
      for (let v = 0; v < n; v += 1) {
        if (getLabel(inblossom[v]) === 0) {
          const be = bestedge.get(v) ?? null;
          if (be !== null) {
            const d = slack(be[0], be[1]);
            if (deltatype === -1 || d < delta) {
              delta = d;
              deltatype = 2;
              deltaedge = be;
            }
          }
        }
      }

      // delta3: half the minimum slack on any edge between two top-level S-blossoms
      for (const [b, parent] of blossomparent.entries()) {
        if (parent === null && getLabel(b) === 1) {
          const be = bestedge.get(b) ?? null;
          if (be !== null) {
            const d = slack(be[0], be[1]) / 2;
            if (deltatype === -1 || d < delta) {
              delta = d;
              deltatype = 3;
              deltaedge = be;
            }
          }
        }
      }

      // delta4: minimum dual z-variable of any top-level T-blossom
      for (const [b, bDual] of blossomdual.entries()) {
        if (
          blossomparent.get(b) === null &&
          getLabel(b) === 2 &&
          (deltatype === -1 || bDual < delta)
        ) {
          delta = bDual;
          deltatype = 4;
          deltablossom = b;
        }
      }

      // maxcardinality = true: if no delta2/delta3/delta4, maximum cardinality optimum reached
      if (deltatype === -1) {
        deltatype = 1;
        let minDual = dualvar[0];
        for (let v = 1; v < n; v += 1) {
          if (dualvar[v] < minDual) {
            minDual = dualvar[v];
          }
        }
        delta = Math.max(0, minDual);
      }

      for (let v = 0; v < n; v += 1) {
        const lbl = getLabel(inblossom[v]);
        if (lbl === 1) {
          dualvar[v] -= delta;
        } else if (lbl === 2) {
          dualvar[v] += delta;
        }
      }

      for (const [b, bDual] of blossomdual.entries()) {
        if (blossomparent.get(b) === null) {
          const lbl = getLabel(b);
          if (lbl === 1) {
            blossomdual.set(b, bDual + delta);
          } else if (lbl === 2) {
            blossomdual.set(b, bDual - delta);
          }
        }
      }

      if (deltatype === 1) {
        break;
      } else if (deltatype === 2 || deltatype === 3) {
        if (deltaedge !== null) {
          const [ev, ew] = deltaedge;
          allowedge.add(edgeKey(ev, ew));
          queue.push(ev);
        }
      } else if (deltatype === 4) {
        expandBlossom(deltablossom, false);
      }
    }

    if (!augmented) {
      break;
    }

    for (const b of Array.from(blossomdual.keys())) {
      if (!blossomdual.has(b)) {
        continue;
      }
      if (blossomparent.get(b) === null && getLabel(b) === 1 && blossomdual.get(b) === 0) {
        expandBlossom(b, true);
      }
    }
  }

  const pairs: Array<[string, string]> = [];
  for (let u = 0; u < n; u += 1) {
    const v = mate[u];
    if (v > u) {
      const idU = uniqueNodes[u];
      const idV = uniqueNodes[v];
      pairs.push(idU < idV ? [idU, idV] : [idV, idU]);
    }
  }

  pairs.sort((a, b) => compareIds(a[0], b[0]) || compareIds(a[1], b[1]));
  return pairs;
}

function getPairCompat(
  compatMatrix: Record<string, Record<string, number>>,
  studentA: string,
  studentB: string,
): number {
  if (studentA === studentB) {
    return 1.0;
  }
  return compatMatrix[studentA]?.[studentB] ?? compatMatrix[studentB]?.[studentA] ?? 0.0;
}

function scoreDraftTeam(
  memberIds: readonly string[],
  isLockedCustomTeam: boolean,
  compatMatrix: Record<string, Record<string, number>>,
): ScoredDraftTeam {
  const sortedMembers = sortIds(memberIds);
  const k = sortedMembers.length;
  if (k <= 1) {
    return {
      memberIds: sortedMembers,
      isLockedCustomTeam,
      meanCompatibility: 1.0,
      weakestCompatibility: 1.0,
      internalWeightSum: 0.0,
    };
  }

  let weightSum = 0.0;
  let minPair = Infinity;
  let pairCount = 0;

  for (let i = 0; i < k; i += 1) {
    for (let j = i + 1; j < k; j += 1) {
      const w = getPairCompat(compatMatrix, sortedMembers[i], sortedMembers[j]);
      weightSum += w;
      if (w < minPair) {
        minPair = w;
      }
      pairCount += 1;
    }
  }

  return {
    memberIds: sortedMembers,
    isLockedCustomTeam,
    meanCompatibility: weightSum / pairCount,
    weakestCompatibility: minPair,
    internalWeightSum: weightSum,
  };
}

function formatTeamClusterAlignment(
  memberIds: readonly string[],
  communities: readonly LouvainCommunity[],
  nodeToCommunity: Record<string, number>,
): string {
  const uniqueIndices = new Set<number>();
  for (const id of memberIds) {
    const idx = nodeToCommunity[id];
    if (typeof idx === 'number' && Number.isFinite(idx)) {
      uniqueIndices.add(idx);
    }
  }

  const sortedIndices = Array.from(uniqueIndices).sort((a, b) => a - b);
  if (sortedIndices.length === 0) {
    return 'Unassigned';
  }

  const codeByIndex = new Map<number, string>();
  for (const comm of communities) {
    codeByIndex.set(comm.index, comm.code);
  }

  const codes = sortedIndices.map(
    (idx) => codeByIndex.get(idx) ?? communities[idx]?.code ?? `C${idx + 1}`,
  );

  if (codes.length === 1) {
    return `Intra-${codes[0]}`;
  }
  if (codes.length === 2) {
    return `Cross (${codes[0]} ↔ ${codes[1]})`;
  }
  return `Cross (${codes.join(' · ')})`;
}

function formatTeamSizeLabel(size: number): 'Dyad (2)' | 'Triad (3)' | 'Quartet (4)' {
  if (size <= 2) {
    return 'Dyad (2)';
  }
  if (size === 3) {
    return 'Triad (3)';
  }
  return 'Quartet (4)';
}

function computePartitionSizes(m: number, format: 'trios' | 'quartets'): number[] {
  if (m <= 0) {
    return [];
  }
  if (m < 2) {
    return [m];
  }

  if (format === 'trios') {
    const rem = m % 3;
    if (rem === 0) {
      return new Array<number>(m / 3).fill(3);
    }
    if (rem === 1) {
      // m >= 4 since m >= 2 and m % 3 === 1
      return [4, ...new Array<number>((m - 4) / 3).fill(3)];
    }
    // rem === 2
    return [...new Array<number>((m - 2) / 3).fill(3), 2];
  }

  // format === 'quartets'
  const rem = m % 4;
  if (rem === 0) {
    return new Array<number>(m / 4).fill(4);
  }
  if (rem === 3) {
    return [...new Array<number>(Math.floor(m / 4)).fill(4), 3];
  }
  if (rem === 2) {
    if (m >= 6) {
      return [...new Array<number>((m - 6) / 4).fill(4), 3, 3];
    }
    return [2];
  }
  // rem === 1
  if (m >= 9) {
    return [...new Array<number>((m - 9) / 4).fill(4), 3, 3, 3];
  }
  return [3, 2];
}

function optimizeMultiPersonTeams(
  remIds: readonly string[],
  teamSizes: readonly number[],
  compatMatrix: Record<string, Record<string, number>>,
): string[][] {
  const m = remIds.length;
  const teamCount = teamSizes.length;
  if (m === 0 || teamCount === 0) {
    return [];
  }
  if (teamCount === 1) {
    return [sortIds(remIds)];
  }

  const pairWeights = new Float64Array(m * m);
  const avgCompat = new Float64Array(m);
  for (let i = 0; i < m; i += 1) {
    let rowSum = 0.0;
    for (let j = 0; j < m; j += 1) {
      if (i === j) {
        pairWeights[i * m + j] = 1.0;
      } else {
        const w = getPairCompat(compatMatrix, remIds[i], remIds[j]);
        pairWeights[i * m + j] = w;
        rowSum += w;
      }
    }
    avgCompat[i] = m > 1 ? rowSum / (m - 1) : 1.0;
  }

  const evalTeamIndices = (team: readonly number[]): { mean: number; weakest: number } => {
    const k = team.length;
    if (k <= 1) {
      return { mean: 1.0, weakest: 1.0 };
    }
    let sum = 0.0;
    let weakest = Infinity;
    let count = 0;
    for (let i = 0; i < k; i += 1) {
      const rowOffset = team[i] * m;
      for (let j = i + 1; j < k; j += 1) {
        const w = pairWeights[rowOffset + team[j]];
        sum += w;
        if (w < weakest) {
          weakest = w;
        }
        count += 1;
      }
    }
    return { mean: sum / count, weakest };
  };

  const evalGlobalObjective = (
    teamMeans: Float64Array,
    teamWeakest: Float64Array,
  ): number => {
    let sumMean = 0.0;
    let minWeakest = Infinity;
    for (let t = 0; t < teamCount; t += 1) {
      sumMean += teamMeans[t];
      if (teamWeakest[t] < minWeakest) {
        minWeakest = teamWeakest[t];
      }
    }
    return sumMean / teamCount + 0.25 * minWeakest;
  };

  let bestPartition: number[][] | null = null;
  let bestObjective = -Infinity;

  const NUM_STARTS = 16;
  for (let startIdx = 0; startIdx < NUM_STARTS; startIdx += 1) {
    const rng = createMulberry32((0x9e3779b9 * (startIdx + 1)) >>> 0);
    const perm = Array.from({ length: m }, (_, idx) => idx);

    if (startIdx === 0) {
      // Seed 0: prioritize hardest-to-place anchors first (lowest mean compatibility)
      perm.sort((a, b) => avgCompat[a] - avgCompat[b] || a - b);
    } else {
      for (let i = m - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = perm[i];
        perm[i] = perm[j];
        perm[j] = tmp;
      }
    }

    const assigned = new Uint8Array(m);
    const teams: number[][] = [];
    let permCursor = 0;

    for (const targetSize of teamSizes) {
      while (permCursor < m && assigned[perm[permCursor]] === 1) {
        permCursor += 1;
      }
      const anchor = perm[permCursor];
      assigned[anchor] = 1;
      const currentTeam: number[] = [anchor];

      while (currentTeam.length < targetSize) {
        let bestCand = -1;
        let bestCandScore = -Infinity;

        for (let step = 0; step < m; step += 1) {
          const cand = perm[step];
          if (assigned[cand] === 1) {
            continue;
          }
          currentTeam.push(cand);
          const stats = evalTeamIndices(currentTeam);
          currentTeam.pop();

          const composite = 0.75 * stats.mean + 0.25 * stats.weakest;
          if (composite > bestCandScore + 1e-12) {
            bestCandScore = composite;
            bestCand = cand;
          }
        }

        if (bestCand === -1) {
          break;
        }
        assigned[bestCand] = 1;
        currentTeam.push(bestCand);
      }

      teams.push(currentTeam);
    }

    const teamMeans = new Float64Array(teamCount);
    const teamWeakest = new Float64Array(teamCount);
    for (let t = 0; t < teamCount; t += 1) {
      const stats = evalTeamIndices(teams[t]);
      teamMeans[t] = stats.mean;
      teamWeakest[t] = stats.weakest;
    }

    let currentObj = evalGlobalObjective(teamMeans, teamWeakest);

    // Iterative 2-swap local search until strict local optimum
    let improved = true;
    while (improved) {
      improved = false;
      for (let a = 0; a < teamCount; a += 1) {
        const teamA = teams[a];
        for (let b = a + 1; b < teamCount; b += 1) {
          const teamB = teams[b];
          for (let i = 0; i < teamA.length; i += 1) {
            for (let j = 0; j < teamB.length; j += 1) {
              const u = teamA[i];
              const v = teamB[j];
              teamA[i] = v;
              teamB[j] = u;

              const statsA = evalTeamIndices(teamA);
              const statsB = evalTeamIndices(teamB);
              const prevMeanA = teamMeans[a];
              const prevWeakA = teamWeakest[a];
              const prevMeanB = teamMeans[b];
              const prevWeakB = teamWeakest[b];

              teamMeans[a] = statsA.mean;
              teamWeakest[a] = statsA.weakest;
              teamMeans[b] = statsB.mean;
              teamWeakest[b] = statsB.weakest;

              const candObj = evalGlobalObjective(teamMeans, teamWeakest);
              if (candObj - currentObj > 1e-9) {
                currentObj = candObj;
                improved = true;
              } else {
                teamA[i] = u;
                teamB[j] = v;
                teamMeans[a] = prevMeanA;
                teamWeakest[a] = prevWeakA;
                teamMeans[b] = prevMeanB;
                teamWeakest[b] = prevWeakB;
              }
            }
          }
        }
      }
    }

    if (currentObj > bestObjective + 1e-12) {
      bestObjective = currentObj;
      bestPartition = teams.map((t) => [...t]);
    }
  }

  if (!bestPartition) {
    return [sortIds(remIds)];
  }

  return bestPartition.map((teamIndices) =>
    sortIds(teamIndices.map((idx) => remIds[idx])),
  );
}

function describePartitionCounts(teams: readonly ScoredDraftTeam[]): string {
  let quartets = 0;
  let triads = 0;
  let dyads = 0;
  for (const t of teams) {
    if (t.isLockedCustomTeam) {
      continue;
    }
    if (t.memberIds.length >= 4) {
      quartets += 1;
    } else if (t.memberIds.length === 3) {
      triads += 1;
    } else if (t.memberIds.length === 2) {
      dyads += 1;
    }
  }
  const parts: string[] = [];
  if (quartets > 0) {
    parts.push(`${quartets} quartet${quartets > 1 ? 's' : ''}`);
  }
  if (triads > 0) {
    parts.push(`${triads} triad${triads > 1 ? 's' : ''}`);
  }
  if (dyads > 0) {
    parts.push(`${dyads} dyad${dyads > 1 ? 's' : ''}`);
  }
  return parts.join(' + ');
}

export function computeCohortAllocation(params: {
  format: AllocationFormat;
  lockedTeamIds?: string[] | null;
  students: StudentProfile[];
  compatMatrix: Record<string, Record<string, number>>;
  compatEdges: GraphEdge[];
  communities: LouvainCommunity[];
  nodeToCommunity: Record<string, number>;
}): CohortAllocationResult {
  const {
    format,
    lockedTeamIds,
    students,
    compatMatrix,
    compatEdges,
    communities,
    nodeToCommunity,
  } = params;

  if (students.length === 0) {
    return {
      format,
      lockedTeamIds: null,
      teams: [],
      meanCohortCompatibility: 0.0,
      minTeamCompatibility: 0.0,
      maxTeamCompatibility: 0.0,
      totalEdgeWeight: 0.0,
      methodologyNote: 'Empty cohort: no student profiles available for allocation.',
    };
  }

  const validStudentIds = new Set(students.map((s) => s.id));
  const dedupLocked: string[] = [];
  if (lockedTeamIds && lockedTeamIds.length > 0) {
    const seen = new Set<string>();
    for (const id of lockedTeamIds) {
      if (validStudentIds.has(id) && !seen.has(id)) {
        seen.add(id);
        dedupLocked.push(id);
      }
    }
  }

  const canLockCustomTeam =
    dedupLocked.length >= 2 &&
    dedupLocked.length <= 4 &&
    students.length - dedupLocked.length !== 1;

  const effectiveLockedIds = canLockCustomTeam ? sortIds(dedupLocked) : null;
  const lockedSet = new Set(effectiveLockedIds ?? []);
  const remIds = students.map((s) => s.id).filter((id) => !lockedSet.has(id));

  const draftTeams: ScoredDraftTeam[] = [];
  if (effectiveLockedIds !== null) {
    draftTeams.push(scoreDraftTeam(effectiveLockedIds, true, compatMatrix));
  }

  let methodologyNote = '';

  if (format === 'dyads') {
    let usedCompleteFallback = false;
    let absorbedOddTriad = false;

    if (remIds.length === 1) {
      draftTeams.push(scoreDraftTeam(remIds, false, compatMatrix));
    } else if (remIds.length >= 2) {
      const remSet = new Set(remIds);
      const inducedCompatEdges = compatEdges.filter(
        (e) => remSet.has(e.source) && remSet.has(e.target),
      );

      let matching = maxWeightCardinalityMatching(remIds, inducedCompatEdges);
      const targetPairs = Math.floor(remIds.length / 2);

      if (matching.length < targetPairs) {
        const completeEdges: Array<{ source: string; target: string; weight: number }> = [];
        for (let i = 0; i < remIds.length; i += 1) {
          for (let j = i + 1; j < remIds.length; j += 1) {
            completeEdges.push({
              source: remIds[i],
              target: remIds[j],
              weight: getPairCompat(compatMatrix, remIds[i], remIds[j]),
            });
          }
        }
        matching = maxWeightCardinalityMatching(remIds, completeEdges);
        usedCompleteFallback = true;
      }

      let absorbedPairKey: string | null = null;
      let triadDraft: ScoredDraftTeam | null = null;

      if (remIds.length % 2 === 1 && matching.length > 0) {
        const matchedNodes = new Set<string>();
        for (const [u, v] of matching) {
          matchedNodes.add(u);
          matchedNodes.add(v);
        }
        const unmatched = remIds.filter((id) => !matchedNodes.has(id)).sort(compareIds);
        if (unmatched.length > 0) {
          const u = unmatched[0];
          let bestPair: [string, string] = matching[0];
          let bestTriadMean = -Infinity;

          for (const [p0, p1] of matching) {
            const triadMean =
              (getPairCompat(compatMatrix, p0, p1) +
                getPairCompat(compatMatrix, u, p0) +
                getPairCompat(compatMatrix, u, p1)) /
              3.0;
            if (triadMean > bestTriadMean) {
              bestTriadMean = triadMean;
              bestPair = [p0, p1];
            }
          }

          absorbedPairKey = `${bestPair[0]}::${bestPair[1]}`;
          triadDraft = scoreDraftTeam([bestPair[0], bestPair[1], u], false, compatMatrix);
          absorbedOddTriad = true;
        }
      }

      const dyadDrafts: ScoredDraftTeam[] = [];
      for (const [p0, p1] of matching) {
        if (`${p0}::${p1}` === absorbedPairKey) {
          continue;
        }
        dyadDrafts.push(scoreDraftTeam([p0, p1], false, compatMatrix));
      }

      dyadDrafts.sort(
        (a, b) =>
          b.meanCompatibility - a.meanCompatibility ||
          compareIds(a.memberIds[0], b.memberIds[0]) ||
          compareIds(a.memberIds[1], b.memberIds[1]),
      );

      draftTeams.push(...dyadDrafts);
      if (triadDraft !== null) {
        draftTeams.push(triadDraft);
      }
    }

    const graphLabel = usedCompleteFallback
      ? `complete compatibility graph K_${remIds.length} (fallback after sparse node isolation)`
      : 'sparse 4-NN compatibility graph G_compat';
    const lockPrefix =
      effectiveLockedIds !== null
        ? `Locked custom Team 01 (${effectiveLockedIds.length} members), followed by `
        : '';
    const oddSuffix = absorbedOddTriad
      ? ', plus two-stage max-mean triad absorption for the odd cohort remainder to preserve max-min fairness.'
      : '.';
    methodologyNote = `${lockPrefix}Exact Edmonds' Blossom maximum-weight cardinality matching (O(V³) primal-dual) on ${graphLabel}${oddSuffix}`;
  } else {
    if (remIds.length >= 2) {
      const partitionSizes = computePartitionSizes(remIds.length, format);
      const optimizedMemberGroups = optimizeMultiPersonTeams(
        remIds,
        partitionSizes,
        compatMatrix,
      );
      const optimizedDrafts = optimizedMemberGroups.map((members) =>
        scoreDraftTeam(members, false, compatMatrix),
      );
      optimizedDrafts.sort(
        (a, b) =>
          b.memberIds.length - a.memberIds.length ||
          b.meanCompatibility - a.meanCompatibility ||
          compareIds(a.memberIds[0], b.memberIds[0]),
      );
      draftTeams.push(...optimizedDrafts);
    } else if (remIds.length === 1) {
      draftTeams.push(scoreDraftTeam(remIds, false, compatMatrix));
    }

    const partitionSummary = describePartitionCounts(draftTeams);
    const lockPrefix =
      effectiveLockedIds !== null
        ? `Locked custom Team 01 (${effectiveLockedIds.length} members); remaining ${remIds.length} students partitioned into ${partitionSummary} via `
        : `Cohort partitioned into ${partitionSummary} via `;
    methodologyNote = `${lockPrefix}16-start deterministic max-min greedy seeding + iterative 2-swap local search maximizing mean cohesion and weakest-link fairness.`;
  }

  const teams: AllocatedTeam[] = draftTeams.map((draft, idx) => {
    const rankStr = String(idx + 1).padStart(2, '0');
    return {
      id: `team-${rankStr}`,
      name: `Team ${rankStr}`,
      format: formatTeamSizeLabel(draft.memberIds.length),
      memberIds: draft.memberIds,
      isLockedCustomTeam: draft.isLockedCustomTeam,
      meanCompatibility: draft.meanCompatibility,
      weakestCompatibility: draft.weakestCompatibility,
      clusterAlignment: formatTeamClusterAlignment(
        draft.memberIds,
        communities,
        nodeToCommunity,
      ),
    };
  });

  let sumTeamMean = 0.0;
  let minTeamMean = Infinity;
  let maxTeamMean = -Infinity;
  let totalEdgeWeight = 0.0;

  for (let i = 0; i < teams.length; i += 1) {
    const mCompat = teams[i].meanCompatibility;
    sumTeamMean += mCompat;
    if (mCompat < minTeamMean) {
      minTeamMean = mCompat;
    }
    if (mCompat > maxTeamMean) {
      maxTeamMean = mCompat;
    }
    totalEdgeWeight += draftTeams[i].internalWeightSum;
  }

  return {
    format,
    lockedTeamIds: effectiveLockedIds,
    teams,
    meanCohortCompatibility: teams.length > 0 ? sumTeamMean / teams.length : 0.0,
    minTeamCompatibility: teams.length > 0 ? minTeamMean : 0.0,
    maxTeamCompatibility: teams.length > 0 ? maxTeamMean : 0.0,
    totalEdgeWeight,
    methodologyNote,
  };
}
