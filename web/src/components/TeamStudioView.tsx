import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Unlock,
  Wand2,
  X,
} from 'lucide-react';
import { useDeferredValue, useId, useMemo, useState, type JSX } from 'react';
import { MBTI_TYPES } from '../engine/mbtiMetadata';
import type {
  CohortDataset,
  LouvainCommunity,
  StudentProfile,
  TeamEvaluation,
  TeamSizeFormat,
} from '../engine/types';
import { LottieAvatar } from './ui/LottieAvatar';
import { TraitRadarSvg } from './ui/TraitRadarSvg';

export interface TeamStudioViewProps {
  cohort: CohortDataset;
  activeStudentId: string;
  teamDraftIds: string[];
  targetTeamSize: TeamSizeFormat;
  isTeamLocked: boolean;
  onChangeTargetSize: (size: TeamSizeFormat) => void;
  onSetTeamMembers: (memberIds: string[]) => void;
  onToggleLockAndJumpToCohort: (lockState: boolean) => void;
}

const FORMATS: ReadonlyArray<{ size: TeamSizeFormat; label: string }> = [
  { size: 2, label: 'Duo (2)' },
  { size: 3, label: 'Trio (3)' },
  { size: 4, label: 'Quartet (4)' },
];

const SERIES_PALETTE = ['#4F46E5', '#0D9488', '#EA580C', '#88619A'];

function getCommunity(
  cohort: CohortDataset,
  studentId: string,
): LouvainCommunity | undefined {
  const idx = cohort.nodeToCommunity[studentId];
  return idx !== undefined ? cohort.communities[idx] : undefined;
}

