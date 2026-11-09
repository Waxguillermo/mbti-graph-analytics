import { TRAIT_METADATA } from './mbtiMetadata';
import type {
  AxisFitContribution,
  GraphEdge,
  PairwiseBreakdown,
  StudentProfile,
  TraitKey,
} from './types';

export interface BuiltCompatibilityGraphs {
  compatMatrix: Record<string, Record<string, number>>;
  simMatrix: Record<string, Record<string, number>>;
  contrastMatrix: Record<string, Record<string, number>>;
  compatEdges: GraphEdge[];
  simEdges: GraphEdge[];
  contrastEdges: GraphEdge[];
}

const TRAIT_KEYS: readonly TraitKey[] = ['E', 'N', 'T', 'J', 'A'];
const SQRT_5 = Math.sqrt(5);
const SIMILARITY_THRESHOLD = 0.80;
const COMPAT_KNN = 4;
const CONTRAST_KNN = 5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function canonicalEdgeKey(u: string, v: string): string {
  return u < v ? `${u}::${v}` : `${v}::${u}`;
}

export function computePairCompatibility(a: StudentProfile, b: StudentProfile): number {
  let sumSqAb = 0;
  let sumSqBa = 0;

  for (const k of TRAIT_KEYS) {
    const diffAb = b.traits[k] - a.idealPartner[k];
    const diffBa = a.traits[k] - b.idealPartner[k];
    sumSqAb += diffAb * diffAb;
    sumSqBa += diffBa * diffBa;
  }

  const dAb = Math.sqrt(sumSqAb) / SQRT_5;
  const dBa = Math.sqrt(sumSqBa) / SQRT_5;
  return 1.0 - 0.5 * (dAb + dBa);
}

export function computePairSimilarity(a: StudentProfile, b: StudentProfile): number {
  let absSum = 0;
  for (const k of TRAIT_KEYS) {
    absSum += Math.abs(a.traits[k] - b.traits[k]);
  }
  return 1.0 - absSum / TRAIT_KEYS.length;
}

export function computePairContrast(a: StudentProfile, b: StudentProfile): number {
  let oppositionSum = 0;
  for (const k of TRAIT_KEYS) {
    const centeredA = a.traits[k] - 0.5;
    const centeredB = b.traits[k] - 0.5;
    oppositionSum += 4.0 * Math.max(0.0, -(centeredA * centeredB));
  }
  return oppositionSum / TRAIT_KEYS.length;
}

function buildKnnUndirectedEdges(
  students: StudentProfile[],
  matrix: Record<string, Record<string, number>>,
  kNeighbors: number,
): GraphEdge[] {
  const m = students.length;
  if (m <= 1) {
    return [];
  }

  const effectiveK = Math.min(kNeighbors, m - 1);
  const edgeMap = new Map<string, { lo: number; hi: number; edge: GraphEdge }>();

  for (let i = 0; i < m; i += 1) {
    const uId = students[i].id;
    const candidates: Array<{ j: number; score: number }> = [];

    for (let j = 0; j < m; j += 1) {
      if (j === i) {
        continue;
      }
      candidates.push({ j, score: matrix[uId][students[j].id] });
    }

    candidates.sort((x, y) => {
      const diff = y.score - x.score;
      return diff !== 0 ? diff : x.j - y.j;
    });

    for (let idx = 0; idx < effectiveK; idx += 1) {
      const { j, score } = candidates[idx];
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const source = students[lo].id;
      const target = students[hi].id;
      const key = canonicalEdgeKey(source, target);

      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          lo,
          hi,
          edge: {
            source,
            target,
            weight: score,
            distance: 1.0 - score,
          },
        });
      }
    }
  }

  return Array.from(edgeMap.values())
    .sort((a, b) => (a.lo !== b.lo ? a.lo - b.lo : a.hi - b.hi))
    .map((entry) => entry.edge);
}

