export type TraitKey = 'E' | 'N' | 'T' | 'J' | 'A';

export type MbtiCode =
  | 'INTJ'
  | 'INTP'
  | 'ENTJ'
  | 'ENTP'
  | 'INFJ'
  | 'INFP'
  | 'ENFJ'
  | 'ENFP'
  | 'ISTJ'
  | 'ISFJ'
  | 'ESTJ'
  | 'ESFJ'
  | 'ISTP'
  | 'ISFP'
  | 'ESTP'
  | 'ESFP';

export type MbtiGroupKey = 'analysts' | 'diplomats' | 'sentinels' | 'explorers';

export type VariantKey = '-A' | '-T';

export type GraphModelId = 'compatibility' | 'similarity' | 'contrast';

export type TeamSizeFormat = 2 | 3 | 4;

export type AllocationFormat = 'dyads' | 'trios' | 'quartets';

export type ActiveWorkspaceTab = 'for-you' | 'team-studio' | 'cohort-network';

export interface TraitVector {
  E: number; // [0, 1] Energy (Extraverted vs Introverted)
  N: number; // [0, 1] Mind (Intuitive vs Observant)
  T: number; // [0, 1] Nature (Thinking vs Feeling)
  J: number; // [0, 1] Tactics (Judging vs Prospecting)
  A: number; // [0, 1] Identity (Assertive vs Turbulent)
}

export interface StudentProfile {
  id: string; // Exact student ID from CSV ("ID mail")
  displayName: string; // Formatted clean label from ID
  mbti: MbtiCode;
  variant: VariantKey;
  fullType: string; // e.g. "ENTJ-A"
  group: MbtiGroupKey;
  traits: TraitVector;
  idealPartner: TraitVector; // x_u^* = (1 - E, N, T, 0.5*(J + 0.65), 0.5*(A + 0.65))
}

export interface AxisFitContribution {
  key: TraitKey;
  label: string;
  ruleSummary: string;
  fit: number; // [0, 1] normalized alignment on this axis
  studentValue: number;
  partnerValue: number;
  idealTargetForStudent: number;
  narrative: string; // Data-driven 1-line explanation strictly from CSV numbers
}

export interface PairwiseBreakdown {
  studentA: string;
  studentB: string;
  compatibility: number; // Symmetric L2/sqrt(5) compatibility in [0, 1]
  similarity: number; // Baseline 1 L1 similarity in [0, 1]
  contrast: number; // Baseline 2 polar opposition in [0, 1]
  is4NNEdge: boolean; // Whether (A, B) is in sparse 4-NN G_compat
  isOptimalEdmondsPair: boolean; // Whether (A, B) is in global Edmonds matching (dyad or triad)
  sameCommunity: boolean;
  axes: AxisFitContribution[]; // Ordered 5-axis contributions (E, N, T, J, A)
  topStrengths: string[]; // Top 2-3 factual highlights derived from axes
  watchOut: string | null; // Optional factual friction note if an axis fit is low
}

export interface NodeCentrality {
  studentId: string;
  component: number;
  degree: number;
  degreeCentrality: number;
  strength: number;
  betweenness: number; // Unweighted Brandes normalized
  betweennessWeighted: number; // Weighted Brandes on d = 1 - w
  closeness: number; // Wasserman-Faust improved
  closenessWeighted: number;
  eigenvector: number;
  isBridgeHub: boolean; // Top bridge / hub indicator in G_compat
}

export interface LouvainCommunity {
  index: number; // 0..k-1
  code: string; // e.g. "C1"
  archetype: string; // e.g. "Strategic Drivers"
  fullLabel: string; // e.g. "C1 · Strategic Drivers"
  color: string;
  fillRgba: string;
  borderRgba: string;
  members: string[];
  meanTraits: TraitVector;
  dominantMbtiGroups: MbtiGroupKey[];
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number; // [0, 1]
  distance: number; // 1 - weight
}

