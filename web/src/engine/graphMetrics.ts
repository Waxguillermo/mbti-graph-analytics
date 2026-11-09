import { LOUVAIN_CLUSTER_PALETTE, MBTI_TYPES } from './mbtiMetadata';
import type {
  GraphEdge,
  GraphModelId,
  GraphTopologySummary,
  LouvainCommunity,
  MbtiGroupKey,
  NodeCentrality,
  StudentProfile,
  TraitVector,
} from './types';

const MODEL_METADATA: Record<
  GraphModelId,
  { title: string; subtitle: string; settingLabel: string }
> = {
  compatibility: {
    title: 'Work-Group Compatibility Graph',
    subtitle: 'Symmetric 5D ideal-partner fit (sparse 4-NN union)',
    settingLabel: '4-NN',
  },
  similarity: {
    title: 'Baseline 1: Trait Similarity Graph',
    subtitle: 'L1 trait similarity threshold network',
    settingLabel: 'threshold >= 0.80',
  },
  contrast: {
    title: 'Baseline 2: Trait Contrast Graph',
    subtitle: 'Opposite-pole centered contrast (top-5 union)',
    settingLabel: 'top 5 per student',
  },
};

const FALLBACK_ARCHETYPES = [
  'Adaptive Collaborators',
  'Balanced Synthesizers',
  'Pragmatic Specialists',
  'Dynamic Connectors',
] as const;

const PERMUTATIONS_4: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 3],
  [0, 1, 3, 2],
  [0, 2, 1, 3],
  [0, 2, 3, 1],
  [0, 3, 1, 2],
  [0, 3, 2, 1],
  [1, 0, 2, 3],
  [1, 0, 3, 2],
  [1, 2, 0, 3],
  [1, 2, 3, 0],
  [1, 3, 0, 2],
  [1, 3, 2, 0],
  [2, 0, 1, 3],
  [2, 0, 3, 1],
  [2, 1, 0, 3],
  [2, 1, 3, 0],
  [2, 3, 0, 1],
  [2, 3, 1, 0],
  [3, 0, 1, 2],
  [3, 0, 2, 1],
  [3, 1, 0, 2],
  [3, 1, 2, 0],
  [3, 2, 0, 1],
  [3, 2, 1, 0],
];

interface IncidentEdge {
  to: number;
  weight: number;
  distance: number;
}

interface HeapItem {
  d: number;
  v: number;
}

function compareLex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function heapPush(heap: HeapItem[], d: number, v: number): void {
  heap.push({ d, v });
  let idx = heap.length - 1;
  while (idx > 0) {
    const parent = (idx - 1) >> 1;
    const cur = heap[idx]!;
    const par = heap[parent]!;
    if (par.d < cur.d || (par.d === cur.d && par.v <= cur.v)) {
      break;
    }
    heap[idx] = par;
    heap[parent] = cur;
    idx = parent;
  }
}

function heapPop(heap: HeapItem[]): HeapItem | undefined {
  if (heap.length === 0) {
    return undefined;
  }
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let idx = 0;
    const len = heap.length;
    while (true) {
      const left = idx * 2 + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < len) {
        const lItem = heap[left]!;
        const sItem = heap[smallest]!;
        if (lItem.d < sItem.d || (lItem.d === sItem.d && lItem.v < sItem.v)) {
          smallest = left;
        }
      }
      if (right < len) {
        const rItem = heap[right]!;
        const sItem = heap[smallest]!;
        if (rItem.d < sItem.d || (rItem.d === sItem.d && rItem.v < sItem.v)) {
          smallest = right;
        }
      }
      if (smallest === idx) {
        break;
      }
      const tmp = heap[idx]!;
      heap[idx] = heap[smallest]!;
      heap[smallest] = tmp;
      idx = smallest;
    }
  }
  return top;
}

function normalizeUndirectedEdges(
  edges: readonly GraphEdge[],
  nodeIndex: ReadonlyMap<string, number>,
): GraphEdge[] {
  const dedup = new Map<string, GraphEdge>();
  for (const edge of edges) {
    if (edge.source === edge.target) {
      continue;
    }
    if (!nodeIndex.has(edge.source) || !nodeIndex.has(edge.target)) {
      continue;
    }
    const [a, b] =
      compareLex(edge.source, edge.target) <= 0
        ? [edge.source, edge.target]
        : [edge.target, edge.source];
    const key = `${a}\0${b}`;
    const existing = dedup.get(key);
    if (!existing || edge.weight > existing.weight) {
      dedup.set(key, {
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        distance: 1 - edge.weight,
      });
    }
  }
  return Array.from(dedup.values());
}

