import { motion } from 'framer-motion';
import {
  ArrowRight,
  Lock,
  Unlock,
  Users,
} from 'lucide-react';
import { useMemo, type JSX } from 'react';
import { MBTI_GROUPS } from '../engine/mbtiMetadata';
import type {
  AllocatedTeam,
  AllocationFormat,
  CohortAllocationResult,
  CohortDataset,
} from '../engine/types';
import { LottieAvatar } from './ui/LottieAvatar';

export interface GlobalMatchmakerPanelProps {
  cohort: CohortDataset;
  activeStudentId: string;
  teamDraftIds: string[];
  isTeamLocked: boolean;
  allocationFormat: AllocationFormat;
  allocation: CohortAllocationResult;
  hoveredTeamId: string | null;
  selectedNodeId: string | null;
  isExpandedStage: boolean;
  onChangeAllocationFormat: (format: AllocationFormat) => void;
  onToggleTeamLock: (locked: boolean) => void;
  onHoverTeam: (teamId: string | null) => void;
  onSelectStudentNode: (studentId: string) => void;
  onLoadTeamIntoStudio: (memberIds: string[]) => void;
}

const FORMAT_OPTIONS: Array<{
  id: AllocationFormat;
  label: string;
}> = [
  { id: 'dyads', label: 'Dyads (2)' },
  { id: 'trios', label: 'Trios (3)' },
  { id: 'quartets', label: 'Quartets (4)' },
];

