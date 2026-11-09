import { motion } from 'framer-motion';
import { Command, Lock, Network, Sparkles, Users } from 'lucide-react';
import { useEffect, type JSX } from 'react';
import { MBTI_TYPES } from '../engine/mbtiMetadata';
import type { ActiveWorkspaceTab, CohortDataset } from '../engine/types';
import { LottieAvatar } from './ui/LottieAvatar';

export interface HeaderBarProps {
  cohort: CohortDataset;
  activeStudentId: string;
  activeTab: ActiveWorkspaceTab;
  onTabChange: (tab: ActiveWorkspaceTab) => void;
  onOpenStudentSwitcher: () => void;
  teamDraftIds: string[];
  isTeamLocked: boolean;
}

const NAV_ITEMS: Array<{
  id: ActiveWorkspaceTab;
  label: string;
  shortLabel: string;
}> = [
  { id: 'for-you', label: 'For You', shortLabel: 'For You' },
  { id: 'team-studio', label: 'Team Studio', shortLabel: 'Studio' },
  { id: 'cohort-network', label: 'Cohort Network', shortLabel: 'Cohort' },
];

function NavTabIcon({ tab, isActive }: { tab: ActiveWorkspaceTab; isActive: boolean }): JSX.Element {
  const cls = `h-3.5 w-3.5 transition-colors ${isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600'}`;
  if (tab === 'for-you') return <Sparkles className={cls} />;
  if (tab === 'team-studio') return <Users className={cls} />;
  return <Network className={cls} />;
}

export function HeaderBar({
  cohort,
  activeStudentId,
  activeTab,
  onTabChange,
  onOpenStudentSwitcher,
  teamDraftIds,
  isTeamLocked,
}: HeaderBarProps): JSX.Element {
  const activeStudent = cohort.studentMap[activeStudentId] ?? cohort.students[0];
  const typeMeta = activeStudent ? MBTI_TYPES[activeStudent.mbti] : null;
  const hasTeamDraft = teamDraftIds.length >= 2;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenStudentSwitcher();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenStudentSwitcher]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-900/[0.06] bg-[#FCFCFD]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Left: Editorial Brand Mark */}
        <button
          type="button"
          onClick={() => onTabChange('for-you')}
          className="group flex shrink-0 items-center gap-2.5 rounded-xl py-0.5 text-left transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
        >
          <div className="gemini-halo relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-900/[0.08] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="text-slate-900"
            >
              <circle cx="6" cy="10" r="2.75" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="14.2" cy="5.8" r="2.35" stroke="#88619A" strokeWidth="1.6" />
              <circle cx="14.2" cy="14.2" r="2.35" stroke="#33A474" strokeWidth="1.6" />
              <line
                x1="8.4"
                y1="8.7"
                x2="12.1"
                y2="6.9"
                stroke="currentColor"
                strokeOpacity="0.45"
                strokeWidth="1.35"
              />
              <line
                x1="8.4"
                y1="11.3"
                x2="12.1"
                y2="13.1"
                stroke="currentColor"
                strokeOpacity="0.45"
                strokeWidth="1.35"
              />
              <line
                x1="14.2"
                y1="8.2"
                x2="14.2"
                y2="11.8"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeDasharray="1.5 1.5"
                strokeWidth="1.2"
              />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[20px] leading-none font-semibold tracking-tight text-slate-900">
              Synergy
            </span>
          </div>
        </button>

        {/* Center: Sliding Framer Motion Segmented Navigation */}
        <nav
          aria-label="Workspace Views"
          className="flex items-center rounded-full border border-slate-900/[0.06] bg-slate-900/[0.035] p-1"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const isStudio = item.id === 'team-studio';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`group relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors sm:px-3.5 ${
                  isActive ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isActive ? (
                  <motion.span
                    layoutId="activeNavTab"
                    transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                    className="absolute inset-0 rounded-full border border-slate-900/[0.07] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_2px_8px_-2px_rgba(15,23,42,0.05)]"
                  />
                ) : null}

                <span className="relative z-10 flex items-center gap-1.5">
                  <NavTabIcon tab={item.id} isActive={isActive} />
                  <span className="hidden md:inline">{item.label}</span>
                  <span className="md:hidden">{item.shortLabel}</span>

                  {isStudio && hasTeamDraft ? (
                    <span
                      className={`font-mono-tabular inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] leading-none font-semibold transition-colors ${
                        isTeamLocked
                          ? 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-600/25'
                          : isActive
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-900/[0.08] text-slate-700'
                      }`}
                    >
                      {isTeamLocked ? <Lock className="h-2.5 w-2.5" /> : null}
                      <span>{teamDraftIds.length}</span>
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right: Active Student Identity Pill */}
        {activeStudent && typeMeta ? (
          <button
            type="button"
            onClick={onOpenStudentSwitcher}
            title="Switch active student perspective (⌘K)"
            className="editorial-card editorial-card-hover group flex shrink-0 items-center gap-2 rounded-full py-1 pr-2.5 pl-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
          >
            <LottieAvatar
              mbti={activeStudent.mbti}
              size={30}
              playMode="static"
              className="rounded-full"
            />

            <span className="hidden max-w-[132px] truncate text-[12.5px] font-semibold text-slate-900 sm:inline">
              {activeStudent.displayName}
            </span>

            <span
              style={{
                backgroundColor: typeMeta.softBg,
                color: typeMeta.color,
                borderColor: `${typeMeta.color}33`,
              }}
              className="font-mono-tabular rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-tight"
            >
              {activeStudent.fullType}
            </span>

            <kbd className="font-mono-tabular hidden items-center gap-0.5 rounded-md border border-slate-200/90 bg-slate-100/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition-colors group-hover:border-slate-300 group-hover:text-slate-700 lg:inline-flex">
              <Command className="h-2.5 w-2.5" />
              <span>K</span>
            </kbd>
          </button>
        ) : null}
      </div>
    </header>
  );
}