export function computeModularityQ(
  nodeIds: readonly string[],
  edges: readonly GraphEdge[],
  communities: readonly (readonly string[])[],
): number {
  if (communities.length === 0 || edges.length === 0) {
    return 0;
  }
  let m = 0;
  for (const edge of edges) {
    m += edge.weight;
  }
  if (m <= 0) {
    return 0;
  }

  const nodeToComm = new Map<string, number>();
  communities.forEach((members, cIdx) => {
    for (const memberId of members) {
      nodeToComm.set(memberId, cIdx);
    }
  });

  const strength = new Map<string, number>();
  for (const id of nodeIds) {
    strength.set(id, 0);
  }

  const internalWeight = new Float64Array(communities.length);
  for (const edge of edges) {
    const w = edge.weight;
    if (edge.source === edge.target) {
      strength.set(edge.source, (strength.get(edge.source) ?? 0) + 2 * w);
      const c = nodeToComm.get(edge.source);
      if (c !== undefined) {
        internalWeight[c] += w;
      }
    } else {
      strength.set(edge.source, (strength.get(edge.source) ?? 0) + w);
      strength.set(edge.target, (strength.get(edge.target) ?? 0) + w);
      const cSource = nodeToComm.get(edge.source);
      const cTarget = nodeToComm.get(edge.target);
      if (cSource !== undefined && cSource === cTarget) {
        internalWeight[cSource] += w;
      }
    }
  }

  let q = 0;
  for (let c = 0; c < communities.length; c++) {
    let kc = 0;
    for (const memberId of communities[c]!) {
      kc += strength.get(memberId) ?? 0;
    }
    const ratio = kc / (2 * m);
    q += internalWeight[c]! / m - ratio * ratio;
  }
  return q;
}

interface IndexedEdge {
  u: number;
  v: number;
  weight: number;
}

function computeIndexedModularity(
  origStrength: Float64Array,
  origEdges: readonly IndexedEdge[],
  groups: readonly (readonly number[])[],
  m: number,
): number {
  if (m <= 0 || groups.length === 0) {
    return 0;
  }
  const nodeToGroup = new Int32Array(origStrength.length).fill(-1);
  for (let g = 0; g < groups.length; g++) {
    for (const u of groups[g]!) {
      nodeToGroup[u] = g;
    }
  }
  const internalW = new Float64Array(groups.length);
  for (const e of origEdges) {
    const gu = nodeToGroup[e.u]!;
    if (gu >= 0 && gu === nodeToGroup[e.v]) {
      internalW[gu] += e.weight;
    }
  }
  let q = 0;
  for (let g = 0; g < groups.length; g++) {
    let kc = 0;
    for (const u of groups[g]!) {
      kc += origStrength[u]!;
    }
    const ratio = kc / (2 * m);
    q += internalW[g]! / m - ratio * ratio;
  }
  return q;
}

function runWeightedLouvainOnce(
  n: number,
  origEdges: readonly IndexedEdge[],
  origStrength: Float64Array,
  m: number,
  seed: number,
): number[][] {
  if (n === 0) {
    return [];
  }
  if (m <= 0 || origEdges.length === 0) {
    return Array.from({ length: n }, (_, i) => [i]);
  }

  const rng = mulberry32(seed);

  let superMembers: number[][] = Array.from({ length: n }, (_, i) => [i]);
  let selfLoop = new Float64Array(n);
  let pairEdges: IndexedEdge[] = origEdges.map((e) => ({
    u: e.u,
    v: e.v,
    weight: e.weight,
  }));
  let currentMod = computeIndexedModularity(origStrength, origEdges, superMembers, m);

  for (let level = 0; level < 32; level++) {
    const kNodes = superMembers.length;
    if (kNodes <= 1) {
      break;
    }

    const adj: Array<Array<{ to: number; weight: number }>> = Array.from(
      { length: kNodes },
      () => [],
    );
    const strength = new Float64Array(kNodes);
    for (let u = 0; u < kNodes; u++) {
      strength[u] = 2 * selfLoop[u]!;
    }
    for (const e of pairEdges) {
      if (e.u === e.v) {
        selfLoop[e.u] += e.weight;
        strength[e.u] += 2 * e.weight;
      } else {
        adj[e.u]!.push({ to: e.v, weight: e.weight });
        adj[e.v]!.push({ to: e.u, weight: e.weight });
        strength[e.u] += e.weight;
        strength[e.v] += e.weight;
      }
    }

    const node2com = Int32Array.from({ length: kNodes }, (_, i) => i);
    const sTot = Float64Array.from(strength);
    const order = Array.from({ length: kNodes }, (_, i) => i);
    shuffleInPlace(order, rng);

    let movedAny = false;
    let changedInSweep = true;
    let sweeps = 0;

    while (changedInSweep && sweeps < 200) {
      changedInSweep = false;
      sweeps++;

      for (const u of order) {
        const curCom = node2com[u]!;
        const degU = strength[u]!;
        const weights2com = new Map<number, number>();
        for (const nbr of adj[u]!) {
          const c = node2com[nbr.to]!;
          weights2com.set(c, (weights2com.get(c) ?? 0) + nbr.weight);
        }

        const wCur = weights2com.get(curCom) ?? 0;
        sTot[curCom] -= degU;
        const removeCost = -wCur / m + (sTot[curCom]! * degU) / (2 * m * m);

        let bestGain = 0;
        let bestCom = curCom;
        for (const [nbrCom, wt] of weights2com.entries()) {
          const gain = removeCost + wt / m - (sTot[nbrCom]! * degU) / (2 * m * m);
          if (gain > bestGain + 1e-10) {
            bestGain = gain;
            bestCom = nbrCom;
          }
        }

        sTot[bestCom] += degU;
        if (bestCom !== curCom) {
          node2com[u] = bestCom;
          changedInSweep = true;
          movedAny = true;
        }
      }
    }

    if (!movedAny) {
      break;
    }

    const comToSuper = new Map<number, number[]>();
    for (let u = 0; u < kNodes; u++) {
      const c = node2com[u]!;
      let list = comToSuper.get(c);
      if (!list) {
        list = [];
        comToSuper.set(c, list);
      }
      list.push(u);
    }

    const innerGroups = Array.from(comToSuper.values());
    const candidateMembers = innerGroups.map((g) =>
      g.flatMap((superIdx) => superMembers[superIdx]!),
    );
    const newMod = computeIndexedModularity(origStrength, origEdges, candidateMembers, m);
    if (newMod <= currentMod + 1e-10) {
      break;
    }

    currentMod = newMod;
    superMembers = candidateMembers;

    if (innerGroups.length === kNodes || innerGroups.length <= 1) {
      break;
    }

    const nextK = innerGroups.length;
    const oldToNew = new Int32Array(kNodes);
    for (let gIdx = 0; gIdx < nextK; gIdx++) {
      for (const oldU of innerGroups[gIdx]!) {
        oldToNew[oldU] = gIdx;
      }
    }

    const nextSelfLoop = new Float64Array(nextK);
    for (let oldU = 0; oldU < kNodes; oldU++) {
      nextSelfLoop[oldToNew[oldU]!] += selfLoop[oldU]!;
    }

    const nextEdgeMap = new Map<string, IndexedEdge>();
    for (const e of pairEdges) {
      const gu = oldToNew[e.u]!;
      const gv = oldToNew[e.v]!;
      if (gu === gv) {
        nextSelfLoop[gu] += e.weight;
      } else {
        const a = gu < gv ? gu : gv;
        const b = gu < gv ? gv : gu;
        const key = `${a}:${b}`;
        const existing = nextEdgeMap.get(key);
        if (existing) {
          existing.weight += e.weight;
        } else {
          nextEdgeMap.set(key, { u: a, v: b, weight: e.weight });
        }
      }
    }

    selfLoop = nextSelfLoop;
    pairEdges = Array.from(nextEdgeMap.values());
  }

  return superMembers;
}