export function GlobalMatchmakerPanel({
  cohort,
  activeStudentId,
  teamDraftIds,
  isTeamLocked,
  allocationFormat,
  allocation,
  hoveredTeamId,
  selectedNodeId,
  isExpandedStage,
  onChangeAllocationFormat,
  onToggleTeamLock,
  onHoverTeam,
  onSelectStudentNode,
  onLoadTeamIntoStudio,
}: GlobalMatchmakerPanelProps): JSX.Element {
  const canLockStudioTeam = teamDraftIds.length >= 2;

  const studioDraftEvaluation = useMemo(() => {
    if (!canLockStudioTeam) return null;
    return cohort.evaluateTeam(teamDraftIds);
  }, [cohort, canLockStudioTeam, teamDraftIds]);

  const orderedTeams = useMemo<AllocatedTeam[]>(() => {
    const locked: AllocatedTeam[] = [];
    const rest: AllocatedTeam[] = [];
    for (const team of allocation.teams) {
      if (team.isLockedCustomTeam) {
        locked.push(team);
      } else {
        rest.push(team);
      }
    }
    return [...locked, ...rest];
  }, [allocation.teams]);

  const communityColorByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const comm of cohort.communities) {
      map.set(comm.code, comm.color);
    }
    return map;
  }, [cohort.communities]);

  return (
    <section
      className="flex flex-col gap-4"
      aria-label="Global Cohort Matchmaker"
    >
      {/* Control & Summary Header Card */}
      <div className="editorial-card rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-editorial text-2xl tracking-tight text-slate-900 italic">
            Matchmaker
          </h2>
          <span className="rounded-full border border-slate-900/[0.08] bg-slate-50 px-2.5 py-0.5 font-mono-tabular text-[11px] font-medium text-slate-600">
            N = {cohort.students.length}
          </span>
        </div>

        {/* Format Segmented Control */}
        <div
          className="mt-3.5 grid grid-cols-3 gap-1 rounded-2xl border border-slate-900/[0.07] bg-slate-100/80 p-1"
          role="tablist"
          aria-label="Team allocation format"
        >
          {FORMAT_OPTIONS.map((opt) => {
            const active = allocationFormat === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeAllocationFormat(opt.id)}
                className={`relative rounded-xl px-2.5 py-1.5 text-center text-xs font-semibold transition-colors ${
                  active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {active ? (
                  <motion.div
                    layoutId="matchmaker-format-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl border border-slate-900/[0.08] bg-white shadow-xs"
                  />
                ) : null}
                <span className="relative z-10">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* "Lock My Studio Team" Toggle Card */}
        {canLockStudioTeam && studioDraftEvaluation ? (
          <div
            className={`mt-3 rounded-2xl px-3.5 py-2.5 transition-all ${
              isTeamLocked
                ? 'gemini-halo bg-indigo-50/45'
                : 'border border-slate-900/[0.08] bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex -space-x-2">
                  {teamDraftIds.map((id) => {
                    const member = cohort.studentMap[id];
                    if (!member) return null;
                    return (
                      <div
                        key={id}
                        className="rounded-2xl ring-2 ring-white"
                        title={`${member.displayName} (${member.fullType})`}
                      >
                        <LottieAvatar mbti={member.mbti} size={30} playMode="hover" />
                      </div>
                    );
                  })}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-900">Lock My Team</span>
                    <span className="rounded-md bg-white px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold text-indigo-700 ring-1 ring-slate-900/[0.08]">
                      {Math.round(studioDraftEvaluation.meanCohesion * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isTeamLocked}
                onClick={() => onToggleTeamLock(!isTeamLocked)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                  isTeamLocked
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-slate-300 bg-slate-200/80 hover:bg-slate-300/80'
                }`}
              >
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-xs transition-transform ${
                    isTeamLocked ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                >
                  {isTeamLocked ? (
                    <Lock className="h-2.5 w-2.5 text-indigo-600" />
                  ) : (
                    <Unlock className="h-2.5 w-2.5 text-slate-500" />
                  )}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Cohort Allocation Summary Strip */}
        <div className="mt-3.5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-slate-900/[0.06] bg-[#FCFCFD] px-3 py-2">
            <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Teams
            </div>
            <div className="mt-0.5 font-mono-tabular text-base font-bold text-slate-900">
              {allocation.teams.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-900/[0.06] bg-[#FCFCFD] px-3 py-2">
            <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Mean Fit
            </div>
            <div className="mt-0.5 font-mono-tabular text-base font-bold text-emerald-700">
              {(allocation.meanCohortCompatibility * 100).toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-900/[0.06] bg-[#FCFCFD] px-3 py-2">
            <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Min Floor
            </div>
            <div className="mt-0.5 font-mono-tabular text-base font-bold text-slate-800">
              {(allocation.minTeamCompatibility * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Allocated Team Cards Grid */}
      <div
        className={`grid gap-3 ${
          isExpandedStage
            ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-1'
        }`}
      >
        {orderedTeams.map((team) => {
          const isHovered = hoveredTeamId === team.id;
          const containsActiveUser = team.memberIds.includes(activeStudentId);
          const containsSelectedNode =
            selectedNodeId !== null && team.memberIds.includes(selectedNodeId);
          const isIntraCluster = team.clusterAlignment.startsWith('Intra-');
          const intraCode = isIntraCluster ? team.clusterAlignment.replace('Intra-', '').trim() : '';
          const intraColor = communityColorByCode.get(intraCode);

          return (
            <article
              key={team.id}
              onMouseEnter={() => onHoverTeam(team.id)}
              onMouseLeave={() => onHoverTeam(null)}
              className={`editorial-card editorial-card-hover rounded-2xl p-4 ${
                team.isLockedCustomTeam ? 'gemini-halo bg-white' : 'bg-white'
              } ${
                isHovered || containsSelectedNode
                  ? 'ring-2 ring-slate-900/80'
                  : containsActiveUser && !team.isLockedCustomTeam
                    ? 'ring-1 ring-emerald-500/45'
                    : ''
              }`}
            >
              {/* Card Top Meta Row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {team.name}
                    </h3>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {team.format}
                    </span>

                    {team.isLockedCustomTeam ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <Lock className="h-2.5 w-2.5" />
                        Locked Studio Team
                      </span>
                    ) : containsActiveUser ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                        Your Team
                      </span>
                    ) : null}
                  </div>

                  {/* Cluster Alignment Tag */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={
                        isIntraCluster && intraColor
                          ? {
                              backgroundColor: `${intraColor}14`,
                              color: intraColor,
                            }
                          : {
                              backgroundColor: '#F1F5F9',
                              color: '#475569',
                            }
                      }
                    >
                      {isIntraCluster && intraColor ? (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: intraColor }}
                        />
                      ) : null}
                      {team.clusterAlignment}
                    </span>
                  </div>
                </div>

                {/* Mean & Weakest Floor Compatibility */}
                <div className="shrink-0 text-right">
                  <div className="font-mono-tabular text-base font-bold text-slate-900">
                    {(team.meanCompatibility * 100).toFixed(1)}%
                  </div>
                  {team.memberIds.length >= 3 ? (
                    <div className="font-mono-tabular text-[10.5px] text-slate-500">
                      Floor {(team.weakestCompatibility * 100).toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400">Pairwise Fit</div>
                  )}
                </div>
              </div>

              {/* Team Members List */}
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {team.memberIds.map((memberId) => {
                  const member = cohort.studentMap[memberId];
                  if (!member) return null;
                  const groupMeta = MBTI_GROUPS[member.group];
                  const commIdx = cohort.nodeToCommunity[member.id];
                  const comm = cohort.communities.find((c) => c.index === commIdx);
                  const isActiveUser = member.id === activeStudentId;

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => onSelectStudentNode(member.id)}
                      className={`flex items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${
                        member.id === selectedNodeId
                          ? 'border-slate-900 bg-slate-900/[0.03]'
                          : 'border-slate-900/[0.05] bg-[#FCFCFD] hover:border-slate-900/[0.15] hover:bg-slate-50'
                      }`}
                    >
                      <LottieAvatar
                        mbti={member.mbti}
                        size={42}
                        playMode="hover"
                        isHoveredExternal={isHovered}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-xs font-semibold text-slate-900">
                            {member.displayName}
                          </span>
                          {isActiveUser ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className="rounded px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold"
                            style={{
                              backgroundColor: groupMeta.softBg,
                              color: groupMeta.color,
                            }}
                          >
                            {member.fullType}
                          </span>
                          {comm ? (
                            <span className="font-mono-tabular text-[10px] text-slate-400">
                              {comm.code}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Card Action Footer */}
              <div className="mt-3 flex items-center justify-between border-t border-slate-900/[0.06] pt-2.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Users className="h-3 w-3" />
                  {isHovered ? 'Highlighted on network stage' : 'Hover to locate on graph'}
                </span>

                <button
                  type="button"
                  onClick={() => onLoadTeamIntoStudio(team.memberIds)}
                  className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 hover:text-indigo-700"
                >
                  <span>Edit in Team Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
