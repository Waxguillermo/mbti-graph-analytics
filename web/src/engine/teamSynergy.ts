import { computePairCompatibility } from './compatibility';
import type {
  CandidateAdditionSuggestion,
  InternalPairEdge,
  LouvainCommunity,
  MbtiGroupKey,
  StudentProfile,
  TeamDimensionBalance,
  TeamEvaluation,
  TraitKey,
  TraitVector,
} from './types';

const TRAIT_KEYS: readonly TraitKey[] = ['E', 'N', 'T', 'J', 'A'];
const DISTINCTIVE_TRAIT_PRIORITY: Record<TraitKey, number> = {
  J: 0,
  T: 1,
  N: 2,
  E: 3,
  A: 4,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeTeamMemberIds(
  memberIds: string[],
  studentMap: Record<string, StudentProfile>,
  maxSize = 4,
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawId of memberIds) {
    if (!Object.prototype.hasOwnProperty.call(studentMap, rawId) || seen.has(rawId)) {
      continue;
    }
    seen.add(rawId);
    normalized.push(rawId);
    if (normalized.length >= maxSize) {
      break;
    }
  }

  return normalized;
}

function getPairScore(
  a: StudentProfile,
  b: StudentProfile,
  compatMatrix: Record<string, Record<string, number>>,
): number {
  if (a.id === b.id) {
    return 1.0;
  }
  return compatMatrix[a.id]?.[b.id] ?? computePairCompatibility(a, b);
}

export function formatClusterAlignment(
  memberIds: string[],
  communities: LouvainCommunity[],
  nodeToCommunity: Record<string, number>,
): string {
  const codeByIndex = new Map<number, string>();
  for (const comm of communities) {
    codeByIndex.set(comm.index, comm.code);
  }

  const uniqueIndices = Array.from(
    new Set(
      memberIds
        .map((id) => nodeToCommunity[id])
        .filter((idx): idx is number => idx !== undefined),
    ),
  ).sort((a, b) => a - b);

  if (uniqueIndices.length === 0) {
    return 'Unassigned';
  }

  const codes = uniqueIndices.map((idx) => codeByIndex.get(idx) ?? `C${idx + 1}`);
  if (codes.length === 1) {
    return `Intra-${codes[0]}`;
  }
  if (codes.length === 2) {
    return `Cross (${codes[0]} ↔ ${codes[1]})`;
  }
  return `Cross (${codes.join(' · ')})`;
}

function computeMeanAndSpread(members: StudentProfile[]): {
  meanTraits: TraitVector;
  traitSpread: TraitVector;
} {
  if (members.length === 0) {
    return {
      meanTraits: { E: 0, N: 0, T: 0, J: 0, A: 0 },
      traitSpread: { E: 0, N: 0, T: 0, J: 0, A: 0 },
    };
  }

  const meanTraits: TraitVector = { E: 0, N: 0, T: 0, J: 0, A: 0 };
  const traitSpread: TraitVector = { E: 0, N: 0, T: 0, J: 0, A: 0 };

  for (const key of TRAIT_KEYS) {
    let sum = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (const m of members) {
      const val = m.traits[key];
      sum += val;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }

    meanTraits[key] = sum / members.length;
    traitSpread[key] = members.length > 1 ? maxVal - minVal : 0;
  }

  return { meanTraits, traitSpread };
}

