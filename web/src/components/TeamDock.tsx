import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Plus, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useMemo, type JSX } from 'react';
import type {
  ActiveWorkspaceTab,
  CohortDataset,
  TeamSizeFormat,
} from '../engine/types';
import { LottieAvatar } from './ui/LottieAvatar';

export interface TeamDockProps {
  cohort: CohortDataset;
  activeTab: ActiveWorkspaceTab;
  teamDraftIds: string[];
  targetTeamSize: TeamSizeFormat;
  onRemoveMember: (studentId: string) => void;
  onClearTeam: () => void;
  onOpenStudio: () => void;
}

export function TeamDock({
  cohort,
  activeTab,
  teamDraftIds,
  targetTeamSize,
  onRemoveMember,
  onClearTeam,
  onOpenStudio,
}: TeamDockProps): JSX.Element | null {
  const isVisible = activeTab !== 'team-studio' && teamDraftIds.length >= 2;

  const evaluation = useMemo(() => {
    if (!isVisible) return null;
    return cohort.evaluateTeam(teamDraftIds);
  }, [cohort, isVisible, teamDraftIds]);

  const slotCount = Math.max(targetTeamSize, teamDraftIds.length);
  const emptySlotCount = Math.max(0, slotCount - teamDraftIds.length);

  return (
    <AnimatePresence>
      {isVisible && evaluation ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-3 sm:px-6">
          <motion.aside
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            aria-label="Live Team Synergy Dock"
            className="gemini-halo pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-slate-900/[0.10] bg-white/95 px-3.5 py-2.5 shadow-[0_16px_42px_-10px_rgba(15,23,42,0.18),0_2px_8px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:flex-nowrap sm:gap-4 sm:px-4"
          >
            {/* Member Avatars + Dashed Empty Slots */}
            <div className="flex items-center gap-1.5">
              {teamDraftIds.map((id) => {
                const member = cohort.studentMap[id];
                if (!member) return null;
                return (
                  <div
                    key={id}
                    title={`${member.displayName} (${member.fullType})`}
                    className="group relative inline-flex items-center"
                  >
                    <LottieAvatar
                      mbti={member.mbti}
                      size={36}
                      playMode="static"
                      className="rounded-xl transition-transform group-hover:scale-[1.03]"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveMember(id)}
                      aria-label={`Remove ${member.displayName} from team`}
                      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-slate-900/15 bg-white text-slate-500 opacity-0 shadow-xs transition-all group-hover:opacity-100 hover:bg-slate-900 hover:text-white focus:opacity-100"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}

              {Array.from({ length: emptySlotCount }).map((_, idx) => (
                <button
                  key={`empty-slot-${idx}`}
                  type="button"
                  onClick={onOpenStudio}
                  title="Complete open team slot in Team Studio"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-slate-900/20 bg-slate-50/70 text-slate-400 transition-colors hover:border-slate-900/40 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>

            <div className="hidden h-7 w-px bg-slate-900/[0.08] sm:block" />

            {/* Live Mean Cohesion + Weakest Link Mini-Pill (if >= 3 members) */}
            <div className="flex items-center gap-2.5">
              <div className="flex flex-col">
                <span className="text-[10px] leading-tight font-semibold tracking-wider text-slate-400 uppercase">
                  {evaluation.formatLabel} Cohesion
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`font-mono-tabular text-[15px] leading-tight font-bold ${
                      evaluation.meanCohesion >= 0.86
                        ? 'text-emerald-700'
                        : evaluation.meanCohesion >= 0.8
                          ? 'text-slate-900'
                          : 'text-amber-700'
                    }`}
                  >
                    {(evaluation.meanCohesion * 100).toFixed(1)}%
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    {teamDraftIds.length}/{slotCount} slots
                  </span>
                </div>
              </div>

              {teamDraftIds.length >= 3 && evaluation.weakestLink ? (
                <div
                  title={`Weakest pairwise link: ${
                    cohort.studentMap[evaluation.weakestLink.memberA]?.displayName ??
                    evaluation.weakestLink.memberA
                  } ↔ ${
                    cohort.studentMap[evaluation.weakestLink.memberB]?.displayName ??
                    evaluation.weakestLink.memberB
                  }`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    evaluation.weakestLink.compatibility < 0.8
                      ? 'border-amber-500/30 bg-amber-50 text-amber-800'
                      : 'border-emerald-500/25 bg-emerald-50/80 text-emerald-800'
                  }`}
                >
                  {evaluation.weakestLink.compatibility < 0.8 ? (
                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                  ) : (
                    <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" />
                  )}
                  <span>Floor</span>
                  <span className="font-mono-tabular">
                    {(evaluation.weakestLink.compatibility * 100).toFixed(1)}%
                  </span>
                </div>
              ) : null}
            </div>

            <div className="hidden h-7 w-px bg-slate-900/[0.08] sm:block" />

            {/* Actions: Clear + Primary Open in Team Studio */}
            <div className="ml-auto flex items-center gap-2 sm:ml-0">
              <button
                type="button"
                onClick={onClearTeam}
                title="Reset team draft"
                className="inline-flex items-center gap-1 rounded-full border border-slate-900/[0.08] bg-slate-50 px-2.5 py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:border-slate-900/20 hover:bg-slate-100 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden md:inline">Clear</span>
              </button>

              <button
                type="button"
                onClick={onOpenStudio}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-xs transition-all hover:bg-slate-800 active:scale-[0.99]"
              >
                <span>Open in Team Studio</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