function computeMeanTraits(
  members: readonly string[],
  studentMap: ReadonlyMap<string, StudentProfile>,
): TraitVector {
  if (members.length === 0) {
    return { E: 0, N: 0, T: 0, J: 0, A: 0 };
  }
  let sumE = 0;
  let sumN = 0;
  let sumT = 0;
  let sumJ = 0;
  let sumA = 0;
  for (const id of members) {
    const t = studentMap.get(id)!.traits;
    sumE += t.E;
    sumN += t.N;
    sumT += t.T;
    sumJ += t.J;
    sumA += t.A;
  }
  const inv = 1 / members.length;
  return {
    E: sumE * inv,
    N: sumN * inv,
    T: sumT * inv,
    J: sumJ * inv,
    A: sumA * inv,
  };
}

function canonicalizePartition(
  rawGroups: readonly (readonly number[])[],
  students: readonly StudentProfile[],
  studentMap: ReadonlyMap<string, StudentProfile>,
): { communities: string[][]; signature: string } {
  const communities = rawGroups
    .filter((g) => g.length > 0)
    .map((g) => g.map((idx) => students[idx]!.id).sort(compareLex));

  const meanNMap = new Map<string[], number>();
  for (const comm of communities) {
    let sumN = 0;
    for (const id of comm) {
      sumN += studentMap.get(id)!.traits.N;
    }
    meanNMap.set(comm, comm.length > 0 ? sumN / comm.length : 0);
  }

  communities.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    const diffN = (meanNMap.get(b) ?? 0) - (meanNMap.get(a) ?? 0);
    if (Math.abs(diffN) > 1e-12) {
      return diffN;
    }
    return compareLex(a[0] ?? '', b[0] ?? '');
  });

  const signature = communities.map((c) => c.join(',')).join('|');
  return { communities, signature };
}

function selectLouvainPartition(
  students: readonly StudentProfile[],
  studentMap: ReadonlyMap<string, StudentProfile>,
  edges: readonly GraphEdge[],
  nodeIndex: ReadonlyMap<string, number>,
  preferModalK4: boolean,
): { communities: string[][]; modularityQ: number } {
  const n = students.length;
  if (n === 0) {
    return { communities: [], modularityQ: 0 };
  }

  const indexedEdges: IndexedEdge[] = [];
  const origStrength = new Float64Array(n);
  let m = 0;
  for (const e of edges) {
    const u = nodeIndex.get(e.source);
    const v = nodeIndex.get(e.target);
    if (u === undefined || v === undefined || u === v) {
      continue;
    }
    indexedEdges.push({ u, v, weight: e.weight });
    origStrength[u] += e.weight;
    origStrength[v] += e.weight;
    m += e.weight;
  }

  const nodeIds = students.map((s) => s.id);
  if (m <= 0 || indexedEdges.length === 0) {
    const singletons = students.map((s) => [s.id]);
    const canon = canonicalizePartition(
      students.map((_, i) => [i]),
      students,
      studentMap,
    );
    return {
      communities: canon.communities,
      modularityQ: computeModularityQ(nodeIds, edges, singletons),
    };
  }

  interface PartitionRecord {
    communities: string[][];
    signature: string;
    q: number;
    count: number;
  }

  const records = new Map<string, PartitionRecord>();
  for (let seed = 1; seed <= 48; seed++) {
    const rawGroups = runWeightedLouvainOnce(n, indexedEdges, origStrength, m, seed);
    const { communities, signature } = canonicalizePartition(
      rawGroups,
      students,
      studentMap,
    );
    const existing = records.get(signature);
    if (existing) {
      existing.count += 1;
    } else {
      const q = computeModularityQ(nodeIds, edges, communities);
      records.set(signature, {
        communities,
        signature,
        q,
        count: 1,
      });
    }
  }

  const allRecords = Array.from(records.values());
  if (!preferModalK4) {
    allRecords.sort((a, b) => {
      if (Math.abs(b.q - a.q) > 1e-12) {
        return b.q - a.q;
      }
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return compareLex(a.signature, b.signature);
    });
    const best = allRecords[0]!;
    return { communities: best.communities, modularityQ: best.q };
  }

  const k4Records = allRecords.filter((r) => r.communities.length === 4);
  let pool: PartitionRecord[];
  if (k4Records.length > 0) {
    pool = k4Records;
  } else {
    let maxQ = -Infinity;
    for (const r of allRecords) {
      if (r.q > maxQ) {
        maxQ = r.q;
      }
    }
    pool = allRecords.filter((r) => r.q >= maxQ - 0.02);
  }

  pool.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    if (Math.abs(b.q - a.q) > 1e-12) {
      return b.q - a.q;
    }
    return compareLex(a.signature, b.signature);
  });

  const winner = pool[0]!;
  return { communities: winner.communities, modularityQ: winner.q };
}

