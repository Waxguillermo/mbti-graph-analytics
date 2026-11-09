import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Search, X } from 'lucide-react';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import { MBTI_GROUPS, MBTI_TYPES, TRAIT_METADATA } from '../engine/mbtiMetadata';
import type {
  CohortDataset,
  LouvainCommunity,
  MbtiGroupKey,
  StudentProfile,
} from '../engine/types';
import { LottieAvatar } from './ui/LottieAvatar';

export interface StudentSwitcherModalProps {
  cohort: CohortDataset;
  isOpen: boolean;
  activeStudentId: string;
  isInitialWelcome: boolean;
  onSelectStudent: (studentId: string) => void;
  onClose: () => void;
}

type GroupFilter = 'all' | MbtiGroupKey;

const GROUP_FILTER_ORDER: GroupFilter[] = [
  'all',
  'analysts',
  'diplomats',
  'sentinels',
  'explorers',
];

function resolveCommunity(
  cohort: CohortDataset,
  studentId: string,
): LouvainCommunity | undefined {
  const idx = cohort.nodeToCommunity[studentId];
  if (idx === undefined) return undefined;
  return cohort.communities[idx] ?? cohort.communities.find((c) => c.index === idx);
}

interface StudentPickerCardProps {
  student: StudentProfile;
  community: LouvainCommunity | undefined;
  isActive: boolean;
  onSelect: (studentId: string) => void;
}