function buildTeamDimensions(
  len: number,
  mean: TraitVector,
  spread: TraitVector,
): TeamDimensionBalance[] {
  if (len === 0) {
    return [
      {
        key: 'energy',
        label: 'Energy Cadence',
        score: 0,
        metricText: 'Mean E 0% · Spread 0pp',
        summary: 'Draft at least one student to evaluate energy cadence.',
      },
      {
        key: 'cognition',
        label: 'Cognitive Alignment',
        score: 0,
        metricText: 'Mean N 0% · T 0%',
        summary: 'Draft at least one student to evaluate cognitive alignment.',
      },
      {
        key: 'structure',
        label: 'Execution Structure',
        score: 0,
        metricText: 'Mean J 0% · Spread 0pp',
        summary: 'Draft at least one student to evaluate execution structure.',
      },
      {
        key: 'composure',
        label: 'Stress Composure',
        score: 0,
        metricText: 'Mean A 0% · Spread 0pp',
        summary: 'Draft at least one student to evaluate stress composure.',
      },
    ];
  }

  const meanEPct = Math.round(mean.E * 100);
  const spreadEPct = Math.round(spread.E * 100);
  const energyScore = clamp01(
    1 - Math.abs(mean.E - 0.50) * 1.4 - (len > 1 && spread.E < 0.10 ? 0.12 : 0),
  );
  const energySummary =
    len === 1
      ? `Solo baseline at ${meanEPct}% E (${mean.E < 0.5 ? 'Introverted' : 'Extraverted'}); ideal complement targets ${Math.round((1 - mean.E) * 100)}% E.`
      : Math.abs(mean.E - 0.50) <= 0.12 && spread.E >= 0.15
        ? `Complementary pole balance (${meanEPct}% mean E, ${spreadEPct}pp spread) blends active facilitation with deep focus.`
        : mean.E > 0.62
          ? `Extravert-leaning cadence (${meanEPct}% mean E, ${spreadEPct}pp spread); use structured turn-taking in live debates.`
          : mean.E < 0.38
            ? `Introvert-leaning cadence (${meanEPct}% mean E, ${spreadEPct}pp spread); pair async written prep with scheduled syncs.`
            : `Moderate energy distribution (${meanEPct}% mean E, ${spreadEPct}pp spread) supports steady discussion flow.`;

  const meanNPct = Math.round(mean.N * 100);
  const meanTPct = Math.round(mean.T * 100);
  const spreadNPct = Math.round(spread.N * 100);
  const spreadTPct = Math.round(spread.T * 100);
  const cognitionScore =
    len > 1 ? clamp01(1 - 0.5 * (spread.N + spread.T) * 1.15) : 0.85;
  const cognitionSummary =
    len === 1
      ? `Solo cognitive baseline at ${meanNPct}% N and ${meanTPct}% T; aligned N/T peers minimize translation overhead.`
      : 0.5 * (spread.N + spread.T) <= 0.18
        ? `Tight N/T bandwidth (${spreadNPct}pp N spread, ${spreadTPct}pp T spread) enables low-friction problem framing.`
        : spread.N > 0.30 || spread.T > 0.35
          ? `Wide cognitive span (${spreadNPct}pp N spread, ${spreadTPct}pp T spread) pairs big-picture synthesis with pragmatic checks.`
          : `Compatible N/T bandwidth (${spreadNPct}pp N spread, ${spreadTPct}pp T spread) balances shared vocabulary with diverse angles.`;

  const meanJPct = Math.round(mean.J * 100);
  const spreadJPct = Math.round(spread.J * 100);
  const structureScore = clamp01(
    1 - Math.abs(mean.J - 0.65) * 1.45 - Math.max(0, spread.J - 0.40) * 0.5,
  );
  const structureSummary =
    Math.abs(mean.J - 0.65) <= 0.12
      ? `Well-anchored near the 65% Judging target (${meanJPct}% mean J, ${spreadJPct}pp spread) for reliable milestone delivery.`
      : mean.J < 0.53
        ? `Prospecting-leaning flexibility (${meanJPct}% mean J vs 65% anchor); lock intermediate checkpoints early.`
        : `High Judging structure (${meanJPct}% mean J vs 65% anchor); preserve early exploration buffers before freezing scope.`;

  const meanAPct = Math.round(mean.A * 100);
  const spreadAPct = Math.round(spread.A * 100);
  const composureScore = clamp01(
    1 - Math.abs(mean.A - 0.65) * 1.45 - Math.max(0, 0.45 - mean.A) * 0.4,
  );
  const composureSummary =
    Math.abs(mean.A - 0.65) <= 0.12
      ? `Steady composure near the 65% Assertive target (${meanAPct}% mean A, ${spreadAPct}pp spread) cushions deadline pressure.`
      : mean.A < 0.53
        ? `Turbulent-leaning quality drive (${meanAPct}% mean A vs 65% anchor); set clear 'done' criteria to curb late rework.`
        : `High Assertive confidence (${meanAPct}% mean A vs 65% anchor); proactively stress-test edge cases before delivery.`;

  return [
    {
      key: 'energy',
      label: 'Energy Cadence',
      score: energyScore,
      metricText: `Mean E ${meanEPct}% · Spread ${spreadEPct}pp`,
      summary: energySummary,
    },
    {
      key: 'cognition',
      label: 'Cognitive Alignment',
      score: cognitionScore,
      metricText: `Mean N ${meanNPct}% · T ${meanTPct}%`,
      summary: cognitionSummary,
    },
    {
      key: 'structure',
      label: 'Execution Structure',
      score: structureScore,
      metricText: `Mean J ${meanJPct}% · Spread ${spreadJPct}pp`,
      summary: structureSummary,
    },
    {
      key: 'composure',
      label: 'Stress Composure',
      score: composureScore,
      metricText: `Mean A ${meanAPct}% · Spread ${spreadAPct}pp`,
      summary: composureSummary,
    },
  ];
}

