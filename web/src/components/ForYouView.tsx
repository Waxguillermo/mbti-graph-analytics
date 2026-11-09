import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Check,
  Crown,
  Plus,
  Radar,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState, type JSX } from 'react';
import { MBTI_TYPES } from '../engine/mbtiMetadata';
import type {
  CohortDataset,
  LouvainCommunity,
  PairwiseBreakdown,
  TraitKey,
} from '../engine/types';
import { LottieAvatar } from './ui/LottieAvatar';
import { TraitRadarSvg } from './ui/TraitRadarSvg';

export interface ForYouViewProps {
  cohort: CohortDataset;
  activeStudentId: string;
  teamDraftIds: string[];
  onStartDuo: (partnerId: string) => void;
  onToggleTeamMember: (studentId: string) => void;
}

type SortMode = 'fit' | 'similar' | 'contrast';

const SPECTRUM_ROWS: ReadonlyArray<{
  key: TraitKey;
  left: string;
  right: string;
  title: string;
}> = [
  { key: 'E', left: 'I', right: 'E', title: 'Energy' },
  { key: 'N', left: 'S', right: 'N', title: 'Mind' },
  { key: 'T', left: 'F', right: 'T', title: 'Nature' },
  { key: 'J', left: 'P', right: 'J', title: 'Tactics' },
  { key: 'A', left: 'T', right: 'A', title: 'Identity' },
];

function getCommunity(
  cohort: CohortDataset,
  studentId: string,
): LouvainCommunity | undefined {
  const idx = cohort.nodeToCommunity[studentId];
  return idx !== undefined ? cohort.communities[idx] : undefined;
}