function computeArchetypeAffinities(t: TraitVector): [number, number, number, number] {
  return [
    1.2 * t.N + 1.2 * t.T + 1.2 * t.J + 0.4 * t.A, // 0: Strategic Drivers
    1.1 * t.N + 1.8 * (1 - t.T) + 0.4 * (1 - t.J), // 1: Empathetic Diplomats
    1.8 * (1 - t.N) + 1.4 * t.J, // 2: Structured Organizers
    1.3 * t.T + 1.4 * (1 - t.J) + 1.2 * t.A, // 3: Assertive Analysts
  ];
}

function buildLouvainCommunities(
  sortedMemberLists: readonly (readonly string[])[],
  studentMap: ReadonlyMap<string, StudentProfile>,
): {
  communities: LouvainCommunity[];
  nodeToCommunity: Record<string, number>;
} {
  const k = sortedMemberLists.length;
  const meanTraitsList = sortedMemberLists.map((members) =>
    computeMeanTraits(members, studentMap),
  );

  const primaryCount = Math.min(4, k);
  const affinitiesByComm = meanTraitsList
    .slice(0, primaryCount)
    .map((mt) => computeArchetypeAffinities(mt));

  let bestPerm: readonly [number, number, number, number] = PERMUTATIONS_4[0]!;
  let bestScore = -Infinity;
  for (const perm of PERMUTATIONS_4) {
    let score = 0;
    for (let i = 0; i < primaryCount; i++) {
      score += affinitiesByComm[i]![perm[i]!]!;
    }
    if (score > bestScore + 1e-12) {
      bestScore = score;
      bestPerm = perm;
    }
  }

  const communities: LouvainCommunity[] = [];
  const nodeToCommunity: Record<string, number> = {};

  for (let idx = 0; idx < k; idx++) {
    const members = [...sortedMemberLists[idx]!].sort(compareLex);
    for (const id of members) {
      nodeToCommunity[id] = idx;
    }

    const code = `C${idx + 1}`;
    let archetype: string;
    let color: string;
    let fillRgba: string;
    let borderRgba: string;

    if (idx < 4) {
      const paletteIdx = bestPerm[idx]!;
      const palette = LOUVAIN_CLUSTER_PALETTE[paletteIdx]!;
      archetype = palette.defaultArchetype;
      color = palette.color;
      fillRgba = palette.fillRgba;
      borderRgba = palette.borderRgba;
    } else {
      const palette = LOUVAIN_CLUSTER_PALETTE[idx % LOUVAIN_CLUSTER_PALETTE.length]!;
      const fallbackIdx = idx - 4;
      archetype =
        fallbackIdx < FALLBACK_ARCHETYPES.length
          ? FALLBACK_ARCHETYPES[fallbackIdx]!
          : `Cluster ${idx + 1} Specialists`;
      color = palette.color;
      fillRgba = palette.fillRgba;
      borderRgba = palette.borderRgba;
    }

    const groupCounts: Record<MbtiGroupKey, number> = {
      analysts: 0,
      diplomats: 0,
      sentinels: 0,
      explorers: 0,
    };
    for (const id of members) {
      const student = studentMap.get(id)!;
      const group = MBTI_TYPES[student.mbti].group;
      groupCounts[group] += 1;
    }

    const dominantMbtiGroups = (Object.keys(groupCounts) as MbtiGroupKey[])
      .filter((g) => groupCounts[g] > 0)
      .sort((a, b) => groupCounts[b] - groupCounts[a] || compareLex(a, b))
      .slice(0, 2);

    communities.push({
      index: idx,
      code,
      archetype,
      fullLabel: `${code} · ${archetype}`,
      color,
      fillRgba,
      borderRgba,
      members,
      meanTraits: meanTraitsList[idx]!,
      dominantMbtiGroups,
    });
  }

  return { communities, nodeToCommunity };
}

function minMaxNormalize(values: Float64Array): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (n === 0) {
    return out;
  }
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  const span = maxVal - minVal;
  if (span <= 1e-12) {
    return out;
  }
  for (let i = 0; i < n; i++) {
    out[i] = (values[i]! - minVal) / span;
  }
  return out;
}