function buildTeamStrengths(params: {
  members: StudentProfile[];
  studentMap: Record<string, StudentProfile>;
  strongestLink: InternalPairEdge | null;
  weakestLink: InternalPairEdge | null;
  meanTraits: TraitVector;
  dimensions: TeamDimensionBalance[];
}): string[] {
  const {
    members,
    studentMap,
    strongestLink,
    weakestLink,
    meanTraits,
    dimensions,
  } = params;

  if (members.length === 0) {
    return [];
  }

  if (members.length === 1) {
    const m = members[0];
    return [
      `${Math.round(m.traits.N * 100)}% N · ${Math.round(m.traits.T * 100)}% T baseline`,
      `Targets ${Math.round(m.idealPartner.E * 100)}% E · ${Math.round(m.idealPartner.J * 100)}% J`,
    ];
  }

  const bullets: string[] = [];

  if (strongestLink) {
    const nameA = studentMap[strongestLink.memberA]?.displayName ?? strongestLink.memberA;
    const nameB = studentMap[strongestLink.memberB]?.displayName ?? strongestLink.memberB;
    bullets.push(
      `Anchor: ${nameA} ↔ ${nameB} (${Math.round(strongestLink.compatibility * 100)}%)`,
    );
  }

  if (members.length >= 3 && weakestLink && weakestLink.compatibility >= 0.78) {
    bullets.push(`Strong floor (${Math.round(weakestLink.compatibility * 100)}% min)`);
  }

  const rankedDims = [...dimensions].sort((a, b) => b.score - a.score);
  for (const dim of rankedDims) {
    if (bullets.length >= 3) {
      break;
    }
    if (dim.score < 0.72 && bullets.length >= 2) {
      continue;
    }

    if (dim.key === 'energy') {
      bullets.push(`Balanced I/E (${Math.round(meanTraits.E * 100)}% E)`);
    } else if (dim.key === 'cognition') {
      bullets.push(`Aligned N/T (${Math.round(meanTraits.N * 100)}% · ${Math.round(meanTraits.T * 100)}%)`);
    } else if (dim.key === 'structure') {
      bullets.push(`Solid structure (${Math.round(meanTraits.J * 100)}% J)`);
    } else if (dim.key === 'composure') {
      bullets.push(`Steady calm (${Math.round(meanTraits.A * 100)}% A)`);
    }
  }

  return bullets.slice(0, 3);
}