export function ForYouView({
  cohort,
  activeStudentId,
  teamDraftIds,
  onStartDuo,
  onToggleTeamMember,
}: ForYouViewProps): JSX.Element {
  const student = cohort.studentMap[activeStudentId] ?? cohort.students[0];
  const typeMeta = MBTI_TYPES[student.mbti];
  const community = getCommunity(cohort, student.id);
  const centrality = cohort.graphs.compatibility.centralities[student.id];

  const [inspectedPartnerId, setInspectedPartnerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('fit');
  const deferredQuery = useDeferredValue(searchQuery);

  const topMatches = useMemo(
    () => cohort.getTopMatches(student.id, 6),
    [cohort, student.id],
  );

  const allBreakdowns = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list: PairwiseBreakdown[] = [];
    for (const peer of cohort.students) {
      if (peer.id === student.id) continue;
      if (q) {
        const peerMeta = MBTI_TYPES[peer.mbti];
        const peerComm = getCommunity(cohort, peer.id);
        const hay = `${peer.displayName} ${peer.id} ${peer.fullType} ${peerMeta.title} ${peerComm?.archetype ?? ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      list.push(cohort.getPairBreakdown(student.id, peer.id));
    }

    list.sort((a, b) => {
      if (sortMode === 'similar') return b.similarity - a.similarity;
      if (sortMode === 'contrast') return b.contrast - a.contrast;
      return b.compatibility - a.compatibility;
    });
    return list;
  }, [cohort, student.id, deferredQuery, sortMode]);

  const inspectedBreakdown = useMemo(() => {
    if (!inspectedPartnerId || !cohort.studentMap[inspectedPartnerId]) return null;
    return cohort.getPairBreakdown(student.id, inspectedPartnerId);
  }, [cohort, student.id, inspectedPartnerId]);

  const inspectedPartner = inspectedPartnerId
    ? cohort.studentMap[inspectedPartnerId]
    : undefined;

  return (
    <div className="flex flex-col gap-7">
      {/* 1. Compact Personal Identity Hero */}
      <section className="editorial-card relative overflow-hidden rounded-3xl p-5 sm:p-7">
        {/* Subtle vector scene backdrop */}
        <img
          src={typeMeta.sceneHeaderUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 hidden h-full w-[42%] object-cover opacity-[0.11] select-none lg:block"
          style={{
            maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 15%, rgba(0,0,0,0) 95%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 15%, rgba(0,0,0,0) 95%)',
          }}
        />

        <div className="relative grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,430px)]">
          {/* Left: Avatar + Name + Crisp Pills */}
          <div className="flex items-center gap-4 sm:gap-5">
            <LottieAvatar
              mbti={student.mbti}
              size={96}
              playMode="always"
              className="rounded-3xl"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {student.displayName}
                </h1>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  style={{
                    backgroundColor: typeMeta.softBg,
                    color: typeMeta.color,
                    borderColor: `${typeMeta.color}35`,
                  }}
                  className="font-mono-tabular rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                >
                  {student.fullType}
                </span>
                <span className="font-display text-base font-medium text-slate-600">
                  {typeMeta.title}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  style={{
                    backgroundColor: typeMeta.softBg,
                    color: typeMeta.color,
                  }}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                >
                  {typeMeta.groupName}
                </span>

                {community ? (
                  <span
                    style={{
                      backgroundColor: community.fillRgba,
                      color: community.color,
                      borderColor: community.borderRgba,
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: community.color }}
                    />
                    {community.code} · {community.archetype}
                  </span>
                ) : null}

                {centrality?.isBridgeHub ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                    <Crown className="h-3 w-3 text-amber-600" />
                    Bridge Hub
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: Ultra-Clean 5D Spectrum Bars */}
          <div className="rounded-2xl border border-slate-900/[0.06] bg-[#FCFCFD]/90 p-4 backdrop-blur-xs">
            <div className="mb-2.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span className="font-semibold text-slate-700">5D Profile & Ideal Match</span>
              <span className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: typeMeta.color }}
                  />
                  You
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rotate-45 border border-slate-700 bg-white" />
                  Ideal Target
                </span>
              </span>
            </div>

            <div className="space-y-2">
              {SPECTRUM_ROWS.map((row) => {
                const val = student.traits[row.key];
                const ideal = student.idealPartner[row.key];
                const pct = Math.round(val * 100);
                return (
                  <div key={row.key} className="grid grid-cols-[58px_16px_1fr_16px_36px] items-center gap-2 text-xs">
                    <span className="truncate font-medium text-slate-600">{row.title}</span>
                    <span className="font-mono-tabular text-right text-[10.5px] font-semibold text-slate-400">
                      {row.left}
                    </span>
                    <div className="relative h-2 rounded-full bg-slate-200/80">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full opacity-35"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: typeMeta.color,
                        }}
                      />
                      {/* Ideal target diamond */}
                      <span
                        title={`Ideal partner ${row.key}: ${Math.round(ideal * 100)}%`}
                        style={{ left: `${Math.round(ideal * 100)}%` }}
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-slate-700 bg-white shadow-2xs"
                      />
                      {/* Student score dot */}
                      <span
                        style={{
                          left: `${pct}%`,
                          backgroundColor: typeMeta.color,
                        }}
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow-xs"
                      />
                    </div>
                    <span className="font-mono-tabular text-[10.5px] font-semibold text-slate-400">
                      {row.right}
                    </span>
                    <span className="font-mono-tabular text-right text-[11px] font-semibold text-slate-800">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Top 6 Recommended Teammates */}
      <section>
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Top 6 Teammates
            </h2>
            <span className="text-xs font-medium text-slate-400">Best 5D synergy</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {topMatches.map((match, idx) => {
            const partner = cohort.studentMap[match.studentB];
            if (!partner) return null;
            const pMeta = MBTI_TYPES[partner.mbti];
            const pComm = getCommunity(cohort, partner.id);
            const scorePct = (match.compatibility * 100).toFixed(1);
            const inTeam = teamDraftIds.includes(partner.id);
            const teamFull = teamDraftIds.length >= 4 && !inTeam;
            const isTop = idx === 0 || match.compatibility >= 0.88;

            return (
              <article
                key={partner.id}
                className={`editorial-card editorial-card-hover flex flex-col justify-between rounded-3xl p-4 sm:p-5 ${
                  isTop ? 'gemini-halo' : ''
                }`}
              >
                <div>
                  {/* Card Top: Avatar + Name + Big Score */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative">
                        <LottieAvatar
                          mbti={partner.mbti}
                          size={56}
                          playMode="hover"
                          className="rounded-2xl"
                        />
                        <span className="font-mono-tabular absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white shadow-xs">
                          {idx + 1}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-slate-900">
                          {partner.displayName}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            style={{
                              backgroundColor: pMeta.softBg,
                              color: pMeta.color,
                            }}
                            className="font-mono-tabular rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                          >
                            {partner.fullType}
                          </span>
                          <span className="truncate text-xs text-slate-500">
                            {pMeta.title}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="font-mono-tabular text-xl font-bold tracking-tight text-emerald-700">
                        {scorePct}%
                      </div>
                      <div className="text-[10px] font-medium text-slate-400">fit</div>
                    </div>
                  </div>

                  {/* Middle: Ultra-concise tags */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    {match.isOptimalEdmondsPair ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-700 ring-1 ring-indigo-500/20">
                        <Award className="h-3 w-3" />
                        Optimal Pair
                      </span>
                    ) : null}

                    {pComm ? (
                      <span
                        style={{
                          backgroundColor: pComm.fillRgba,
                          color: pComm.color,
                        }}
                        className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      >
                        {pComm.code} · {pComm.archetype.split(' ')[0]}
                      </span>
                    ) : null}

                    {match.topStrengths[0] ? (
                      <span className="rounded-full border border-slate-900/[0.07] bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                        {match.topStrengths[0]}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 flex items-center gap-2 border-t border-slate-900/[0.05] pt-3.5">
                  <button
                    type="button"
                    onClick={() => onStartDuo(partner.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                  >
                    <span>Form Duo</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={teamFull}
                    onClick={() => onToggleTeamMember(partner.id)}
                    className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-all ${
                      inTeam
                        ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800'
                        : teamFull
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
                          : 'border-slate-900/[0.09] bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title={inTeam ? 'Remove from team draft' : 'Add to Duo/Trio/Quartet draft'}
                  >
                    {inTeam ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    <span>{inTeam ? 'Added' : 'Team'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectedPartnerId(partner.id)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-900/[0.09] bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    title="Inspect 5D Radar"
                    aria-label={`Inspect radar with ${partner.displayName}`}
                  >
                    <Radar className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. Compact All-Classmates Strip */}
      <section className="editorial-card rounded-3xl p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900">All Classmates</h2>
            <span className="font-mono-tabular text-xs text-slate-400">
              {allBreakdowns.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter classmate..."
                className="w-44 rounded-xl border border-slate-900/[0.08] bg-[#FCFCFD] py-1.5 pr-7 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900/25 focus:bg-white focus:outline-none sm:w-52"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            <div className="inline-flex rounded-xl border border-slate-900/[0.07] bg-slate-100/80 p-0.5 text-[11px] font-semibold">
              {(
                [
                  { id: 'fit', label: 'Best Fit' },
                  { id: 'similar', label: 'Similar' },
                  { id: 'contrast', label: 'Contrast' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortMode(opt.id)}
                  className={`rounded-lg px-2.5 py-1 transition-colors ${
                    sortMode === opt.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {allBreakdowns.map((item) => {
            const peer = cohort.studentMap[item.studentB];
            if (!peer) return null;
            const pMeta = MBTI_TYPES[peer.mbti];
            const inTeam = teamDraftIds.includes(peer.id);
            const teamFull = teamDraftIds.length >= 4 && !inTeam;
            const metricVal =
              sortMode === 'similar'
                ? item.similarity
                : sortMode === 'contrast'
                  ? item.contrast
                  : item.compatibility;

            return (
              <div
                key={peer.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-slate-900/[0.06] bg-[#FCFCFD] p-2.5 transition-colors hover:border-slate-900/[0.14] hover:bg-white"
              >
                <button
                  type="button"
                  onClick={() => setInspectedPartnerId(peer.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <LottieAvatar mbti={peer.mbti} size={36} playMode="static" className="rounded-xl" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-900">
                      {peer.displayName}
                    </div>
                    <span
                      style={{ color: pMeta.color }}
                      className="font-mono-tabular text-[10.5px] font-semibold"
                    >
                      {peer.fullType}
                    </span>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setInspectedPartnerId(peer.id)}
                    className="font-mono-tabular rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-800 ring-1 ring-slate-900/[0.06] hover:ring-slate-900/20"
                  >
                    {Math.round(metricVal * 100)}%
                  </button>
                  <button
                    type="button"
                    disabled={teamFull}
                    onClick={() => onToggleTeamMember(peer.id)}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                      inTeam
                        ? 'border-emerald-600/30 bg-emerald-50 text-emerald-700'
                        : teamFull
                          ? 'cursor-not-allowed border-slate-200 text-slate-300'
                          : 'border-slate-900/[0.08] bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                    title={inTeam ? 'Added to team' : 'Add to team'}
                  >
                    {inTeam ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Sleek 1-on-1 Radar Modal (On-Demand Progressive Disclosure) */}
      <AnimatePresence>
        {inspectedBreakdown && inspectedPartner ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInspectedPartnerId(null)}
              className="fixed inset-0 bg-slate-950/30 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="editorial-card relative z-10 w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-900/[0.06] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <LottieAvatar mbti={student.mbti} size={44} playMode="always" className="ring-2 ring-white" />
                    <LottieAvatar mbti={inspectedPartner.mbti} size={44} playMode="always" className="ring-2 ring-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {student.displayName} × {inspectedPartner.displayName}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs">
                      <span className="font-mono-tabular font-bold text-emerald-700">
                        {(inspectedBreakdown.compatibility * 100).toFixed(1)}% Fit
                      </span>
                      {inspectedBreakdown.isOptimalEdmondsPair ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          <Sparkles className="h-2.5 w-2.5" />
                          Optimal Pair
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectedPartnerId(null)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-[215px_1fr]">
                <div className="flex justify-center">
                  <TraitRadarSvg
                    size={210}
                    compact
                    series={[
                      {
                        id: student.id,
                        label: student.displayName,
                        traits: student.traits,
                        color: typeMeta.color,
                        fillOpacity: 0.14,
                      },
                      {
                        id: inspectedPartner.id,
                        label: inspectedPartner.displayName,
                        traits: inspectedPartner.traits,
                        color: MBTI_TYPES[inspectedPartner.mbti].color,
                        fillOpacity: 0.16,
                      },
                      {
                        id: 'ideal',
                        label: 'Ideal Target',
                        traits: student.idealPartner,
                        color: '#64748B',
                        dashed: true,
                      },
                    ]}
                  />
                </div>

                <div className="space-y-2.5">
                  {inspectedBreakdown.axes.map((ax) => {
                    const fitPct = Math.round(ax.fit * 100);
                    return (
                      <div key={ax.key}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">{ax.label}</span>
                          <span className="font-mono-tabular text-[11px] font-semibold text-slate-900">
                            {fitPct}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              ax.fit >= 0.80
                                ? 'bg-emerald-500'
                                : ax.fit >= 0.70
                                  ? 'bg-indigo-500'
                                  : 'bg-amber-500'
                            }`}
                            style={{ width: `${fitPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {inspectedBreakdown.watchOut ? (
                    <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>{inspectedBreakdown.watchOut}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-900/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    const pid = inspectedPartner.id;
                    setInspectedPartnerId(null);
                    onToggleTeamMember(pid);
                  }}
                  className="rounded-xl border border-slate-900/[0.1] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {teamDraftIds.includes(inspectedPartner.id) ? 'Remove from Team' : '+ Add to Team'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pid = inspectedPartner.id;
                    setInspectedPartnerId(null);
                    onStartDuo(pid);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <span>Form Duo in Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