function computeGraphTopologySummary(params: {
  modelId: GraphModelId;
  students: readonly StudentProfile[];
  nodeIndex: ReadonlyMap<string, number>;
  edges: GraphEdge[];
  modularityQ: number;
}): GraphTopologySummary {
  const { modelId, students, nodeIndex, edges, modularityQ } = params;
  const meta = MODEL_METADATA[modelId];
  const n = students.length;
  const edgeCount = edges.length;
  const density = n > 1 ? (2 * edgeCount) / (n * (n - 1)) : 0;

  const adj: IncidentEdge[][] = Array.from({ length: n }, () => []);
  const strengthArr = new Float64Array(n);

  for (const edge of edges) {
    const u = nodeIndex.get(edge.source);
    const v = nodeIndex.get(edge.target);
    if (u === undefined || v === undefined || u === v) {
      continue;
    }
    const dist = Math.max(0, 1 - edge.weight);
    adj[u]!.push({ to: v, weight: edge.weight, distance: dist });
    adj[v]!.push({ to: u, weight: edge.weight, distance: dist });
    strengthArr[u] += edge.weight;
    strengthArr[v] += edge.weight;
  }

  // Connected components sorted by (-comp.length, minStudentIdLex)
  const visited = new Uint8Array(n);
  const rawComponents: Array<{ indices: number[]; memberIds: string[] }> = [];
  for (let i = 0; i < n; i++) {
    if (visited[i]) {
      continue;
    }
    visited[i] = 1;
    const queue = [i];
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++]!;
      for (const e of adj[u]!) {
        if (!visited[e.to]) {
          visited[e.to] = 1;
          queue.push(e.to);
        }
      }
    }
    const memberIds = queue.map((idx) => students[idx]!.id).sort(compareLex);
    const sortedIndices = memberIds.map((id) => nodeIndex.get(id)!);
    rawComponents.push({ indices: sortedIndices, memberIds });
  }

  rawComponents.sort(
    (a, b) =>
      b.memberIds.length - a.memberIds.length ||
      compareLex(a.memberIds[0] ?? '', b.memberIds[0] ?? ''),
  );

  const componentOfNode = new Int32Array(n);
  rawComponents.forEach((comp, cIdx) => {
    for (const u of comp.indices) {
      componentOfNode[u] = cIdx + 1;
    }
  });

  const componentCount = rawComponents.length;
  const connected = n > 0 ? componentCount <= 1 : false;
  const largestComponentShare =
    n > 0 && rawComponents.length > 0 ? rawComponents[0]!.memberIds.length / n : 0;

  // Unweighted Brandes betweenness, Wasserman-Faust closeness, and hop eccentricities
  const betweenness = new Float64Array(n);
  const closeness = new Float64Array(n);
  const eccHops = new Int32Array(n);

  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const preds: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Float64Array(n);
    sigma[s] = 1;
    const dist = new Int32Array(n).fill(-1);
    dist[s] = 0;

    const queue = [s];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++]!;
      stack.push(v);
      const dv = dist[v]!;
      for (const e of adj[v]!) {
        const w = e.to;
        if (dist[w]! < 0) {
          dist[w] = dv + 1;
          queue.push(w);
        }
        if (dist[w] === dv + 1) {
          sigma[w] += sigma[v]!;
          preds[w]!.push(v);
        }
      }
    }

    let totsp = 0;
    let maxHop = 0;
    for (const v of stack) {
      const d = dist[v]!;
      totsp += d;
      if (d > maxHop) {
        maxHop = d;
      }
    }
    eccHops[s] = maxHop;
    const r = stack.length;
    closeness[s] = totsp > 0 && n > 1 ? ((r - 1) / totsp) * ((r - 1) / (n - 1)) : 0;

    const delta = new Float64Array(n);
    for (let i = stack.length - 1; i >= 0; i--) {
      const w = stack[i]!;
      const coeff = (1 + delta[w]!) / sigma[w]!;
      for (const v of preds[w]!) {
        delta[v] += sigma[v]! * coeff;
      }
      if (w !== s) {
        betweenness[w] += delta[w]!;
      }
    }
  }

  const bwScale = n > 2 ? 1 / ((n - 1) * (n - 2)) : 0;
  for (let i = 0; i < n; i++) {
    betweenness[i] *= bwScale;
  }

  // Weighted Dijkstra-Brandes betweenness, Wasserman-Faust closeness, and weighted eccentricities
  const betweennessWeighted = new Float64Array(n);
  const closenessWeighted = new Float64Array(n);
  const eccWeighted = new Float64Array(n);
  const EPS = 1e-12;

  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const preds: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Float64Array(n);
    sigma[s] = 1;
    const dist = new Float64Array(n).fill(Infinity);
    dist[s] = 0;
    const settled = new Uint8Array(n);
    const heap: HeapItem[] = [];
    heapPush(heap, 0, s);

    while (heap.length > 0) {
      const item = heapPop(heap)!;
      const v = item.v;
      if (settled[v]) {
        continue;
      }
      settled[v] = 1;
      stack.push(v);
      const dv = dist[v]!;

      for (const e of adj[v]!) {
        const w = e.to;
        if (settled[w]) {
          continue;
        }
        const nd = dv + e.distance;
        if (nd < dist[w]! - EPS) {
          dist[w] = nd;
          sigma[w] = sigma[v]!;
          preds[w] = [v];
          heapPush(heap, nd, w);
        } else if (Math.abs(nd - dist[w]!) <= EPS) {
          sigma[w] += sigma[v]!;
          preds[w]!.push(v);
        }
      }
    }

    let totsp = 0;
    let maxDist = 0;
    for (const v of stack) {
      const d = dist[v]!;
      totsp += d;
      if (d > maxDist) {
        maxDist = d;
      }
    }
    eccWeighted[s] = maxDist;
    const r = stack.length;
    closenessWeighted[s] =
      totsp > 0 && n > 1 ? ((r - 1) / totsp) * ((r - 1) / (n - 1)) : 0;

    const delta = new Float64Array(n);
    for (let i = stack.length - 1; i >= 0; i--) {
      const w = stack[i]!;
      const coeff = (1 + delta[w]!) / sigma[w]!;
      for (const v of preds[w]!) {
        delta[v] += sigma[v]! * coeff;
      }
      if (w !== s) {
        betweennessWeighted[w] += delta[w]!;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    betweennessWeighted[i] *= bwScale;
  }

  // Eigenvector centrality per connected component (shifted (A + I) power iteration, L2 normalized)
  const eigenvector = new Float64Array(n);
  for (const comp of rawComponents) {
    const cIndices = comp.indices;
    const cLen = cIndices.length;
    if (cLen === 1) {
      eigenvector[cIndices[0]!] = 1.0;
      continue;
    }

    const initVal = 1 / Math.sqrt(cLen);
    for (const u of cIndices) {
      eigenvector[u] = initVal;
    }

    const nextVec = new Float64Array(n);
    for (let iter = 0; iter < 1000; iter++) {
      let normSq = 0;
      for (const u of cIndices) {
        let sum = eigenvector[u]!;
        for (const e of adj[u]!) {
          sum += e.weight * eigenvector[e.to]!;
        }
        nextVec[u] = sum;
        normSq += sum * sum;
      }
      const norm = normSq > 0 ? Math.sqrt(normSq) : 1;
      let l1Diff = 0;
      for (const u of cIndices) {
        const val = nextVec[u]! / norm;
        l1Diff += Math.abs(val - eigenvector[u]!);
        eigenvector[u] = val;
      }
      if (l1Diff < 1e-10) {
        break;
      }
    }
  }

  // Geodesic summary metrics on the largest connected component C_max
  const cMax = rawComponents[0];
  let diameterHops = 0;
  let radiusHops = 0;
  let weightedDiameter = 0;
  let weightedRadius = 0;
  let centerNodes: string[] = [];
  let peripheryNodes: string[] = [];

  if (cMax) {
    if (cMax.indices.length <= 1) {
      centerNodes = [...cMax.memberIds];
      peripheryNodes = [...cMax.memberIds];
    } else {
      diameterHops = -Infinity;
      radiusHops = Infinity;
      weightedDiameter = -Infinity;
      weightedRadius = Infinity;
      for (const u of cMax.indices) {
        const eh = eccHops[u]!;
        const ew = eccWeighted[u]!;
        if (eh > diameterHops) diameterHops = eh;
        if (eh < radiusHops) radiusHops = eh;
        if (ew > weightedDiameter) weightedDiameter = ew;
        if (ew < weightedRadius) weightedRadius = ew;
      }
      centerNodes = cMax.indices
        .filter((u) => Math.abs(eccWeighted[u]! - weightedRadius) <= 1e-9)
        .map((u) => students[u]!.id)
        .sort(compareLex);
      peripheryNodes = cMax.indices
        .filter((u) => Math.abs(eccWeighted[u]! - weightedDiameter) <= 1e-9)
        .map((u) => students[u]!.id)
        .sort(compareLex);
    }
  }

  // Bridge hubs (top min(4, n) on compatibility graph only)
  const isBridgeHubArr = new Uint8Array(n);
  if (modelId === 'compatibility' && n > 0) {
    const normBW = minMaxNormalize(betweennessWeighted);
    const normCW = minMaxNormalize(closenessWeighted);
    const normEV = minMaxNormalize(eigenvector);
    const bridgeScores = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      bridgeScores[i] = normBW[i]! + normCW[i]! + normEV[i]!;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
      const diff = bridgeScores[b]! - bridgeScores[a]!;
      if (Math.abs(diff) > 1e-12) {
        return diff;
      }
      return compareLex(students[a]!.id, students[b]!.id);
    });
    const hubLimit = Math.min(4, n);
    for (let i = 0; i < hubLimit; i++) {
      isBridgeHubArr[order[i]!] = 1;
    }
  }

  const centralities: Record<string, NodeCentrality> = {};
  for (let i = 0; i < n; i++) {
    const studentId = students[i]!.id;
    const deg = adj[i]!.length;
    centralities[studentId] = {
      studentId,
      component: componentOfNode[i]!,
      degree: deg,
      degreeCentrality: n > 1 ? deg / (n - 1) : 0,
      strength: strengthArr[i]!,
      betweenness: betweenness[i]!,
      betweennessWeighted: betweennessWeighted[i]!,
      closeness: closeness[i]!,
      closenessWeighted: closenessWeighted[i]!,
      eigenvector: eigenvector[i]!,
      isBridgeHub: isBridgeHubArr[i] === 1,
    };
  }

  return {
    modelId,
    title: meta.title,
    subtitle: meta.subtitle,
    settingLabel: meta.settingLabel,
    nodeCount: n,
    edgeCount,
    density,
    connected,
    componentCount,
    largestComponentShare,
    diameterHops,
    radiusHops,
    weightedDiameter,
    weightedRadius,
    centerNodes,
    peripheryNodes,
    modularityQ,
    edges,
    centralities,
  };
}

