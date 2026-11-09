import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { CohortNetworkView } from './components/CohortNetworkView';
import { ForYouView } from './components/ForYouView';
import { HeaderBar } from './components/HeaderBar';
import { StudentSwitcherModal } from './components/StudentSwitcherModal';
import { TeamDock } from './components/TeamDock';
import { TeamStudioView } from './components/TeamStudioView';
import {
  loadCohortDataset,
  type ActiveWorkspaceTab,
  type AllocationFormat,
  type CohortDataset,
  type TeamSizeFormat,
} from './engine';

const STORAGE_KEY_STUDENT = 'synergy.activeStudentId.v1';

export function App(): JSX.Element {
  const [cohort, setCohort] = useState<CohortDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeStudentId, setActiveStudentId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('for-you');

  const [isSwitcherOpen, setIsSwitcherOpen] = useState<boolean>(false);
  const [isInitialWelcome, setIsInitialWelcome] = useState<boolean>(false);

  const [teamDraftIds, setTeamDraftIds] = useState<string[]>([]);
  const [targetTeamSize, setTargetTeamSize] = useState<TeamSizeFormat>(2);
  const [isTeamLocked, setIsTeamLocked] = useState<boolean>(false);
  const [allocationFormat, setAllocationFormat] = useState<AllocationFormat>('dyads');

  useEffect(() => {
    let cancelled = false;
    loadCohortDataset()
      .then((dataset) => {
        if (cancelled) return;
        setCohort(dataset);

        let savedId: string | null = null;
        try {
          savedId = window.localStorage.getItem(STORAGE_KEY_STUDENT);
        } catch {
          savedId = null;
        }

        const hasValidSaved = Boolean(savedId && dataset.studentMap[savedId]);
        const initialId = hasValidSaved && savedId ? savedId : (dataset.students[0]?.id ?? '');
        setActiveStudentId(initialId);
        setTeamDraftIds(initialId ? [initialId] : []);

        if (!hasValidSaved && dataset.students.length > 0) {
          setIsInitialWelcome(true);
          setIsSwitcherOpen(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectActiveStudent = useCallback(
    (studentId: string) => {
      setActiveStudentId(studentId);
      setIsSwitcherOpen(false);
      setIsInitialWelcome(false);
      try {
        window.localStorage.setItem(STORAGE_KEY_STUDENT, studentId);
      } catch {
        // Ignore storage quota / privacy mode errors
      }
      setTeamDraftIds((prev) => {
        if (prev.length <= 1) return [studentId];
        return prev;
      });
    },
    [],
  );

  const handleOpenStudentSwitcher = useCallback(() => {
    setIsInitialWelcome(false);
    setIsSwitcherOpen(true);
  }, []);

  const handleCloseSwitcher = useCallback(() => {
    setIsSwitcherOpen(false);
    setIsInitialWelcome(false);
  }, []);

  const handleTabChange = useCallback((tab: ActiveWorkspaceTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleStartDuo = useCallback(
    (partnerId: string) => {
      const nextTeam = activeStudentId && activeStudentId !== partnerId
        ? [activeStudentId, partnerId]
        : [partnerId];
      setTargetTeamSize(2);
      setTeamDraftIds(nextTeam);
      setIsTeamLocked(false);
      setActiveTab('team-studio');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [activeStudentId],
  );

  const handleToggleTeamMember = useCallback(
    (studentId: string) => {
      setTeamDraftIds((prev) => {
        const seeded = prev.length === 0 && activeStudentId ? [activeStudentId] : prev;
        if (seeded.includes(studentId)) {
          const filtered = seeded.filter((id) => id !== studentId);
          const next = filtered.length === 0 && activeStudentId ? [activeStudentId] : filtered;
          if (next.length < 2) setIsTeamLocked(false);
          if (next.length >= 2) {
            setTargetTeamSize(Math.min(4, Math.max(2, next.length)) as TeamSizeFormat);
          }
          return next;
        }
        if (seeded.length >= 4) return seeded;
        const next = [...seeded, studentId];
        setTargetTeamSize(Math.min(4, Math.max(2, next.length)) as TeamSizeFormat);
        setIsTeamLocked(false);
        return next;
      });
    },
    [activeStudentId],
  );

  const handleRemoveDockMember = useCallback(
    (studentId: string) => {
      setTeamDraftIds((prev) => {
        const next = prev.filter((id) => id !== studentId);
        if (next.length < 2) setIsTeamLocked(false);
        return next.length === 0 && activeStudentId ? [activeStudentId] : next;
      });
    },
    [activeStudentId],
  );

  const handleClearTeam = useCallback(() => {
    setTeamDraftIds(activeStudentId ? [activeStudentId] : []);
    setTargetTeamSize(2);
    setIsTeamLocked(false);
  }, [activeStudentId]);

  const handleSetStudioTeamMembers = useCallback((memberIds: string[]) => {
    const unique = Array.from(new Set(memberIds)).slice(0, 4);
    setTeamDraftIds(unique);
    if (unique.length < 2) {
      setIsTeamLocked(false);
    }
  }, []);

  const handleChangeTargetSize = useCallback((size: TeamSizeFormat) => {
    setTargetTeamSize(size);
    setTeamDraftIds((prev) => (prev.length > size ? prev.slice(0, size) : prev));
  }, []);

  const handleToggleLockAndJumpToCohort = useCallback((lockState: boolean) => {
    setIsTeamLocked(lockState);
    if (lockState) {
      setActiveTab('cohort-network');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleLoadTeamIntoStudio = useCallback((memberIds: string[]) => {
    const clean = Array.from(new Set(memberIds)).slice(0, 4);
    const size = Math.min(4, Math.max(2, clean.length)) as TeamSizeFormat;
    setTargetTeamSize(size);
    setTeamDraftIds(clean);
    setActiveTab('team-studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FCFCFD] px-6">
        <div className="editorial-card max-w-md rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Unable to load cohort profiles</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!cohort || !activeStudentId || !cohort.studentMap[activeStudentId]) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FCFCFD] px-6">
        <div className="flex items-center gap-3 rounded-full border border-slate-900/[0.07] bg-white px-5 py-2.5 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
          <span className="text-sm font-medium text-slate-700">
            Computing 5D compatibility graph & Louvain communities…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFCFD] text-slate-900 flex flex-col">
      <HeaderBar
        cohort={cohort}
        activeStudentId={activeStudentId}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenStudentSwitcher={handleOpenStudentSwitcher}
        teamDraftIds={teamDraftIds}
        isTeamLocked={isTeamLocked}
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {activeTab === 'for-you' ? (
            <motion.div
              key="for-you"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <ForYouView
                cohort={cohort}
                activeStudentId={activeStudentId}
                teamDraftIds={teamDraftIds}
                onStartDuo={handleStartDuo}
                onToggleTeamMember={handleToggleTeamMember}
              />
            </motion.div>
          ) : activeTab === 'team-studio' ? (
            <motion.div
              key="team-studio"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <TeamStudioView
                cohort={cohort}
                activeStudentId={activeStudentId}
                teamDraftIds={teamDraftIds}
                targetTeamSize={targetTeamSize}
                isTeamLocked={isTeamLocked}
                onChangeTargetSize={handleChangeTargetSize}
                onSetTeamMembers={handleSetStudioTeamMembers}
                onToggleLockAndJumpToCohort={handleToggleLockAndJumpToCohort}
              />
            </motion.div>
          ) : (
            <motion.div
              key="cohort-network"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <CohortNetworkView
                cohort={cohort}
                activeStudentId={activeStudentId}
                teamDraftIds={teamDraftIds}
                isTeamLocked={isTeamLocked}
                allocationFormat={allocationFormat}
                onChangeAllocationFormat={setAllocationFormat}
                onToggleTeamLock={setIsTeamLocked}
                onInspectOrSelectStudent={handleSelectActiveStudent}
                onLoadTeamIntoStudio={handleLoadTeamIntoStudio}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <TeamDock
        cohort={cohort}
        activeTab={activeTab}
        teamDraftIds={teamDraftIds}
        targetTeamSize={targetTeamSize}
        onRemoveMember={handleRemoveDockMember}
        onClearTeam={handleClearTeam}
        onOpenStudio={() => handleTabChange('team-studio')}
      />

      <StudentSwitcherModal
        cohort={cohort}
        isOpen={isSwitcherOpen}
        activeStudentId={activeStudentId}
        isInitialWelcome={isInitialWelcome}
        onSelectStudent={handleSelectActiveStudent}
        onClose={handleCloseSwitcher}
      />
    </div>
  );
}