export interface GraphTopologySummary {
  modelId: GraphModelId;
  title: string;
  subtitle: string;
  settingLabel: string;
  nodeCount: number;
  edgeCount: number;
  density: number;
  connected: boolean;
  componentCount: number;
  largestComponentShare: number; // [0, 1]
  diameterHops: number;
  radiusHops: number;
  weightedDiameter: number;
  weightedRadius: number;
  centerNodes: string[];
  peripheryNodes: string[];
  modularityQ: number;
  edges: GraphEdge[];
  centralities: Record<string, NodeCentrality>;
}

export interface CohortDataset {
  source: 'local-private' | 'public-anon';
  students: StudentProfile[];
  studentMap: Record<string, StudentProfile>;
  compatMatrix: Record<string, Record<string, number>>;
  simMatrix: Record<string, Record<string, number>>;
  contrastMatrix: Record<string, Record<string, number>>;
  graphs: Record<GraphModelId, GraphTopologySummary>;
  communities: LouvainCommunity[];
  nodeToCommunity: Record<string, number>;
  nodePositions: Record<string, { x: number; y: number }>; // Deterministic spring layout in [-1, 1]^2
  defaultAllocation: CohortAllocationResult; // Exact Edmonds dyads + max-min triad on G_compat
  getPairBreakdown: (studentA: string, studentB: string) => PairwiseBreakdown;
  getTopMatches: (studentId: string, limit?: number) => PairwiseBreakdown[];
  evaluateTeam: (memberIds: string[]) => TeamEvaluation;
  suggestCandidatesForTeam: (
    currentMemberIds: string[],
    limit?: number,
  ) => CandidateAdditionSuggestion[];
  computeAllocation: (
    format: AllocationFormat,
    lockedTeamIds?: string[] | null,
  ) => CohortAllocationResult;
}

export interface InternalPairEdge {
  memberA: string;
  memberB: string;
  compatibility: number;
  isStrongest: boolean;
  isWeakest: boolean;
}

export interface TeamDimensionBalance {
  key: 'energy' | 'cognition' | 'structure' | 'composure';
  label: string;
  score: number; // [0, 1] health/fit indicator strictly derived from 5D traits
  metricText: string; // e.g. "Mean E 52% · Spread 24pp"
  summary: string;
}

export interface TeamEvaluation {
  memberIds: string[];
  formatLabel: 'Solo Draft' | 'Duo' | 'Trio' | 'Quartet';
  meanCohesion: number; // Arithmetic mean of pairwise compatibilities in [0, 1]
  weakestLink: InternalPairEdge | null;
  strongestLink: InternalPairEdge | null;
  pairEdges: InternalPairEdge[];
  meanTraits: TraitVector;
  traitSpread: TraitVector; // Max - min per trait across members
  groupCounts: Record<MbtiGroupKey, number>;
  communityAlignment: string; // e.g. "Intra-C1" or "Cross (C1 ↔ C3)"
  dimensions: TeamDimensionBalance[];
  strengths: string[]; // Factual data-driven team strengths
  blindSpots: string[]; // Factual data-driven watch-outs (if any)
  collaborationPlaybook: Array<{
    studentId: string;
    naturalContribution: string; // Strictly derived from their highest/distinctive CSV traits
  }>;
}

export interface CandidateAdditionSuggestion {
  candidateId: string;
  resultingMeanCohesion: number;
  deltaMeanCohesion: number; // Resulting meanCohesion - current meanCohesion (or vs personal top baseline if size=1)
  resultingWeakestLink: number;
  rationale: string; // Data-driven explanation of why this candidate fits best
}

export interface AllocatedTeam {
  id: string;
  name: string; // e.g. "Team 01"
  format: 'Dyad (2)' | 'Triad (3)' | 'Quartet (4)';
  memberIds: string[];
  isLockedCustomTeam: boolean;
  meanCompatibility: number;
  weakestCompatibility: number;
  clusterAlignment: string;
}

export interface CohortAllocationResult {
  format: AllocationFormat;
  lockedTeamIds: string[] | null;
  teams: AllocatedTeam[];
  meanCohortCompatibility: number;
  minTeamCompatibility: number;
  maxTeamCompatibility: number;
  totalEdgeWeight: number;
  methodologyNote: string;
}