function PairwiseGeometrySvg({
  cohort,
  evaluation,
}: {
  cohort: CohortDataset;
  evaluation: TeamEvaluation;
}): JSX.Element {
  const clipPrefix = useId().replace(/:/g, '');
  const members = evaluation.memberIds
    .map((id) => cohort.studentMap[id])
    .filter((s): s is StudentProfile => Boolean(s));

  const W = 360;
  const H = 240;
  const cx = W / 2;
  const cy = H / 2;

  const coords = useMemo(() => {
    const n = members.length;
    if (n === 1) return [{ x: cx, y: cy }];
    if (n === 2) {
      return [
        { x: cx - 96, y: cy },
        { x: cx + 96, y: cy },
      ];
    }
    if (n === 3) {
      return [
        { x: cx, y: 46 },
        { x: cx - 104, y: 190 },
        { x: cx + 104, y: 190 },
      ];
    }
    return [
      { x: cx - 92, y: 52 },
      { x: cx + 92, y: 52 },
      { x: cx + 92, y: 188 },
      { x: cx - 92, y: 188 },
    ];
  }, [members.length, cx, cy]);

  const idxById = useMemo(() => {
    const m = new Map<string, number>();
    members.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [members]);

  if (members.length < 2) {
    const solo = members[0];
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center">
        {solo ? <LottieAvatar mbti={solo.mbti} size={64} playMode="always" /> : null}
        <span className="text-xs font-medium text-slate-400">
          Add a teammate below to see synergy links
        </span>
      </div>
    );
  }

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible select-none">
      <defs>
        {members.map((m, i) => (
          <clipPath key={m.id} id={`${clipPrefix}-node-${i}`}>
            <circle cx={coords[i].x} cy={coords[i].y} r={22} />
          </clipPath>
        ))}
      </defs>

      {/* Pairwise Edges */}
      {evaluation.pairEdges.map((edge) => {
        const i = idxById.get(edge.memberA);
        const j = idxById.get(edge.memberB);
        if (i === undefined || j === undefined) return null;
        const p1 = coords[i];
        const p2 = coords[j];

        const isDiagonal =
          members.length === 4 && Math.abs(i - j) === 2;
        const t = isDiagonal ? (i === 0 ? 0.36 : 0.64) : 0.5;
        const lx = p1.x + (p2.x - p1.x) * t;
        const ly = p1.y + (p2.y - p1.y) * t;

        const isLow = edge.isWeakest && edge.compatibility < 0.80;
        const stroke = isLow
          ? '#F59E0B'
          : edge.isStrongest
            ? '#10B981'
            : '#94A3B8';

        return (
          <g key={`${edge.memberA}-${edge.memberB}`}>
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={stroke}
              strokeWidth={edge.isStrongest ? 3 : 2}
              strokeOpacity={edge.isStrongest || isLow ? 0.85 : 0.45}
              strokeDasharray={isLow ? '5 4' : undefined}
            />
            <g transform={`translate(${lx}, ${ly})`}>
              <rect
                x={-22}
                y={-10}
                width={44}
                height={20}
                rx={10}
                fill="#FFFFFF"
                stroke={stroke}
                strokeWidth={1.25}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="font-mono-tabular font-bold"
                style={{
                  fontSize: 10.5,
                  fill: isLow ? '#B45309' : edge.isStrongest ? '#047857' : '#334155',
                }}
              >
                {Math.round(edge.compatibility * 100)}%
              </text>
            </g>
          </g>
        );
      })}

      {/* Member Vertices */}
      {members.map((m, i) => {
        const pt = coords[i];
        const meta = MBTI_TYPES[m.mbti];
        return (
          <g key={m.id}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={24}
              fill={meta.softBg}
              stroke={meta.color}
              strokeWidth={2}
            />
            <image
              href={meta.avatarSvgUrl}
              x={pt.x - 20}
              y={pt.y - 20}
              width={40}
              height={40}
              clipPath={`url(#${clipPrefix}-node-${i})`}
              preserveAspectRatio="xMidYMid meet"
            />
            <text
              x={pt.x}
              y={pt.y + 35}
              textAnchor="middle"
              className="fill-slate-800 font-semibold"
              style={{ fontSize: 11 }}
            >
              {m.displayName}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TeamStudioView({
  cohort,
  activeStudentId,
  teamDraftIds,
  targetTeamSize,
  isTeamLocked,
  onChangeTargetSize,
  onSetTeamMembers,
  onToggleLockAndJumpToCohort,
}: TeamStudioViewProps): JSX.Element {
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const deferredSearch = useDeferredValue(pickerSearch);

  const effectiveMembers = useMemo(() => {
    if (
      hoveredCandidateId &&
      teamDraftIds.length < targetTeamSize &&
      !teamDraftIds.includes(hoveredCandidateId)
    ) {
      return [...teamDraftIds, hoveredCandidateId];
    }
    return teamDraftIds;
  }, [teamDraftIds, hoveredCandidateId, targetTeamSize]);

  const evaluation = useMemo(
    () => cohort.evaluateTeam(effectiveMembers),
    [cohort, effectiveMembers],
  );

  const contributionByStudent = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of evaluation.collaborationPlaybook) {
      map.set(item.studentId, item.naturalContribution);
    }
    return map;
  }, [evaluation.collaborationPlaybook]);

  const suggestions = useMemo(
    () =>
      teamDraftIds.length < targetTeamSize
        ? cohort.suggestCandidatesForTeam(teamDraftIds, 6)
        : [],
    [cohort, teamDraftIds, targetTeamSize],
  );

  const filteredDirectory = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return [];
    return cohort.students.filter((s) => {
      if (teamDraftIds.includes(s.id)) return false;
      const meta = MBTI_TYPES[s.mbti];
      return `${s.displayName} ${s.id} ${s.fullType} ${meta.title}`
        .toLowerCase()
        .includes(q);
    });
  }, [cohort.students, deferredSearch, teamDraftIds]);

  const handleAddMember = (candidateId: string) => {
    setHoveredCandidateId(null);
    if (teamDraftIds.includes(candidateId)) return;
    if (teamDraftIds.length >= targetTeamSize) {
      const next = [...teamDraftIds.slice(0, targetTeamSize - 1), candidateId];
      onSetTeamMembers(next);
      return;
    }
    onSetTeamMembers([...teamDraftIds, candidateId]);
  };

  const handleRemoveMember = (studentId: string) => {
    const next = teamDraftIds.filter((id) => id !== studentId);
    onSetTeamMembers(next);
  };

  const handleAutoComplete = () => {
    let cur = teamDraftIds.length > 0 ? [...teamDraftIds] : [activeStudentId];
    while (cur.length < targetTeamSize) {
      const nextBest = cohort.suggestCandidatesForTeam(cur, 1)[0];
      if (!nextBest) break;
      cur = [...cur, nextBest.candidateId];
    }
    onSetTeamMembers(cur);
  };

  const handleLoadOptimalDuo = () => {
    const optTeam = cohort.defaultAllocation.teams.find((t) =>
      t.memberIds.includes(activeStudentId),
    );
    if (optTeam) {
      const sz = Math.min(4, Math.max(2, optTeam.memberIds.length)) as TeamSizeFormat;
      onChangeTargetSize(sz);
      onSetTeamMembers(optTeam.memberIds);
    }
  };

  const radarSeries = useMemo(() => {
    const list = effectiveMembers
      .map((id, idx) => {
        const s = cohort.studentMap[id];
        if (!s) return null;
        return {
          id: s.id,
          label: s.displayName,
          traits: s.traits,
          color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          fillOpacity: 0.12,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (list.length >= 2) {
      list.push({
        id: 'anchor-ref',
        label: '65% J/A Anchor',
        traits: {
          E: 0.5,
          N: evaluation.meanTraits.N,
          T: evaluation.meanTraits.T,
          J: 0.65,
          A: 0.65,
        },
        color: '#94A3B8',
        fillOpacity: 0,
      });
    }
    return list.map((s) =>
      s.id === 'anchor-ref' ? { ...s, dashed: true } : s,
    );
  }, [cohort.studentMap, effectiveMembers, evaluation.meanTraits.N, evaluation.meanTraits.T]);

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Minimalist Studio Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 sm:text-[26px]">
            Team Studio
          </h1>

          <div
            className="inline-flex rounded-2xl border border-slate-900/[0.07] bg-slate-100/85 p-1"
            role="tablist"
          >
            {FORMATS.map((f) => {
              const active = targetTeamSize === f.size;
              return (
                <button
                  key={f.size}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onChangeTargetSize(f.size)}
                  className={`relative rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {active ? (
                    <motion.div
                      layoutId="studioFormatPill"
                      transition={{ type: 'spring', stiffness: 430, damping: 34 }}
                      className="absolute inset-0 rounded-xl border border-slate-900/[0.08] bg-white shadow-2xs"
                    />
                  ) : null}
                  <span className="relative z-10">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {teamDraftIds.length < targetTeamSize ? (
            <button
              type="button"
              onClick={handleAutoComplete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/25 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100/70"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Auto-Fill Best</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleLoadOptimalDuo}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-900/[0.09] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Optimal Match</span>
          </button>

          <button
            type="button"
            onClick={() => onSetTeamMembers([activeStudentId])}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-900/[0.09] bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            title="Reset to active student"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          {teamDraftIds.length >= 2 ? (
            <button
              type="button"
              onClick={() => onToggleLockAndJumpToCohort(!isTeamLocked)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-all ${
                isTeamLocked
                  ? 'border border-emerald-600/30 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {isTeamLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span>{isTeamLocked ? 'Unlock Team' : 'Lock & Simulate Cohort'}</span>
              {!isTeamLocked ? <ArrowRight className="h-3.5 w-3.5" /> : null}
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Clean Visual Team Slots */}
      <div
        className={`grid gap-3 ${
          targetTeamSize === 2
            ? 'grid-cols-1 sm:grid-cols-2'
            : targetTeamSize === 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {Array.from({ length: targetTeamSize }).map((_, slotIdx) => {
          const memberId = teamDraftIds[slotIdx];
          const isPreviewSlot =
            !memberId &&
            slotIdx === teamDraftIds.length &&
            hoveredCandidateId !== null;
          const displayId = memberId ?? (isPreviewSlot ? hoveredCandidateId : null);
          const member = displayId ? cohort.studentMap[displayId] : undefined;

          if (!member) {
            return (
              <div
                key={`empty-${slotIdx}`}
                className="flex min-h-[96px] items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300 bg-white/50 p-4 text-xs font-medium text-slate-400"
              >
                <Plus className="h-4 w-4" />
                <span>Slot {slotIdx + 1} · Pick below</span>
              </div>
            );
          }

          const meta = MBTI_TYPES[member.mbti];
          const comm = getCommunity(cohort, member.id);
          const roleTag = contributionByStudent.get(member.id);

          return (
            <div
              key={`${member.id}-${slotIdx}`}
              className={`editorial-card relative flex items-center gap-3.5 rounded-3xl p-4 transition-all ${
                isPreviewSlot
                  ? 'border-dashed border-indigo-400 bg-indigo-50/30 opacity-85'
                  : 'bg-white'
              }`}
            >
              <LottieAvatar
                mbti={member.mbti}
                size={60}
                playMode="always"
                className="rounded-2xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {member.displayName}
                  </span>
                  {isPreviewSlot ? (
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9.5px] font-bold text-indigo-700 uppercase">
                      Preview
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    style={{ backgroundColor: meta.softBg, color: meta.color }}
                    className="font-mono-tabular rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold"
                  >
                    {member.fullType}
                  </span>
                  {comm ? (
                    <span
                      style={{ backgroundColor: comm.fillRgba, color: comm.color }}
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                    >
                      {comm.code}
                    </span>
                  ) : null}
                </div>

                {roleTag ? (
                  <div className="mt-1 truncate text-[11px] font-medium text-slate-500">
                    {roleTag}
                  </div>
                ) : null}
              </div>

              {!isPreviewSlot && teamDraftIds.length > 1 ? (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.id)}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Remove ${member.displayName}`}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 3. Two-Column Visual Synergy Stage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Pairwise Geometry & KPIs */}
        <div
          className={`editorial-card flex flex-col justify-between rounded-3xl p-5 ${
            evaluation.meanCohesion >= 0.88 && effectiveMembers.length >= 2
              ? 'gemini-halo'
              : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/[0.06] pb-3.5">
            <div className="flex items-center gap-5">
              <div>
                <div className="text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">
                  Team Fit
                </div>
                <div className="font-mono-tabular text-3xl font-bold tracking-tight text-emerald-700">
                  {effectiveMembers.length >= 2
                    ? `${(evaluation.meanCohesion * 100).toFixed(1)}%`
                    : '—'}
                </div>
              </div>

              {effectiveMembers.length >= 3 && evaluation.weakestLink ? (
                <div className="border-l border-slate-900/[0.08] pl-5">
                  <div className="text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">
                    Min Link Floor
                  </div>
                  <div
                    className={`font-mono-tabular text-2xl font-bold ${
                      evaluation.weakestLink.compatibility < 0.80
                        ? 'text-amber-600'
                        : 'text-slate-800'
                    }`}
                  >
                    {(evaluation.weakestLink.compatibility * 100).toFixed(1)}%
                  </div>
                </div>
              ) : null}
            </div>

            {effectiveMembers.length >= 2 ? (
              <span className="rounded-full border border-slate-900/[0.08] bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {evaluation.communityAlignment}
              </span>
            ) : null}
          </div>

          <div className="my-auto pt-2">
            <PairwiseGeometrySvg cohort={cohort} evaluation={evaluation} />
          </div>
        </div>

        {/* Right: 5D Radar, Dimension Bars & Concise Signal Pills */}
        <div className="editorial-card flex flex-col justify-between rounded-3xl p-5">
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[215px_1fr]">
            <div className="flex justify-center">
              <TraitRadarSvg series={radarSeries} size={212} compact />
            </div>

            <div className="space-y-3">
              {evaluation.dimensions.map((dim) => {
                const pct = Math.round(dim.score * 100);
                return (
                  <div key={dim.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{dim.label}</span>
                      <span className="font-mono-tabular text-[11px] font-semibold text-slate-900">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          dim.score >= 0.80
                            ? 'bg-emerald-500'
                            : dim.score >= 0.68
                              ? 'bg-indigo-500'
                              : 'bg-amber-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Crisp Signal Chips (Zero Paragraphs!) */}
          {effectiveMembers.length >= 2 ? (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-900/[0.06] pt-3.5">
              {evaluation.strengths.slice(0, 2).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-600/20"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  {s}
                </span>
              ))}

              {evaluation.blindSpots.slice(0, 1).map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-500/25"
                >
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                  {b}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* 4. Smart Next-Member Recommender + Quick Search */}
      <section className="editorial-card rounded-3xl p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900">
              {teamDraftIds.length < targetTeamSize
                ? `Best Teammates to Add`
                : `Swap a Teammate`}
            </h2>
            {teamDraftIds.length < targetTeamSize ? (
              <span className="text-xs text-slate-400">Hover to preview live</span>
            ) : null}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Search any classmate..."
              className="w-full rounded-xl border border-slate-900/[0.08] bg-[#FCFCFD] py-1.5 pr-7 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900/25 focus:bg-white focus:outline-none sm:w-56"
            />
            {pickerSearch ? (
              <button
                type="button"
                onClick={() => setPickerSearch('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Search Results Override or Top-6 Smart Suggestions */}
        {deferredSearch.trim() ? (
          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDirectory.map((cand) => {
              const meta = MBTI_TYPES[cand.mbti];
              return (
                <button
                  key={cand.id}
                  type="button"
                  onMouseEnter={() => setHoveredCandidateId(cand.id)}
                  onMouseLeave={() => setHoveredCandidateId(null)}
                  onClick={() => handleAddMember(cand.id)}
                  className="flex items-center justify-between gap-2.5 rounded-2xl border border-slate-900/[0.07] bg-[#FCFCFD] p-3 text-left transition-all hover:border-slate-900/20 hover:bg-white"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <LottieAvatar mbti={cand.mbti} size={40} playMode="hover" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-900">
                        {cand.displayName}
                      </div>
                      <span
                        style={{ color: meta.color }}
                        className="font-mono-tabular text-[10.5px] font-semibold"
                      >
                        {cand.fullType} · {meta.title}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <Plus className="h-3 w-3" />
                    {teamDraftIds.length < targetTeamSize ? 'Add' : 'Swap'}
                  </span>
                </button>
              );
            })}
          </div>
        ) : suggestions.length > 0 ? (
          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((sug) => {
              const cand = cohort.studentMap[sug.candidateId];
              if (!cand) return null;
              const meta = MBTI_TYPES[cand.mbti];
              const deltaPct = sug.deltaMeanCohesion * 100;

              return (
                <button
                  key={cand.id}
                  type="button"
                  onMouseEnter={() => setHoveredCandidateId(cand.id)}
                  onMouseLeave={() => setHoveredCandidateId(null)}
                  onClick={() => handleAddMember(cand.id)}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-900/[0.07] bg-[#FCFCFD] p-3 text-left transition-all hover:border-indigo-400 hover:bg-white hover:shadow-xs"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <LottieAvatar mbti={cand.mbti} size={44} playMode="hover" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-slate-900">
                          {cand.displayName}
                        </span>
                        <span
                          style={{ backgroundColor: meta.softBg, color: meta.color }}
                          className="font-mono-tabular rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        >
                          {cand.fullType}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">
                        {sug.rationale}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono-tabular text-sm font-bold text-emerald-700">
                      {(sug.resultingMeanCohesion * 100).toFixed(1)}%
                    </span>
                    <span
                      className={`font-mono-tabular rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        deltaPct >= 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {deltaPct >= 0 ? '+' : ''}
                      {deltaPct.toFixed(1)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
            <span>
              {targetTeamSize === 4
                ? 'Quartet complete — remove a slot above or search to swap.'
                : `Switch format to ${targetTeamSize === 2 ? 'Trio (3)' : 'Quartet (4)'} above to add another teammate.`}
            </span>
            {targetTeamSize < 4 ? (
              <button
                type="button"
                onClick={() => onChangeTargetSize((targetTeamSize + 1) as TeamSizeFormat)}
                className="font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Expand to {targetTeamSize === 2 ? 'Trio (3)' : 'Quartet (4)'} →
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
