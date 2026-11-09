import { motion } from 'framer-motion';
import {
  Crown,
  GitFork,
  Layers,
  Orbit,
} from 'lucide-react';
import { useMemo, useState, type JSX } from 'react';
import type {
  AllocationFormat,
  CohortDataset,
  GraphModelId,
} from '../engine/types';
import { GlobalMatchmakerPanel } from './GlobalMatchmakerPanel';
import {
  NetworkGraphCanvas,
  type NetworkHighlightMode,
} from './NetworkGraphCanvas';

export interface CohortNetworkViewProps {
  cohort: CohortDataset;
  activeStudentId: string;
  teamDraftIds: string[];
  isTeamLocked: boolean;
  allocationFormat: AllocationFormat;
  onChangeAllocationFormat: (format: AllocationFormat) => void;
  onToggleTeamLock: (locked: boolean) => void;
  onInspectOrSelectStudent: (studentId: string) => void;
  onLoadTeamIntoStudio: (memberIds: string[]) => void;
}

const GRAPH_MODEL_TABS: Array<{
  id: GraphModelId;
  label: string;
}> = [
  { id: 'compatibility', label: '4-NN Fit' },
  { id: 'similarity', label: 'Similarity' },
  { id: 'contrast', label: 'Contrast' },
];

export function CohortNetworkView({
  cohort,
  activeStudentId,
  teamDraftIds,
  isTeamLocked,
  allocationFormat,
  onChangeAllocationFormat,
  onToggleTeamLock,
  onInspectOrSelectStudent,
  onLoadTeamIntoStudio,
}: CohortNetworkViewProps): JSX.Element {
  const [selectedModel, setSelectedModel] = useState<GraphModelId>('compatibility');
  const [highlightMode, setHighlightMode] = useState<NetworkHighlightMode>('none');
  const [showCommunities, setShowCommunities] = useState<boolean>(true);
  const [spotlightBridges, setSpotlightBridges] = useState<boolean>(false);
  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isExpandedStage, setIsExpandedStage] = useState<boolean>(false);

  const activeGraph = cohort.graphs[selectedModel];
  const compatGraph = cohort.graphs.compatibility;

  const effectiveLockedTeam = useMemo(
    () => (isTeamLocked && teamDraftIds.length >= 2 ? teamDraftIds : null),
    [isTeamLocked, teamDraftIds],
  );

  const allocation = useMemo(
    () => cohort.computeAllocation(allocationFormat, effectiveLockedTeam),
    [cohort, allocationFormat, effectiveLockedTeam],
  );

  const formattedDiameter = useMemo(() => {
    const d = activeGraph.diameterHops;
    if (!Number.isFinite(d) || d <= 0) {
      return activeGraph.connected ? '0' : `∞ (${activeGraph.componentCount}c)`;
    }
    if (!activeGraph.connected) {
      return `${d} (${activeGraph.componentCount}c)`;
    }
    return `${d} hops`;
  }, [activeGraph.diameterHops, activeGraph.connected, activeGraph.componentCount]);

  const modularityDeltaVsCompat = useMemo(() => {
    if (selectedModel === 'compatibility') return null;
    if (!Number.isFinite(activeGraph.modularityQ) || !Number.isFinite(compatGraph.modularityQ)) {
      return null;
    }
    const diff = activeGraph.modularityQ - compatGraph.modularityQ;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs 4-NN`;
  }, [selectedModel, activeGraph.modularityQ, compatGraph.modularityQ]);

  const handleSelectModel = (model: GraphModelId) => {
    setSelectedModel(model);
    if (model !== 'compatibility' && highlightMode === 'allocation') {
      setHighlightMode('none');
    }
  };

  const toggleHighlightMode = (target: 'allocation' | 'ego') => {
    setSpotlightBridges(false);
    setHighlightMode((prev) => (prev === target ? 'none' : target));
  };

  const handleToggleCommunities = () => {
    if (selectedModel !== 'compatibility') {
      setSelectedModel('compatibility');
      setShowCommunities(true);
      return;
    }
    setShowCommunities((prev) => !prev);
  };

  const handleToggleBridges = () => {
    setSpotlightBridges((prev) => {
      const next = !prev;
      if (next) setHighlightMode('none');
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Minimalist Model Switcher, Topology Strip & Highlight Overlays */}
      <div className="editorial-card rounded-3xl px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Segmented Graph Model Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-slate-900/[0.07] bg-slate-100/85 p-1"
              role="tablist"
              aria-label="Graph topology model"
            >
              {GRAPH_MODEL_TABS.map((tab) => {
                const isActive = selectedModel === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleSelectModel(tab.id)}
                    className={`relative rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'text-slate-900'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isActive ? (
                      <motion.div
                        layoutId="cohort-graph-model-pill"
                        transition={{ type: 'spring', stiffness: 430, damping: 34 }}
                        className="absolute inset-0 rounded-xl border border-slate-900/[0.08] bg-white shadow-xs"
                      />
                    ) : null}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Crisp Monospace Topology Metric Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-900/[0.07] bg-[#FCFCFD] px-2.5 py-1 text-xs">
              <span className="text-[10.5px] text-slate-400">Nodes</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {activeGraph.nodeCount}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-900/[0.07] bg-[#FCFCFD] px-2.5 py-1 text-xs">
              <span className="text-[10.5px] text-slate-400">Edges</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {activeGraph.edgeCount}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-900/[0.07] bg-[#FCFCFD] px-2.5 py-1 text-xs">
              <span className="text-[10.5px] text-slate-400">Density</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {activeGraph.density.toFixed(3)}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-900/[0.07] bg-[#FCFCFD] px-2.5 py-1 text-xs">
              <span className="text-[10.5px] text-slate-400">Diameter</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {formattedDiameter}
              </span>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs ${
                selectedModel === 'compatibility'
                  ? 'border-emerald-500/30 bg-emerald-50/70 text-emerald-900'
                  : 'border-slate-900/[0.07] bg-[#FCFCFD] text-slate-900'
              }`}
            >
              <span
                className={`text-[10.5px] ${
                  selectedModel === 'compatibility'
                    ? 'font-medium text-emerald-700'
                    : 'text-slate-400'
                }`}
              >
                Modularity Q
              </span>
              <span className="font-mono-tabular font-bold">
                {Number.isFinite(activeGraph.modularityQ)
                  ? activeGraph.modularityQ.toFixed(2)
                  : '0.00'}
              </span>
              {modularityDeltaVsCompat ? (
                <span className="font-mono-tabular text-[10px] text-slate-400">
                  ({modularityDeltaVsCompat})
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Visual Highlight Pills Row */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900/[0.06] pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggleHighlightMode('allocation')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                highlightMode === 'allocation'
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                  : 'border-slate-900/[0.09] bg-white text-slate-700 hover:border-slate-900/[0.2] hover:bg-slate-50'
              }`}
            >
              <GitFork className="h-3.5 w-3.5" />
              <span>Teams</span>
            </button>

            <button
              type="button"
              onClick={handleToggleCommunities}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                showCommunities && selectedModel === 'compatibility'
                  ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                  : 'border-slate-900/[0.09] bg-white text-slate-700 hover:border-slate-900/[0.2] hover:bg-slate-50'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Clusters</span>
            </button>

            <button
              type="button"
              onClick={() => toggleHighlightMode('ego')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                highlightMode === 'ego'
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                  : 'border-slate-900/[0.09] bg-white text-slate-700 hover:border-slate-900/[0.2] hover:bg-slate-50'
              }`}
            >
              <Orbit className="h-3.5 w-3.5" />
              <span>My Links</span>
            </button>

            <button
              type="button"
              onClick={handleToggleBridges}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                spotlightBridges
                  ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                  : 'border-slate-900/[0.09] bg-white text-slate-700 hover:border-slate-900/[0.2] hover:bg-slate-50'
              }`}
            >
              <Crown className="h-3.5 w-3.5" />
              <span>Bridges</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Synchronized Stage + Global Matchmaker Split / Theater Workspace */}
      <div
        className={
          isExpandedStage
            ? 'grid grid-cols-1 gap-6'
            : 'grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(404px,1fr)]'
        }
      >
        <div className={isExpandedStage ? '' : 'xl:sticky xl:top-6'}>
          <NetworkGraphCanvas
            cohort={cohort}
            selectedModel={selectedModel}
            activeStudentId={activeStudentId}
            teamDraftIds={teamDraftIds}
            isTeamLocked={isTeamLocked}
            allocation={allocation}
            highlightMode={highlightMode}
            showCommunities={showCommunities}
            spotlightBridges={spotlightBridges}
            hoveredTeamId={hoveredTeamId}
            selectedNodeId={selectedNodeId}
            isExpandedStage={isExpandedStage}
            onSelectNode={setSelectedNodeId}
            onHoverTeam={setHoveredTeamId}
            onToggleExpandStage={() => setIsExpandedStage((prev) => !prev)}
            onInspectOrSelectStudent={onInspectOrSelectStudent}
            onLoadTeamIntoStudio={onLoadTeamIntoStudio}
          />
        </div>

        <GlobalMatchmakerPanel
          cohort={cohort}
          activeStudentId={activeStudentId}
          teamDraftIds={teamDraftIds}
          isTeamLocked={isTeamLocked}
          allocationFormat={allocationFormat}
          allocation={allocation}
          hoveredTeamId={hoveredTeamId}
          selectedNodeId={selectedNodeId}
          isExpandedStage={isExpandedStage}
          onChangeAllocationFormat={(fmt) => {
            onChangeAllocationFormat(fmt);
            setHighlightMode('allocation');
          }}
          onToggleTeamLock={(locked) => {
            onToggleTeamLock(locked);
            if (locked) setHighlightMode('allocation');
          }}
          onHoverTeam={setHoveredTeamId}
          onSelectStudentNode={(studentId) =>
            setSelectedNodeId((prev) => (prev === studentId ? null : studentId))
          }
          onLoadTeamIntoStudio={onLoadTeamIntoStudio}
        />
      </div>
    </div>
  );
}