function buildTeamBlindSpots(params: {
  members: StudentProfile[];
  studentMap: Record<string, StudentProfile>;
  weakestLink: InternalPairEdge | null;
  meanTraits: TraitVector;
  traitSpread: TraitVector;
}): string[] {
  const { members, studentMap, weakestLink, meanTraits, traitSpread } = params;

  if (members.length <= 1) {
    return [];
  }

  const warnings: string[] = [];

  if (weakestLink && weakestLink.compatibility < 0.78) {
    const nameA = studentMap[weakestLink.memberA]?.displayName ?? weakestLink.memberA;
    const nameB = studentMap[weakestLink.memberB]?.displayName ?? weakestLink.memberB;
    warnings.push(
      `Friction risk: ${nameA} ↔ ${nameB} (${Math.round(weakestLink.compatibility * 100)}%)`,
    );
  }

  if (meanTraits.J < 0.46) {
    warnings.push(`Low Judging (${Math.round(meanTraits.J * 100)}% J) — set milestones`);
  } else if (meanTraits.J > 0.78) {
    warnings.push(`High rigidity (${Math.round(meanTraits.J * 100)}% J)`);
  }

  if (members.every((m) => m.traits.E < 0.42)) {
    warnings.push(`All Introverted (<42% E)`);
  } else if (members.every((m) => m.traits.E > 0.68)) {
    warnings.push(`All Extraverted (>68% E)`);
  }

  if (meanTraits.A < 0.42) {
    warnings.push(`Stress sensitive (${Math.round(meanTraits.A * 100)}% A)`);
  }

  if (traitSpread.N > 0.35) {
    warnings.push(`Wide N spread (${Math.round(traitSpread.N * 100)}pp)`);
  }

  if (traitSpread.T > 0.40) {
    warnings.push(`Wide T spread (${Math.round(traitSpread.T * 100)}pp)`);
  }

  return warnings.slice(0, 2);
}

function describeTraitContributionPhrase(key: TraitKey, value: number): string {
  const pct = Math.round(value * 100);
  switch (key) {
    case 'E':
      return value >= 0.5 ? `Facilitation (${pct}% E)` : `Deep Focus (${pct}% E)`;
    case 'N':
      return value >= 0.5 ? `Vision (${pct}% N)` : `Pragmatism (${pct}% N)`;
    case 'T':
      return value >= 0.5 ? `Logic (${pct}% T)` : `Empathy (${pct}% T)`;
    case 'J':
      return value >= 0.5 ? `Structure (${pct}% J)` : `Agility (${pct}% J)`;
    case 'A':
      return value >= 0.5 ? `Composure (${pct}% A)` : `Quality Care (${pct}% A)`;
  }
}

function buildMemberNaturalContribution(member: StudentProfile): string {
  const rankedTraits = [...TRAIT_KEYS].sort((a, b) => {
    const distDiff = Math.abs(member.traits[b] - 0.5) - Math.abs(member.traits[a] - 0.5);
    if (Math.abs(distDiff) > 1e-9) {
      return distDiff;
    }
    return DISTINCTIVE_TRAIT_PRIORITY[a] - DISTINCTIVE_TRAIT_PRIORITY[b];
  });

  const firstPhrase = describeTraitContributionPhrase(
    rankedTraits[0],
    member.traits[rankedTraits[0]],
  );
  return firstPhrase;
}