export function buildCompatibilityMatricesAndEdges(
  students: StudentProfile[],
): BuiltCompatibilityGraphs {
  const m = students.length;
  const compatMatrix: Record<string, Record<string, number>> = {};
  const simMatrix: Record<string, Record<string, number>> = {};
  const contrastMatrix: Record<string, Record<string, number>> = {};

  for (let i = 0; i < m; i += 1) {
    const id = students[i].id;
    compatMatrix[id] = { [id]: 1.0 };
    simMatrix[id] = { [id]: 1.0 };
    contrastMatrix[id] = { [id]: 0.0 };
  }

  const simEdges: GraphEdge[] = [];

  for (let i = 0; i < m; i += 1) {
    const u = students[i];
    for (let j = i + 1; j < m; j += 1) {
      const v = students[j];

      const compat = computePairCompatibility(u, v);
      const sim = computePairSimilarity(u, v);
      const contrast = computePairContrast(u, v);

      compatMatrix[u.id][v.id] = compat;
      compatMatrix[v.id][u.id] = compat;

      simMatrix[u.id][v.id] = sim;
      simMatrix[v.id][u.id] = sim;

      contrastMatrix[u.id][v.id] = contrast;
      contrastMatrix[v.id][u.id] = contrast;

      if (sim >= SIMILARITY_THRESHOLD) {
        simEdges.push({
          source: u.id,
          target: v.id,
          weight: sim,
          distance: 1.0 - sim,
        });
      }
    }
  }

  const compatEdges = buildKnnUndirectedEdges(students, compatMatrix, COMPAT_KNN);
  const contrastEdges = buildKnnUndirectedEdges(students, contrastMatrix, CONTRAST_KNN);

  return {
    compatMatrix,
    simMatrix,
    contrastMatrix,
    compatEdges,
    simEdges,
    contrastEdges,
  };
}

function buildAxisNarrative(
  key: TraitKey,
  studentValue: number,
  partnerValue: number,
  fit: number,
): string {
  const aPct = Math.round(studentValue * 100);
  const bPct = Math.round(partnerValue * 100);
  const fitPct = Math.round(fit * 100);

  switch (key) {
    case 'E':
      return `${aPct}% vs ${bPct}% E · ${fitPct}% fit`;
    case 'N':
      return `${aPct}% vs ${bPct}% N · ${fitPct}% fit`;
    case 'T':
      return `${aPct}% vs ${bPct}% T · ${fitPct}% fit`;
    case 'J':
      return `${aPct}% & ${bPct}% J · ${fitPct}% fit`;
    case 'A':
      return `${aPct}% & ${bPct}% A · ${fitPct}% fit`;
  }
}

function buildStrengthBullet(axis: AxisFitContribution): string {
  const fitPct = Math.round(axis.fit * 100);
  switch (axis.key) {
    case 'E':
      return `Complementary I/E · ${fitPct}%`;
    case 'N':
      return `${axis.studentValue >= 0.5 ? 'Shared Intuition' : 'Shared Realism'} · ${fitPct}%`;
    case 'T':
      return `${axis.studentValue >= 0.5 ? 'Aligned Logic' : 'Aligned Empathy'} · ${fitPct}%`;
    case 'J':
      return `Structure Fit · ${fitPct}%`;
    case 'A':
      return `Calm Composure · ${fitPct}%`;
  }
}

function buildWatchOutNote(axis: AxisFitContribution): string {
  const aPct = Math.round(axis.studentValue * 100);
  const bPct = Math.round(axis.partnerValue * 100);

  switch (axis.key) {
    case 'E':
      if (axis.studentValue >= 0.5 && axis.partnerValue >= 0.5) {
        return `Both Extraverted (${aPct}% · ${bPct}% E)`;
      }
      if (axis.studentValue < 0.5 && axis.partnerValue < 0.5) {
        return `Both Introverted (${aPct}% · ${bPct}% E)`;
      }
      return `Wide Energy Gap (${aPct}% vs ${bPct}% E)`;
    case 'N':
      return `Abstraction Gap (${aPct}% vs ${bPct}% N)`;
    case 'T':
      return `Decision Gap (${aPct}% vs ${bPct}% T)`;
    case 'J':
      if (axis.studentValue < 0.5 && axis.partnerValue < 0.5) {
        return `Low Structure (${aPct}% · ${bPct}% J)`;
      }
      return `Pacing Gap (${aPct}% vs ${bPct}% J)`;
    case 'A':
      if (axis.studentValue < 0.5 && axis.partnerValue < 0.5) {
        return `Stress Sensitive (${aPct}% · ${bPct}% A)`;
      }
      return `Composure Gap (${aPct}% vs ${bPct}% A)`;
  }
}