function StudentPickerCard({
  student,
  community,
  isActive,
  onSelect,
}: StudentPickerCardProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const typeMeta = MBTI_TYPES[student.mbti];

  return (
    <button
      type="button"
      onClick={() => onSelect(student.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`editorial-card editorial-card-hover group relative flex w-full flex-col justify-between gap-3 rounded-2xl p-3.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 ${
        isActive
          ? 'gemini-halo bg-white ring-1 ring-slate-900/10'
          : 'bg-white/95 hover:bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <LottieAvatar
          mbti={student.mbti}
          size={48}
          playMode="hover"
          isHoveredExternal={hovered}
          className="rounded-xl"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-slate-900">
              {student.displayName}
            </span>
            {isActive ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                <Check className="h-2.5 w-2.5" />
                <span>Active</span>
              </span>
            ) : (
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-slate-600 group-hover:opacity-100" />
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              style={{
                backgroundColor: typeMeta.softBg,
                color: typeMeta.color,
                borderColor: `${typeMeta.color}33`,
              }}
              className="font-mono-tabular inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold"
            >
              {student.fullType}
            </span>
            <span className="truncate text-[11.5px] font-medium text-slate-600">
              {typeMeta.title}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Louvain Cluster Tag + Subtle Mini 5-Trait Spark Bars */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-900/[0.05] pt-2.5">
        {community ? (
          <span
            style={{
              backgroundColor: community.fillRgba,
              borderColor: community.borderRgba,
              color: community.color,
            }}
            className="inline-flex max-w-[165px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          >
            <span
              style={{ backgroundColor: community.color }}
              className="h-1.5 w-1.5 shrink-0 rounded-full"
            />
            <span className="truncate">
              {community.code} · {community.archetype}
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">Cohort Member</span>
        )}

        {/* Mini 5-Trait Spark Bars (E, N, T, J, A) */}
        <div
          className="flex items-end gap-1"
          title={TRAIT_METADATA.map(
            (t) => `${t.key}: ${Math.round(student.traits[t.key] * 100)}%`,
          ).join(' · ')}
        >
          {TRAIT_METADATA.map((trait) => {
            const pct = Math.round(student.traits[trait.key] * 100);
            const barHeight = Math.max(3, Math.round((pct / 100) * 14));
            return (
              <div key={trait.key} className="flex flex-col items-center gap-0.5">
                <div className="flex h-3.5 w-1.5 items-end overflow-hidden rounded-full bg-slate-100">
                  <div
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: typeMeta.color,
                    }}
                    className="w-full rounded-full opacity-80 transition-opacity group-hover:opacity-100"
                  />
                </div>
                <span className="font-mono-tabular text-[8.5px] leading-none font-medium text-slate-400">
                  {trait.key}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </button>
  );
}

export function StudentSwitcherModal({
  cohort,
  isOpen,
  activeStudentId,
  isInitialWelcome,
  onSelectStudent,
  onClose,
}: StudentSwitcherModalProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const deferredQuery = useDeferredValue(searchQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeStudent = cohort.studentMap[activeStudentId] ?? cohort.students[0];

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 40);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const groupCounts = useMemo(() => {
    const counts: Record<GroupFilter, number> = {
      all: cohort.students.length,
      analysts: 0,
      diplomats: 0,
      sentinels: 0,
      explorers: 0,
    };
    for (const s of cohort.students) {
      counts[s.group] += 1;
    }
    return counts;
  }, [cohort.students]);

  const filteredStudents = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return cohort.students.filter((student) => {
      if (groupFilter !== 'all' && student.group !== groupFilter) {
        return false;
      }
      if (!q) return true;
      const typeMeta = MBTI_TYPES[student.mbti];
      const community = resolveCommunity(cohort, student.id);
      const haystack = [
        student.id,
        student.displayName,
        student.mbti,
        student.fullType,
        typeMeta.title,
        typeMeta.groupName,
        community?.code ?? '',
        community?.archetype ?? '',
        community?.fullLabel ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [cohort, deferredQuery, groupFilter]);

  const handleChooseStudent = (studentId: string) => {
    onSelectStudent(studentId);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            isInitialWelcome
              ? 'Step into your cohort profile'
              : 'Switch active student profile'
          }
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/30 backdrop-blur-sm"
          />

          {/* Modal Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="editorial-card relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-[#FCFCFD] shadow-[0_24px_64px_-16px_rgba(15,23,42,0.22)]"
          >
            {/* Header: Welcome Mode vs Spotlight Command Mode */}
            {isInitialWelcome ? (
              <div className="relative overflow-hidden border-b border-slate-900/[0.07] bg-white px-6 py-5 sm:px-7">
                <div className="relative flex items-center justify-between gap-4">
                  <h2 className="font-editorial text-[32px] leading-none tracking-tight text-slate-950 italic">
                    Who are you?
                  </h2>

                  {activeStudent ? (
                    <button
                      type="button"
                      onClick={() => handleChooseStudent(activeStudent.id)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition-all hover:bg-slate-800"
                    >
                      <span>{activeStudent.displayName}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between border-b border-slate-900/[0.06] bg-white px-5 py-3.5 sm:px-6">
                <span className="font-editorial text-2xl text-slate-900 italic">
                  Switch Profile
                </span>
                <div className="flex items-center gap-2">
                  <kbd className="font-mono-tabular hidden rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline-block">
                    ESC
                  </kbd>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close student switcher"
                    className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Search Input + 4 MBTI Family Filter Pills */}
            <div className="border-b border-slate-900/[0.06] bg-white/90 px-5 py-3.5 sm:px-6">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredStudents.length > 0) {
                      e.preventDefault();
                      handleChooseStudent(filteredStudents[0].id);
                    }
                  }}
                  placeholder="Search student, MBTI (ENTJ), or cluster..."
                  className="w-full rounded-xl border border-slate-900/[0.09] bg-[#FCFCFD] py-2.5 pr-9 pl-10 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900/25 focus:bg-white focus:outline-none"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search query"
                    className="absolute right-2.5 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {/* Family Filter Pills */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {GROUP_FILTER_ORDER.map((key) => {
                  const selected = groupFilter === key;
                  if (key === 'all') {
                    return (
                      <button
                        key="all"
                        type="button"
                        onClick={() => setGroupFilter('all')}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-all ${
                          selected
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-900/[0.08] bg-white text-slate-600 hover:border-slate-900/20 hover:text-slate-900'
                        }`}
                      >
                        <span>All Families</span>
                        <span
                          className={`font-mono-tabular text-[10.5px] ${
                            selected ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          {groupCounts.all}
                        </span>
                      </button>
                    );
                  }

                  const groupMeta = MBTI_GROUPS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setGroupFilter((prev) => (prev === key ? 'all' : key))
                      }
                      style={
                        selected
                          ? {
                              backgroundColor: groupMeta.softBg,
                              borderColor: groupMeta.color,
                              color: groupMeta.color,
                            }
                          : undefined
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-all ${
                        selected
                          ? 'shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                          : 'border-slate-900/[0.08] bg-white text-slate-600 hover:border-slate-900/20 hover:text-slate-900'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: groupMeta.color }}
                        className="h-2 w-2 rounded-full"
                      />
                      <span>{groupMeta.name}</span>
                      <span className="font-mono-tabular text-[10.5px] opacity-75">
                        {groupCounts[key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scannable Student Cards Grid */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {filteredStudents.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredStudents.map((student) => (
                    <StudentPickerCard
                      key={student.id}
                      student={student}
                      community={resolveCommunity(cohort, student.id)}
                      isActive={student.id === activeStudentId}
                      onSelect={handleChooseStudent}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-900/12 bg-white/70 py-12 text-center">
                  <p className="text-[14px] font-semibold text-slate-800">
                    No cohort profiles match “{searchQuery}”
                  </p>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    Try searching by MBTI code (e.g. INTJ, ENFP) or reset the family filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setGroupFilter('all');
                    }}
                    className="mt-3 rounded-full border border-slate-900/12 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>

            {/* Subtle Footer Hint */}
            <div className="flex items-center justify-between border-t border-slate-900/[0.06] bg-white px-5 py-2.5 text-[11px] text-slate-500 sm:px-6">
              <span>
                Source:{' '}
                <strong className="font-medium text-slate-700">
                  {cohort.source === 'local-private'
                    ? 'Local Cohort Psychometric CSV'
                    : 'Anonymized Albert School Cohort Dataset'}
                </strong>
              </span>
              <span className="hidden sm:inline">
                Press <kbd className="font-mono-tabular font-semibold text-slate-700">Enter</kbd> to
                select top result ·{' '}
                <kbd className="font-mono-tabular font-semibold text-slate-700">⌘K</kbd> anytime to
                switch
              </span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