export function evaluateTeamSynergy(params: {
  memberIds: string[];
  studentMap: Record<string, StudentProfile>;
  compatMatrix: Record<string, Record<string, number>>;
  communities: LouvainCommunity[];
  nodeToCommunity: Record<string, number>;
}): TeamEvaluation {
  const { studentMap, compatMatrix, communities, nodeToCommunity } = params;
  const memberIds = normalizeTeamMemberIds(params.memberIds, studentMap, 4);
  const members = memberIds.map((id) => studentMap[id]);
  const len = members.length;

  const formatLabel: TeamEvaluation['formatLabel'] =
    len <= 1 ? 'Solo Draft' : len === 2 ? 'Duo' : len === 3 ? 'Trio' : 'Quartet';

  const rawPairs: Array<{ memberA: string; memberB: string; compatibility: number }> = [];
  for (let i = 0; i < len; i += 1) {
    for (let j = i + 1; j < len; j += 1) {
      rawPairs.push({
        memberA: members[i].id,
        memberB: members[j].id,
        compatibility: getPairScore(members[i], members[j], compatMatrix),
      });
    }
  }

  let meanCohesion = 0;
  let strongestLink: InternalPairEdge | null = null;
  let weakestLink: InternalPairEdge | null = null;
  let pairEdges: InternalPairEdge[] = [];

  if (rawPairs.length > 0) {
    let sumCompat = 0;
    let maxIdx = 0;
    let minIdx = 0;

    for (let idx = 0; idx < rawPairs.length; idx += 1) {
      const score = rawPairs[idx].compatibility;
      sumCompat += score;
      if (score > rawPairs[maxIdx].compatibility) {
        maxIdx = idx;
      }
      if (score < rawPairs[minIdx].compatibility) {
        minIdx = idx;
      }
    }

    meanCohesion = sumCompat / rawPairs.length;
    pairEdges = rawPairs.map((pair, idx) => ({
      memberA: pair.memberA,
      memberB: pair.memberB,
      compatibility: pair.compatibility,
      isStrongest: idx === maxIdx,
      isWeakest: idx === minIdx,
    }));
    strongestLink = pairEdges[maxIdx];
    weakestLink = pairEdges[minIdx];
  }

  const { meanTraits, traitSpread } = computeMeanAndSpread(members);

  const groupCounts: Record<MbtiGroupKey, number> = {
    analysts: 0,
    diplomats: 0,
    sentinels: 0,
    explorers: 0,
  };
  for (const m of members) {
    groupCounts[m.group] += 1;
  }

  const communityAlignment = formatClusterAlignment(memberIds, communities, nodeToCommunity);
  const dimensions = buildTeamDimensions(len, meanTraits, traitSpread);
  const strengths = buildTeamStrengths({
    members,
    studentMap,
    strongestLink,
    weakestLink,
    meanTraits,
    dimensions,
  });
  const blindSpots = buildTeamBlindSpots({
    members,
    studentMap,
    weakestLink,
    meanTraits,
    traitSpread,
  });
  const collaborationPlaybook = members.map((m) => ({
    studentId: m.id,
    naturalContribution: buildMemberNaturalContribution(m),
  }));

  return {
    memberIds,
    formatLabel,
    meanCohesion,
    weakestLink,
    strongestLink,
    pairEdges,
    meanTraits,
    traitSpread,
    groupCounts,
    communityAlignment,
    dimensions,
    strengths,
    blindSpots,
    collaborationPlaybook,
  };
}

function buildCandidateSynergyClause(
  candidate: StudentProfile,
  teamMean: TraitVector,
): string {
  const idealTarget: TraitVector = {
    E: 1.0 - teamMean.E,
    N: teamMean.N,
    T: teamMean.T,
    J: 0.5 * (teamMean.J + 0.65),
    A: 0.5 * (teamMean.A + 0.65),
  };

  let bestKey: TraitKey = 'E';
  let minGap = Infinity;
  for (const k of TRAIT_KEYS) {
    const gap = Math.abs(candidate.traits[k] - idealTarget[k]);
    if (gap < minGap) {
      minGap = gap;
      bestKey = k;
    }
  }

  const candPct = Math.round(candidate.traits[bestKey] * 100);

  switch (bestKey) {
    case 'E':
      return `Balances energy (${candPct}% E)`;
    case 'N':
      return `Aligns vision (${candPct}% N)`;
    case 'T':
      return `Matches logic (${candPct}% T)`;
    case 'J':
      return `Adds structure (${candPct}% J)`;
    case 'A':
      return `Adds calm (${candPct}% A)`;
  }
}