function computeDeterministicLayout(params: {
  students: readonly StudentProfile[];
  nodeIndex: ReadonlyMap<string, number>;
  compatEdges: readonly GraphEdge[];
  communities: readonly LouvainCommunity[];
  nodeToCommunity: Readonly<Record<string, number>>;
}): Record<string, { x: number; y: number }> {
  const { students, nodeIndex, compatEdges, communities, nodeToCommunity } = params;
  const n = students.length;
  if (n === 0) {
    return {};
  }
  if (n === 1) {
    return { [students[0]!.id]: { x: 0, y: 0 } };
  }

  const rng = mulberry32(42);
  const posX = new Float64Array(n);
  const posY = new Float64Array(n);
  const commCount = Math.max(1, communities.length);

  communities.forEach((comm, cIdx) => {
    const clusterAngle = (2 * Math.PI * cIdx) / commCount - Math.PI / 4;
    const clusterRadius = commCount > 1 ? 0.52 : 0;
    const cx = clusterRadius * Math.cos(clusterAngle);
    const cy = clusterRadius * Math.sin(clusterAngle);
    const mLen = comm.members.length;
    comm.members.forEach((memberId, mIdx) => {
      const idx = nodeIndex.get(memberId);
      if (idx === undefined) {
        return;
      }
      const subAngle = (2 * Math.PI * mIdx) / Math.max(1, mLen) + cIdx * 0.35;
      const subRadius = mLen > 1 ? 0.18 : 0;
      posX[idx] = cx + subRadius * Math.cos(subAngle) + (rng() - 0.5) * 0.03;
      posY[idx] = cy + subRadius * Math.sin(subAngle) + (rng() - 0.5) * 0.03;
    });
  });

  const indexedEdges: IndexedEdge[] = [];
  for (const e of compatEdges) {
    const u = nodeIndex.get(e.source);
    const v = nodeIndex.get(e.target);
    if (u !== undefined && v !== undefined && u !== v) {
      indexedEdges.push({ u, v, weight: e.weight });
    }
  }

  const commOfIdx = Int32Array.from({ length: n }, (_, i) => {
    const id = students[i]!.id;
    return nodeToCommunity[id] ?? 0;
  });

  const kIdeal = Math.sqrt(4.0 / n);
  const totalIterations = 250;
  const temp0 = 0.28;

  for (let iter = 0; iter < totalIterations; iter++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    // Pairwise Fruchterman-Reingold repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = posX[i]! - posX[j]!;
        const dy = posY[i]! - posY[j]!;
        const dist = Math.max(1e-4, Math.hypot(dx, dy));
        const commScale = commOfIdx[i] === commOfIdx[j] ? 0.9 : 1.15;
        const rep = ((kIdeal * kIdeal) / dist) * commScale;
        const rx = (dx / dist) * rep;
        const ry = (dy / dist) * rep;
        fx[i] += rx;
        fy[i] += ry;
        fx[j] -= rx;
        fy[j] -= ry;
      }
    }

    // Weighted spring attraction along compatibility edges
    for (const e of indexedEdges) {
      const dx = posX[e.v]! - posX[e.u]!;
      const dy = posY[e.v]! - posY[e.u]!;
      const dist = Math.max(1e-4, Math.hypot(dx, dy));
      const attr = ((dist * dist) / kIdeal) * (0.65 + 0.75 * e.weight);
      const ax = (dx / dist) * attr;
      const ay = (dy / dist) * attr;
      fx[e.u] += ax;
      fy[e.u] += ay;
      fx[e.v] -= ax;
      fy[e.v] -= ay;
    }

    // Gentle intra-community centroid attraction + mild centering gravity
    const centX = new Float64Array(commCount);
    const centY = new Float64Array(commCount);
    const centCounts = new Int32Array(commCount);
    for (let i = 0; i < n; i++) {
      const c = commOfIdx[i]!;
      centX[c] += posX[i]!;
      centY[c] += posY[i]!;
      centCounts[c] += 1;
    }
    for (let c = 0; c < commCount; c++) {
      if (centCounts[c]! > 0) {
        centX[c] /= centCounts[c]!;
        centY[c] /= centCounts[c]!;
      }
    }

    for (let i = 0; i < n; i++) {
      const c = commOfIdx[i]!;
      fx[i] += 0.18 * (centX[c]! - posX[i]!) - 0.06 * posX[i]!;
      fy[i] += 0.18 * (centY[c]! - posY[i]!) - 0.06 * posY[i]!;
    }

    const temp = temp0 * Math.pow(1 - iter / totalIterations, 1.15);
    for (let i = 0; i < n; i++) {
      const step = Math.hypot(fx[i]!, fy[i]!);
      if (step > 0) {
        const lim = Math.min(step, temp);
        posX[i] += (fx[i]! / step) * lim;
        posY[i] += (fy[i]! / step) * lim;
      }
    }
  }

  // Initial centering and normalization into [-0.86, 0.86]
  const centerAndScale = (targetBound: number): void => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (posX[i]! < minX) minX = posX[i]!;
      if (posX[i]! > maxX) maxX = posX[i]!;
      if (posY[i]! < minY) minY = posY[i]!;
      if (posY[i]! > maxY) maxY = posY[i]!;
    }
    const midX = 0.5 * (minX + maxX);
    const midY = 0.5 * (minY + maxY);
    const halfSpanX = Math.max(1e-6, 0.5 * (maxX - minX));
    const halfSpanY = Math.max(1e-6, 0.5 * (maxY - minY));
    for (let i = 0; i < n; i++) {
      posX[i] = ((posX[i]! - midX) / halfSpanX) * targetBound;
      posY[i] = ((posY[i]! - midY) / halfSpanY) * targetBound;
    }
  };

  centerAndScale(0.86);

  // Deterministic minimum-distance overlap relaxation keeping coordinates strictly inside [-0.92, 0.92]
  const minDist = n <= 40 ? 0.155 : Math.max(0.05, 0.92 / Math.sqrt(n));
  const maxBound = 0.92;
  for (let pass = 0; pass < 100; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = posX[j]! - posX[i]!;
        const dy = posY[j]! - posY[i]!;
        const d = Math.hypot(dx, dy);
        if (d < minDist) {
          moved = true;
          let ux: number;
          let uy: number;
          if (d > 1e-9) {
            ux = dx / d;
            uy = dy / d;
          } else {
            const fallbackAngle = ((i * 7 + j * 13) % 360) * (Math.PI / 180);
            ux = Math.cos(fallbackAngle);
            uy = Math.sin(fallbackAngle);
          }
          const push = 0.52 * (minDist - d);
          posX[i] = Math.max(-maxBound, Math.min(maxBound, posX[i]! - ux * push));
          posY[i] = Math.max(-maxBound, Math.min(maxBound, posY[i]! - uy * push));
          posX[j] = Math.max(-maxBound, Math.min(maxBound, posX[j]! + ux * push));
          posY[j] = Math.max(-maxBound, Math.min(maxBound, posY[j]! + uy * push));
        }
      }
    }
    if (!moved) {
      break;
    }
  }

  // Re-center inside [-0.92, 0.92] without shrinking pairwise distances
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (posX[i]! < minX) minX = posX[i]!;
    if (posX[i]! > maxX) maxX = posX[i]!;
    if (posY[i]! < minY) minY = posY[i]!;
    if (posY[i]! > maxY) maxY = posY[i]!;
  }
  const shiftX = 0.5 * (minX + maxX);
  const shiftY = 0.5 * (minY + maxY);
  const halfSpan = Math.max(0.5 * (maxX - minX), 0.5 * (maxY - minY), 1e-6);
  const scale = halfSpan > maxBound ? maxBound / halfSpan : Math.min(1.05, maxBound / halfSpan);

  const nodePositions: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < n; i++) {
    const x = Math.max(-maxBound, Math.min(maxBound, (posX[i]! - shiftX) * scale));
    const y = Math.max(-maxBound, Math.min(maxBound, (posY[i]! - shiftY) * scale));
    nodePositions[students[i]!.id] = { x, y };
  }
  return nodePositions;
}

