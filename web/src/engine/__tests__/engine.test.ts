import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCohortDatasetFromCsv,
  loadCohortDataset,
  maxWeightCardinalityMatching,
} from '../index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../');
const anonCsvPath = path.join(repoRoot, 'mbti_profiles_anon.csv');

function resolveLocalPrivateCsvPath(): string {
  const worktreeCsv = path.join(repoRoot, 'mbti_profiles.csv');
  if (fs.existsSync(worktreeCsv)) return worktreeCsv;
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const absCommon = path.resolve(repoRoot, commonDir);
    if (path.basename(absCommon) === '.git') {
      return path.join(path.dirname(absCommon), 'mbti_profiles.csv');
    }
  } catch {
    // Ignore git resolution fallback
  }
  return worktreeCsv;
}

const localPrivateCsvPath = resolveLocalPrivateCsvPath();

describe('MBTI Cohort Mathematical, Graph & Team Synergy Engine', () => {
  const anonCsvText = fs.readFileSync(anonCsvPath, 'utf8');
  const dataset = buildCohortDatasetFromCsv(anonCsvText, 'public-anon');

  it('parses mbti_profiles_anon.csv with exact N=25 completed profiles and idealPartner targets', () => {
    expect(dataset.source).toBe('public-anon');
    expect(dataset.students).toHaveLength(25);
    expect(dataset.students[0].id).toBe('S01');
    expect(dataset.students[0].displayName).toBe('Student S01');
    expect(dataset.students[0].fullType).toBe('INTJ-A');
    expect(dataset.students[0].group).toBe('analysts');

    const s01 = dataset.studentMap['S01'];
    expect(s01.traits.E).toBeCloseTo(0.36, 6);
    expect(s01.traits.N).toBeCloseTo(0.64, 6);
    expect(s01.traits.T).toBeCloseTo(0.67, 6);
    expect(s01.traits.J).toBeCloseTo(0.58, 6);
    expect(s01.traits.A).toBeCloseTo(0.83, 6);

    expect(s01.idealPartner.E).toBeCloseTo(0.64, 6);
    expect(s01.idealPartner.N).toBeCloseTo(0.64, 6);
    expect(s01.idealPartner.T).toBeCloseTo(0.67, 6);
    expect(s01.idealPartner.J).toBeCloseTo(0.5 * (0.58 + 0.65), 6);
    expect(s01.idealPartner.A).toBeCloseTo(0.5 * (0.83 + 0.65), 6);
  });

  it('handles CRLF, non-breaking spaces, and optional columns cleanly', () => {
    const crlfWithScreen = [
      'ID mail,MBTI,Variante,Screen,Énergie · E (%),Esprit · N (%),Nature · T (%),Tactique · J (%),Identité · A (%),Complétion',
      'S01,INTJ,-A,ok,36\u00a0%,64 %,67%,58\u00a0%,83%,Yes',
      'S02,ENTP,-A,ok,51%,54%,76%,33%,53%,Yes',
      'S99,ENFJ,-T,,50%,50%,50%,50%,50%,No',
    ].join('\r\n');

    const parsed = buildCohortDatasetFromCsv(crlfWithScreen);
    expect(parsed.students).toHaveLength(2);
    expect(parsed.source).toBe('public-anon');
  });

  it('matches base_notebook.ipynb exact edge counts, distances, and centralities on N=25', () => {
    const gCompat = dataset.graphs.compatibility;
    const gSim = dataset.graphs.similarity;
    const gContrast = dataset.graphs.contrast;

    expect(gCompat.nodeCount).toBe(25);
    expect(gCompat.edgeCount).toBe(73);
    expect(gSim.edgeCount).toBe(174);
    expect(gContrast.edgeCount).toBe(97);

    expect(gCompat.connected).toBe(true);
    expect(gCompat.componentCount).toBe(1);
    expect(gCompat.largestComponentShare).toBe(1);

    expect(gCompat.diameterHops).toBe(4);
    expect(gCompat.radiusHops).toBe(2);
    expect(gCompat.weightedDiameter).toBeCloseTo(0.618613, 3);
    expect(gCompat.weightedRadius).toBeCloseTo(0.312018, 3);
    expect(gCompat.centerNodes).toEqual(['S15']);
    expect(gCompat.peripheryNodes).toEqual(['S05', 'S10']);

    const s15 = gCompat.centralities['S15'];
    expect(s15.degree).toBe(11);
    expect(s15.degreeCentrality).toBeCloseTo(11 / 24, 5);
    expect(s15.strength).toBeCloseTo(9.605073, 4);
    expect(s15.betweenness).toBeCloseTo(0.199032, 4);
    expect(s15.betweennessWeighted).toBeCloseTo(0.235507, 4);
    expect(s15.closeness).toBeCloseTo(0.648649, 4);
    expect(s15.closenessWeighted).toBeCloseTo(5.096753, 4);
    expect(s15.eigenvector).toBeCloseTo(0.386018, 4);
    expect(s15.isBridgeHub).toBe(true);

    const bridgeHubs = Object.values(gCompat.centralities).filter((c) => c.isBridgeHub);
    expect(bridgeHubs).toHaveLength(4);
  });

  it('detects 4 Louvain communities on G_compat with Q in [0.33, 0.35] and clean non-duplicate archetypes', () => {
    const gCompat = dataset.graphs.compatibility;
    expect(dataset.communities).toHaveLength(4);
    expect(gCompat.modularityQ).toBeGreaterThanOrEqual(0.33);
    expect(gCompat.modularityQ).toBeLessThanOrEqual(0.35);
    expect(gCompat.modularityQ).toBeCloseTo(0.340176, 2);

    const archetypes = dataset.communities.map((c) => c.archetype);
    expect(new Set(archetypes).size).toBe(4);
    expect(new Set(archetypes)).toEqual(
      new Set([
        'Strategic Drivers',
        'Empathetic Diplomats',
        'Structured Organizers',
        'Assertive Analysts',
      ]),
    );

    const totalMembers = dataset.communities.reduce((acc, c) => acc + c.members.length, 0);
    expect(totalMembers).toBe(25);

    // Deterministic non-overlapping 2D layout inside [-1, 1]^2
    const positions = Object.values(dataset.nodePositions);
    expect(positions).toHaveLength(25);
    for (let i = 0; i < positions.length; i += 1) {
      expect(positions[i].x).toBeGreaterThanOrEqual(-1);
      expect(positions[i].x).toBeLessThanOrEqual(1);
      expect(positions[i].y).toBeGreaterThanOrEqual(-1);
      expect(positions[i].y).toBeLessThanOrEqual(1);
      for (let j = i + 1; j < positions.length; j += 1) {
        const dist = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
        expect(dist).toBeGreaterThan(0.05);
      }
    }
  });

  it('computes exact Edmonds Blossom 12-dyad matching weight 10.556 and resolves N=25 into 11 dyads + 1 triad', () => {
    const gCompat = dataset.graphs.compatibility;
    const edgeWeightMap = new Map<string, number>();
    for (const edge of gCompat.edges) {
      const key = edge.source < edge.target ? `${edge.source}::${edge.target}` : `${edge.target}::${edge.source}`;
      edgeWeightMap.set(key, edge.weight);
    }

    const rawMatching = maxWeightCardinalityMatching(
      dataset.students.map((s) => s.id),
      gCompat.edges,
    );
    expect(rawMatching).toHaveLength(12);

    const rawTotalWeight = rawMatching.reduce((sum, [u, v]) => {
      const key = u < v ? `${u}::${v}` : `${v}::${u}`;
      return sum + (edgeWeightMap.get(key) ?? 0);
    }, 0);
    expect(rawTotalWeight).toBeCloseTo(10.555933, 3);

    // Default odd-cohort allocation: 11 dyads + 1 triad covering all 25 students
    const alloc = dataset.defaultAllocation;
    expect(alloc.teams).toHaveLength(12);
    const dyads = alloc.teams.filter((t) => t.memberIds.length === 2);
    const triads = alloc.teams.filter((t) => t.memberIds.length === 3);
    expect(dyads).toHaveLength(11);
    expect(triads).toHaveLength(1);
    expect(triads[0].memberIds.slice().sort()).toEqual(['S05', 'S18', 'S22']);

    const covered = new Set(alloc.teams.flatMap((t) => t.memberIds));
    expect(covered.size).toBe(25);
  });

  it('produces factual pairwise breakdowns, top matches, team synergy evaluations, and candidate suggestions', () => {
    const pair = dataset.getPairBreakdown('S01', 'S25');
    expect(pair.compatibility).toBeGreaterThan(0.85);
    expect(pair.is4NNEdge).toBe(true);
    expect(pair.isOptimalEdmondsPair).toBe(true);
    expect(pair.axes).toHaveLength(5);
    expect(pair.axes[0].key).toBe('E');
    expect(pair.axes[0].narrative).toContain('36%');
    expect(pair.axes[0].narrative).toContain('67%');
    expect(pair.topStrengths.length).toBeGreaterThanOrEqual(2);

    // Low-compatibility pair should surface a factual watchOut when an axis fit < 0.70
    const contrastedPair = dataset.getPairBreakdown('S05', 'S24');
    expect(contrastedPair.watchOut).not.toBeNull();

    const topMatches = dataset.getTopMatches('S01', 5);
    expect(topMatches).toHaveLength(5);
    expect(topMatches[0].compatibility).toBeGreaterThanOrEqual(topMatches[1].compatibility);

    // Evaluate Solo, Duo, Trio, Quartet
    const solo = dataset.evaluateTeam(['S01']);
    expect(solo.formatLabel).toBe('Solo Draft');
    expect(solo.pairEdges).toHaveLength(0);

    const duo = dataset.evaluateTeam(['S01', 'S25']);
    expect(duo.formatLabel).toBe('Duo');
    expect(duo.pairEdges).toHaveLength(1);
    expect(duo.meanCohesion).toBeCloseTo(pair.compatibility, 6);
    expect(duo.dimensions).toHaveLength(4);
    expect(duo.collaborationPlaybook).toHaveLength(2);

    const trio = dataset.evaluateTeam(['S05', 'S18', 'S22']);
    expect(trio.formatLabel).toBe('Trio');
    expect(trio.pairEdges).toHaveLength(3);

    const quartet = dataset.evaluateTeam(['S01', 'S07', 'S14', 'S25']);
    expect(quartet.formatLabel).toBe('Quartet');
    expect(quartet.pairEdges).toHaveLength(6);
    expect(quartet.weakestLink).not.toBeNull();
    expect(quartet.strongestLink).not.toBeNull();

    // Candidate suggestions
    const suggestionsFromSolo = dataset.suggestCandidatesForTeam(['S01'], 4);
    expect(suggestionsFromSolo).toHaveLength(4);
    expect(suggestionsFromSolo.every((c) => c.candidateId !== 'S01')).toBe(true);

    const suggestionsFromDuo = dataset.suggestCandidatesForTeam(['S01', 'S25'], 6);
    expect(suggestionsFromDuo).toHaveLength(6);
    const firstComposite =
      0.75 * suggestionsFromDuo[0].resultingMeanCohesion +
      0.25 * suggestionsFromDuo[0].resultingWeakestLink;
    const secondComposite =
      0.75 * suggestionsFromDuo[1].resultingMeanCohesion +
      0.25 * suggestionsFromDuo[1].resultingWeakestLink;
    expect(firstComposite).toBeGreaterThanOrEqual(secondComposite - 1e-9);
  });

  it('allocates full cohorts across dyads, trios, and quartets with and without lockedTeamIds', () => {
    for (const format of ['dyads', 'trios', 'quartets'] as const) {
      const unlocked = dataset.computeAllocation(format, null);
      const allUnlockedMembers = unlocked.teams.flatMap((t) => t.memberIds);
      expect(allUnlockedMembers).toHaveLength(25);
      expect(new Set(allUnlockedMembers).size).toBe(25);
      expect(unlocked.teams.every((t) => t.memberIds.length >= 2 && t.memberIds.length <= 4)).toBe(true);

      const lockedIds = ['S01', 'S07', 'S15'];
      const locked = dataset.computeAllocation(format, lockedIds);
      const allLockedMembers = locked.teams.flatMap((t) => t.memberIds);
      expect(allLockedMembers).toHaveLength(25);
      expect(new Set(allLockedMembers).size).toBe(25);
      expect(locked.teams[0].isLockedCustomTeam).toBe(true);
      expect(locked.teams[0].memberIds.slice().sort()).toEqual(lockedIds.slice().sort());
      expect(locked.teams.every((t) => t.memberIds.length >= 2 && t.memberIds.length <= 4)).toBe(true);
    }
  });

  it('maintains parity on local N=23 dataset when present without exposing any student PII', () => {
    if (!fs.existsSync(localPrivateCsvPath)) {
      return;
    }
    const localCsvText = fs.readFileSync(localPrivateCsvPath, 'utf8');
    const localDs = buildCohortDatasetFromCsv(localCsvText, 'local-private');

    expect(localDs.source).toBe('local-private');
    expect(localDs.students).toHaveLength(23);
    expect(localDs.graphs.compatibility.edgeCount).toBe(67);
    expect(localDs.graphs.similarity.edgeCount).toBe(140);
    expect(localDs.graphs.contrast.edgeCount).toBe(87);
    expect(localDs.communities).toHaveLength(4);
    expect(localDs.graphs.compatibility.modularityQ).toBeGreaterThanOrEqual(0.33);
    expect(localDs.graphs.compatibility.modularityQ).toBeLessThanOrEqual(0.36);

    const rawMatching23 = maxWeightCardinalityMatching(
      localDs.students.map((s) => s.id),
      localDs.graphs.compatibility.edges,
    );
    expect(rawMatching23).toHaveLength(11);
    const weightMap23 = new Map<string, number>();
    for (const e of localDs.graphs.compatibility.edges) {
      const k = e.source < e.target ? `${e.source}::${e.target}` : `${e.target}::${e.source}`;
      weightMap23.set(k, e.weight);
    }
    const totalW23 = rawMatching23.reduce((acc, [u, v]) => {
      const k = u < v ? `${u}::${v}` : `${v}::${u}`;
      return acc + (weightMap23.get(k) ?? 0);
    }, 0);
    expect(totalW23).toBeCloseTo(9.576019, 3);
  });

  it('seamlessly falls back to K_rem in dyads if lockedTeamIds isolates a sparse 4-NN node', () => {
    // Build an even 24-student slice (excluding S05) so locking all 4 sparse neighbors of S24 leaves |V_rem| = 20 (even)
    // with S24 isolated in G_compat[V_rem], forcing matchedPairs (9) < floor(20 / 2) (10) -> K_rem fallback!
    const even24Csv = anonCsvText
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('S05,'))
      .join('\n');
    const ds24 = buildCohortDatasetFromCsv(even24Csv, 'public-anon');
    const s24Neighbors = ds24.graphs.compatibility.edges
      .filter((e) => e.source === 'S24' || e.target === 'S24')
      .map((e) => (e.source === 'S24' ? e.target : e.source));
    expect(s24Neighbors).toHaveLength(4);

    const alloc = ds24.computeAllocation('dyads', s24Neighbors);
    const allMembers = alloc.teams.flatMap((t) => t.memberIds);
    expect(allMembers).toHaveLength(24);
    expect(new Set(allMembers).size).toBe(24);
    expect(alloc.teams.every((t) => t.memberIds.length >= 2 && t.memberIds.length <= 4)).toBe(true);
    expect(alloc.methodologyNote.toLowerCase()).toContain('complete');
  });

  it('triggers factual blindSpots thresholds (low J drift, pair friction, energy skew)', () => {
    // Prospecting-heavy team: S02 (33% J), S10 (22% J), S16 (24% J) -> mean J < 0.46
    const lowJTeam = dataset.evaluateTeam(['S02', 'S10', 'S16']);
    expect(lowJTeam.meanTraits.J).toBeLessThan(0.46);
    expect(lowJTeam.blindSpots.some((b) => b.toLowerCase().includes('milestone') || b.toLowerCase().includes('judging'))).toBe(true);

    // Introverted-skewed team: S01 (36% E), S04 (36% E), S06 (31% E), S21 (18% E) -> all E < 0.42
    const introTeam = dataset.evaluateTeam(['S01', 'S04', 'S06', 'S21']);
    expect(introTeam.blindSpots.some((b) => b.includes('42% E'))).toBe(true);

    // Friction pair: S05 & S24 -> compatibility < 0.78
    const frictionTeam = dataset.evaluateTeam(['S05', 'S24']);
    expect(frictionTeam.weakestLink?.compatibility).toBeLessThan(0.78);
    expect(frictionTeam.blindSpots.some((b) => b.toLowerCase().includes('friction'))).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads from /__cohort.csv when available and falls back cleanly to /cohort_fallback.csv', async () => {
    // Case 1: /__cohort.csv returns valid CSV + X-Cohort-Source header
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/__cohort.csv') {
          return new Response(anonCsvText, {
            status: 200,
            headers: { 'X-Cohort-Source': 'public-anon' },
          });
        }
        return new Response('Not found', { status: 404 });
      }),
    );
    const primaryLoaded = await loadCohortDataset();
    expect(primaryLoaded.source).toBe('public-anon');
    expect(primaryLoaded.students).toHaveLength(25);

    // Case 2: /__cohort.csv returns SPA index.html fallback -> falls back to /cohort_fallback.csv
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/__cohort.csv') {
          return new Response('<!doctype html><html><body>SPA</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        if (url === '/cohort_fallback.csv') {
          return new Response(anonCsvText, { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      }),
    );
    const fallbackLoaded = await loadCohortDataset();
    expect(fallbackLoaded.source).toBe('public-anon');
    expect(fallbackLoaded.students).toHaveLength(25);
  });
});