export function suggestTeamCandidates(params: {
  currentMemberIds: string[];
  limit?: number;
  students: StudentProfile[];
  studentMap: Record<string, StudentProfile>;
  compatMatrix: Record<string, Record<string, number>>;
}): CandidateAdditionSuggestion[] {
  const limit = params.limit ?? 6;
  if (limit <= 0 || params.students.length === 0) {
    return [];
  }

  const currentIds = normalizeTeamMemberIds(params.currentMemberIds, params.studentMap, 4);

  if (currentIds.length === 0) {
    const stats = params.students.map((cand) => {
      const peers = params.students.filter((s) => s.id !== cand.id);
      if (peers.length === 0) {
        return { cand, meanCompat: 1.0, minCompat: 1.0 };
      }
      let sum = 0;
      let minCompat = Infinity;
      for (const peer of peers) {
        const c = getPairScore(cand, peer, params.compatMatrix);
        sum += c;
        if (c < minCompat) minCompat = c;
      }
      return { cand, meanCompat: sum / peers.length, minCompat };
    });

    const overallCohortMean =
      stats.reduce((acc, item) => acc + item.meanCompat, 0) / stats.length;

    return stats
      .sort((a, b) => {
        const diff = b.meanCompat - a.meanCompat;
        if (diff !== 0) return diff;
        return a.cand.id < b.cand.id ? -1 : a.cand.id > b.cand.id ? 1 : 0;
      })
      .slice(0, limit)
      .map(({ cand, meanCompat, minCompat }) => ({
        candidateId: cand.id,
        resultingMeanCohesion: meanCompat,
        deltaMeanCohesion: meanCompat - overallCohortMean,
        resultingWeakestLink: minCompat,
        rationale: `Cohort connector · ${Math.round(meanCompat * 100)}% avg fit`,
      }));
  }

  if (currentIds.length >= 4) {
    return [];
  }

  const currentMembers = currentIds.map((id) => params.studentMap[id]);
  const { meanTraits: currentMeanTraits } = computeMeanAndSpread(currentMembers);
  const currentSet = new Set(currentIds);

  let baselineCohesion = 0;
  if (currentMembers.length === 1) {
    const solo = currentMembers[0];
    const peers = params.students.filter((s) => s.id !== solo.id);
    if (peers.length > 0) {
      const sum = peers.reduce(
        (acc, peer) => acc + getPairScore(solo, peer, params.compatMatrix),
        0,
      );
      baselineCohesion = sum / peers.length;
    }
  } else {
    let pairSum = 0;
    let pairCount = 0;
    for (let i = 0; i < currentMembers.length; i += 1) {
      for (let j = i + 1; j < currentMembers.length; j += 1) {
        pairSum += getPairScore(currentMembers[i], currentMembers[j], params.compatMatrix);
        pairCount += 1;
      }
    }
    baselineCohesion = pairCount > 0 ? pairSum / pairCount : 0;
  }

  const scoredCandidates: Array<{
    compositeScore: number;
    suggestion: CandidateAdditionSuggestion;
  }> = [];

  for (const cand of params.students) {
    if (currentSet.has(cand.id)) {
      continue;
    }

    const nextMembers = [...currentMembers, cand];
    let pairSum = 0;
    let pairCount = 0;
    let minLink = Infinity;

    for (let i = 0; i < nextMembers.length; i += 1) {
      for (let j = i + 1; j < nextMembers.length; j += 1) {
        const score = getPairScore(nextMembers[i], nextMembers[j], params.compatMatrix);
        pairSum += score;
        pairCount += 1;
        if (score < minLink) {
          minLink = score;
        }
      }
    }

    const resultingMeanCohesion = pairCount > 0 ? pairSum / pairCount : 1.0;
    const resultingWeakestLink = Number.isFinite(minLink) ? minLink : 1.0;
    const compositeScore = 0.75 * resultingMeanCohesion + 0.25 * resultingWeakestLink;
    const deltaMeanCohesion = resultingMeanCohesion - baselineCohesion;
    const rationale = buildCandidateSynergyClause(cand, currentMeanTraits);

    scoredCandidates.push({
      compositeScore,
      suggestion: {
        candidateId: cand.id,
        resultingMeanCohesion,
        deltaMeanCohesion,
        resultingWeakestLink,
        rationale,
      },
    });
  }

  return scoredCandidates
    .sort((a, b) => {
      const compDiff = b.compositeScore - a.compositeScore;
      if (compDiff !== 0) return compDiff;
      const meanDiff =
        b.suggestion.resultingMeanCohesion - a.suggestion.resultingMeanCohesion;
      if (meanDiff !== 0) return meanDiff;
      return a.suggestion.candidateId < b.suggestion.candidateId
        ? -1
        : a.suggestion.candidateId > b.suggestion.candidateId
          ? 1
          : 0;
    })
    .slice(0, limit)
    .map((entry) => entry.suggestion);
}