export function buildPairBreakdown(
  a: StudentProfile,
  b: StudentProfile,
  context: {
    compatMatrix: Record<string, Record<string, number>>;
    simMatrix: Record<string, Record<string, number>>;
    contrastMatrix: Record<string, Record<string, number>>;
    compatEdgeSet: Set<string>;
    optimalPairSet: Set<string>;
    nodeToCommunity: Record<string, number>;
  },
): PairwiseBreakdown {
  const compatibility =
    a.id === b.id
      ? 1.0
      : (context.compatMatrix[a.id]?.[b.id] ?? computePairCompatibility(a, b));
  const similarity =
    a.id === b.id
      ? 1.0
      : (context.simMatrix[a.id]?.[b.id] ?? computePairSimilarity(a, b));
  const contrast =
    a.id === b.id
      ? 0.0
      : (context.contrastMatrix[a.id]?.[b.id] ?? computePairContrast(a, b));

  const edgeKey = canonicalEdgeKey(a.id, b.id);
  const commA = context.nodeToCommunity[a.id];
  const commB = context.nodeToCommunity[b.id];

  const axes: AxisFitContribution[] = TRAIT_METADATA.map((meta) => {
    const key = meta.key;
    const studentValue = a.traits[key];
    const partnerValue = b.traits[key];
    const idealTargetForStudent = a.idealPartner[key];
    const fit = clamp01(
      1.0 -
        0.5 *
          (Math.abs(partnerValue - idealTargetForStudent) +
            Math.abs(studentValue - b.idealPartner[key])),
    );

    return {
      key,
      label: meta.name,
      ruleSummary: meta.compatibilityRule,
      fit,
      studentValue,
      partnerValue,
      idealTargetForStudent,
      narrative: buildAxisNarrative(key, studentValue, partnerValue, fit),
    };
  });

  const sortedByFit = [...axes].sort((x, y) => y.fit - x.fit);
  const strengthAxes =
    sortedByFit[2] && sortedByFit[2].fit >= 0.72
      ? sortedByFit.slice(0, 3)
      : sortedByFit.slice(0, 2);
  const topStrengths = strengthAxes.map(buildStrengthBullet);

  const minAxis = sortedByFit[sortedByFit.length - 1];
  const watchOut = minAxis && minAxis.fit < 0.70 ? buildWatchOutNote(minAxis) : null;

  return {
    studentA: a.id,
    studentB: b.id,
    compatibility,
    similarity,
    contrast,
    is4NNEdge: a.id !== b.id && context.compatEdgeSet.has(edgeKey),
    isOptimalEdmondsPair: a.id !== b.id && context.optimalPairSet.has(edgeKey),
    sameCommunity: commA !== undefined && commB !== undefined && commA === commB,
    axes,
    topStrengths,
    watchOut,
  };
}

export function getTopMatchesForStudent(
  studentId: string,
  students: StudentProfile[],
  getPairBreakdown: (a: string, b: string) => PairwiseBreakdown,
  limit = 6,
): PairwiseBreakdown[] {
  if (limit <= 0) {
    return [];
  }

  return students
    .filter((s) => s.id !== studentId)
    .map((s) => getPairBreakdown(studentId, s.id))
    .sort((x, y) => {
      const diff = y.compatibility - x.compatibility;
      if (diff !== 0) {
        return diff;
      }
      return x.studentB < y.studentB ? -1 : x.studentB > y.studentB ? 1 : 0;
    })
    .slice(0, limit);
}