export function buildGraphAndCommunities(params: {
  students: StudentProfile[];
  compatEdges: GraphEdge[];
  simEdges: GraphEdge[];
  contrastEdges: GraphEdge[];
}): {
  graphs: Record<GraphModelId, GraphTopologySummary>;
  communities: LouvainCommunity[];
  nodeToCommunity: Record<string, number>;
  nodePositions: Record<string, { x: number; y: number }>;
} {
  const { students } = params;
  const nodeIndex = new Map<string, number>();
  const studentMap = new Map<string, StudentProfile>();
  students.forEach((student, idx) => {
    nodeIndex.set(student.id, idx);
    studentMap.set(student.id, student);
  });

  const compatEdges = normalizeUndirectedEdges(params.compatEdges, nodeIndex);
  const simEdges = normalizeUndirectedEdges(params.simEdges, nodeIndex);
  const contrastEdges = normalizeUndirectedEdges(params.contrastEdges, nodeIndex);

  const compatLouvain = selectLouvainPartition(
    students,
    studentMap,
    compatEdges,
    nodeIndex,
    true,
  );
  const simLouvain = selectLouvainPartition(
    students,
    studentMap,
    simEdges,
    nodeIndex,
    false,
  );
  const contrastLouvain = selectLouvainPartition(
    students,
    studentMap,
    contrastEdges,
    nodeIndex,
    false,
  );

  const { communities, nodeToCommunity } = buildLouvainCommunities(
    compatLouvain.communities,
    studentMap,
  );

  const graphs: Record<GraphModelId, GraphTopologySummary> = {
    compatibility: computeGraphTopologySummary({
      modelId: 'compatibility',
      students,
      nodeIndex,
      edges: compatEdges,
      modularityQ: compatLouvain.modularityQ,
    }),
    similarity: computeGraphTopologySummary({
      modelId: 'similarity',
      students,
      nodeIndex,
      edges: simEdges,
      modularityQ: simLouvain.modularityQ,
    }),
    contrast: computeGraphTopologySummary({
      modelId: 'contrast',
      students,
      nodeIndex,
      edges: contrastEdges,
      modularityQ: contrastLouvain.modularityQ,
    }),
  };

  const nodePositions = computeDeterministicLayout({
    students,
    nodeIndex,
    compatEdges,
    communities,
    nodeToCommunity,
  });

  return {
    graphs,
    communities,
    nodeToCommunity,
    nodePositions,
  };
}
