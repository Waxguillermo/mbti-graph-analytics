import {
  buildCompatibilityMatricesAndEdges,
  buildPairBreakdown,
  canonicalEdgeKey,
  computePairCompatibility,
  computePairContrast,
  computePairSimilarity,
  getTopMatchesForStudent,
} from './compatibility';
import { computeCohortAllocation, maxWeightCardinalityMatching } from './cohortMatcher';
import { inferCohortSource, parseCohortCsv } from './csvLoader';
import { buildGraphAndCommunities } from './graphMetrics';
import { formatClusterAlignment, evaluateTeamSynergy, suggestTeamCandidates } from './teamSynergy';
import type {
  AllocationFormat,
  CohortDataset,
  StudentProfile,
} from './types';

export * from './types';
export * from './mbtiMetadata';
export {
  parseCohortCsv,
  inferCohortSource,
  canonicalEdgeKey,
  computePairCompatibility,
  computePairSimilarity,
  computePairContrast,
  buildCompatibilityMatricesAndEdges,
  buildGraphAndCommunities,
  evaluateTeamSynergy,
  suggestTeamCandidates,
  formatClusterAlignment,
  maxWeightCardinalityMatching,
  computeCohortAllocation,
};

export function buildCohortDatasetFromCsv(
  csvText: string,
  source?: 'local-private' | 'public-anon',
): CohortDataset {
  const students = parseCohortCsv(csvText);
  if (students.length === 0) {
    throw new Error('Cohort CSV contains zero completed student profiles (Complétion === "Yes").');
  }

  const resolvedSource = inferCohortSource(students, source);
  const studentMap: Record<string, StudentProfile> = {};
  for (const student of students) {
    studentMap[student.id] = student;
  }

  const {
    compatMatrix,
    simMatrix,
    contrastMatrix,
    compatEdges,
    simEdges,
    contrastEdges,
  } = buildCompatibilityMatricesAndEdges(students);

  const {
    graphs,
    communities,
    nodeToCommunity,
    nodePositions,
  } = buildGraphAndCommunities({
    students,
    compatEdges,
    simEdges,
    contrastEdges,
  });

  const defaultAllocation = computeCohortAllocation({
    format: 'dyads',
    lockedTeamIds: null,
    students,
    compatMatrix,
    compatEdges,
    communities,
    nodeToCommunity,
  });

  const compatEdgeSet = new Set<string>();
  for (const edge of compatEdges) {
    compatEdgeSet.add(canonicalEdgeKey(edge.source, edge.target));
  }

  const optimalPairSet = new Set<string>();
  for (const team of defaultAllocation.teams) {
    const members = team.memberIds;
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        optimalPairSet.add(canonicalEdgeKey(members[i], members[j]));
      }
    }
  }

  const breakdownContext = {
    compatMatrix,
    simMatrix,
    contrastMatrix,
    compatEdgeSet,
    optimalPairSet,
    nodeToCommunity,
  };

  const getPairBreakdown = (studentA: string, studentB: string) => {
    const profileA = studentMap[studentA];
    const profileB = studentMap[studentB];
    if (!profileA || !profileB) {
      throw new Error(`Unknown student ID in getPairBreakdown("${studentA}", "${studentB}").`);
    }
    return buildPairBreakdown(profileA, profileB, breakdownContext);
  };

  const getTopMatches = (studentId: string, limit = 6) =>
    getTopMatchesForStudent(studentId, students, getPairBreakdown, limit);

  const evaluateTeam = (memberIds: string[]) =>
    evaluateTeamSynergy({
      memberIds,
      studentMap,
      compatMatrix,
      communities,
      nodeToCommunity,
    });

  const suggestCandidatesForTeam = (currentMemberIds: string[], limit = 6) =>
    suggestTeamCandidates({
      currentMemberIds,
      limit,
      students,
      studentMap,
      compatMatrix,
    });

  const computeAllocation = (
    format: AllocationFormat,
    lockedTeamIds?: string[] | null,
  ) =>
    computeCohortAllocation({
      format,
      lockedTeamIds,
      students,
      compatMatrix,
      compatEdges,
      communities,
      nodeToCommunity,
    });

  return {
    source: resolvedSource,
    students,
    studentMap,
    compatMatrix,
    simMatrix,
    contrastMatrix,
    graphs,
    communities,
    nodeToCommunity,
    nodePositions,
    defaultAllocation,
    getPairBreakdown,
    getTopMatches,
    evaluateTeam,
    suggestCandidatesForTeam,
    computeAllocation,
  };
}

function looksLikeValidCohortCsv(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed || trimmed.startsWith('<')) {
    return false;
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.includes('MBTI') && firstLine.includes('ID mail');
}

export async function loadCohortDataset(): Promise<CohortDataset> {
  try {
    const res = await fetch('/__cohort.csv', { cache: 'no-store' });
    if (res.ok) {
      const csvText = await res.text();
      if (looksLikeValidCohortCsv(csvText)) {
        const headerSource = res.headers.get('X-Cohort-Source');
        const explicitSource =
          headerSource === 'local-private' || headerSource === 'public-anon'
            ? headerSource
            : undefined;
        return buildCohortDatasetFromCsv(csvText, explicitSource);
      }
    }
  } catch {
    // Fall through to static anonymized cohort fallback
  }

  const fallbackRes = await fetch('/cohort_fallback.csv');
  if (!fallbackRes.ok) {
    throw new Error(
      `Failed to load cohort dataset from both /__cohort.csv and /cohort_fallback.csv (HTTP ${fallbackRes.status}).`,
    );
  }
  const fallbackCsvText = await fallbackRes.text();
  if (!looksLikeValidCohortCsv(fallbackCsvText)) {
    throw new Error('Fallback cohort file /cohort_fallback.csv did not contain valid CSV headers.');
  }
  return buildCohortDatasetFromCsv(fallbackCsvText, 'public-anon');
}
