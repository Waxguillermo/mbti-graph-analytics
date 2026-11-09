import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  Compass,
  Crown,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { MBTI_GROUPS, MBTI_TYPES } from '../engine/mbtiMetadata';
import type {
  AllocatedTeam,
  CohortAllocationResult,
  CohortDataset,
  GraphModelId,
  LouvainCommunity,
} from '../engine/types';
import { LottieAvatar } from './ui/LottieAvatar';
import { TraitRadarSvg } from './ui/TraitRadarSvg';

export type NetworkHighlightMode = 'none' | 'allocation' | 'ego';

export interface NetworkGraphCanvasProps {
  cohort: CohortDataset;
  selectedModel: GraphModelId;
  activeStudentId: string;
  teamDraftIds: string[];
  isTeamLocked: boolean;
  allocation: CohortAllocationResult;
  highlightMode: NetworkHighlightMode;
  showCommunities: boolean;
  spotlightBridges: boolean;
  hoveredTeamId: string | null;
  selectedNodeId: string | null;
  isExpandedStage: boolean;
  onSelectNode: (studentId: string | null) => void;
  onHoverTeam: (teamId: string | null) => void;
  onToggleExpandStage: () => void;
  onInspectOrSelectStudent: (studentId: string) => void;
  onLoadTeamIntoStudio: (memberIds: string[]) => void;
}

interface Point2D {
  x: number;
  y: number;
}

interface ComputedHull {
  community: LouvainCommunity;
  pathD: string;
  labelPos: Point2D;
  pillWidth: number;
}

interface AllocationEdgeOverlay {
  key: string;
  teamId: string;
  memberA: string;
  memberB: string;
  compatibility: number;
  color: string;
  isLockedTeam: boolean;
  includesActiveUser: boolean;
}

const STAGE_WIDTH = 1080;
const STAGE_HEIGHT = 680;
const PAD_X = 172;
const PAD_Y = 126;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.75;

function crossProduct(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Deterministic 2D Monotone Chain convex hull in O(n log n) */
function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Subdivides long hull segments so Catmull-Rom splines never overshoot at cap transitions */
function subdividePolygon(hull: Point2D[], maxSegmentLength = 38): Point2D[] {
  if (hull.length < 2) return hull;
  const result: Point2D[] = [];
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / maxSegmentLength));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      result.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
    }
  }
  return result;
}

/** Converts a closed polygon into a smooth C1 cubic Bezier SVG path via Catmull-Rom tangents */
function closedCatmullRomToBezierPath(pts: Point2D[], tension = 1 / 6): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} Z`;
  if (n === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)} Z`;
  }

  const parts: string[] = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    parts.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function orderPointsAroundCentroid(pts: Point2D[]): Point2D[] {
  if (pts.length <= 2) return pts;
  const cx = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
  const cy = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
  return [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
}

export function NetworkGraphCanvas({
  cohort,
  selectedModel,
  activeStudentId,
  teamDraftIds,
  isTeamLocked,
  allocation,
  highlightMode,
  showCommunities,
  spotlightBridges,
  hoveredTeamId,
  selectedNodeId,
  isExpandedStage,
  onSelectNode,
  onHoverTeam,
  onToggleExpandStage,
  onInspectOrSelectStudent,
  onLoadTeamIntoStudio,
}: NetworkGraphCanvasProps): JSX.Element {
  const svgUid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const didDragRef = useRef<boolean>(false);

  const [camera, setCamera] = useState<{ x: number; y: number; k: number }>({
    x: 0,
    y: 0,
    k: 1,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredCommunityIndex, setHoveredCommunityIndex] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const activeGraph = cohort.graphs[selectedModel];

  // Normalize deterministic spring layout [-1, 1]^2 into crisp stage coordinates
  const canvasPositions = useMemo<Record<string, Point2D>>(() => {
    const entries = cohort.students.map((s) => ({
      id: s.id,
      raw: cohort.nodePositions[s.id] ?? { x: 0, y: 0 },
    }));
    if (entries.length === 0) return {};

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const item of entries) {
      if (item.raw.x < minX) minX = item.raw.x;
      if (item.raw.x > maxX) maxX = item.raw.x;
      if (item.raw.y < minY) minY = item.raw.y;
      if (item.raw.y > maxY) maxY = item.raw.y;
    }

    const spanX = Math.max(0.001, maxX - minX);
    const spanY = Math.max(0.001, maxY - minY);
    const usableW = STAGE_WIDTH - PAD_X * 2;
    const usableH = STAGE_HEIGHT - PAD_Y * 2;

    const mapped: Record<string, Point2D> = {};
    for (const item of entries) {
      const nx = (item.raw.x - minX) / spanX;
      const ny = (item.raw.y - minY) / spanY;
      mapped[item.id] = {
        x: PAD_X + nx * usableW,
        y: PAD_Y + ny * usableH,
      };
    }
    return mapped;
  }, [cohort.students, cohort.nodePositions]);

  // Map community index -> LouvainCommunity safely
  const communityByIndex = useMemo(() => {
    const map = new Map<number, LouvainCommunity>();
    for (const comm of cohort.communities) {
      map.set(comm.index, comm);
    }
    return map;
  }, [cohort.communities]);

  // Compute organic radially-padded Catmull-Rom convex hulls for Louvain communities
  const communityHulls = useMemo<ComputedHull[]>(() => {
    if (!showCommunities || selectedModel !== 'compatibility') return [];

    const stageCenter = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
    const radialSamples = 14;
    const padRadius = 45;

    return cohort.communities
      .map((comm) => {
        const memberPts = comm.members
          .map((id) => canvasPositions[id])
          .filter((p): p is Point2D => Boolean(p));
        if (memberPts.length === 0) return null;

        const centroid = {
          x: memberPts.reduce((acc, p) => acc + p.x, 0) / memberPts.length,
          y: memberPts.reduce((acc, p) => acc + p.y, 0) / memberPts.length,
        };

        const paddedPts: Point2D[] = [];
        for (const p of memberPts) {
          for (let k = 0; k < radialSamples; k += 1) {
            const angle = (2 * Math.PI * k) / radialSamples;
            paddedPts.push({
              x: p.x + padRadius * Math.cos(angle),
              y: p.y + padRadius * Math.sin(angle),
            });
          }
        }

        const rawHull = computeConvexHull(paddedPts);
        const subdivided = subdividePolygon(rawHull, 36);
        const pathD = closedCatmullRomToBezierPath(subdivided, 1 / 6);

        // Place label pill cleanly along the outer rim away from graph center
        let dirX = centroid.x - stageCenter.x;
        let dirY = centroid.y - stageCenter.y;
        const dirLen = Math.hypot(dirX, dirY);
        if (dirLen < 1) {
          dirX = 0;
          dirY = -1;
        } else {
          dirX /= dirLen;
          dirY /= dirLen;
        }

        let bestAnchor = rawHull[0];
        let bestProj = -Infinity;
        for (const hp of rawHull) {
          const proj = (hp.x - stageCenter.x) * dirX + (hp.y - stageCenter.y) * dirY;
          if (proj > bestProj) {
            bestProj = proj;
            bestAnchor = hp;
          }
        }

        const pillWidth = Math.max(178, Math.round(comm.fullLabel.length * 6.0 + 54));
        const halfPill = pillWidth / 2;

        let lx = clamp(bestAnchor.x + dirX * 20, halfPill + 16, STAGE_WIDTH - halfPill - 16);
        let ly = clamp(bestAnchor.y + dirY * 20, 26, STAGE_HEIGHT - 26);

        // Nudge cluster badge vertically if any node medallion sits directly underneath it
        for (const pt of Object.values(canvasPositions)) {
          if (Math.abs(lx - pt.x) < halfPill + 24 && Math.abs(ly - pt.y) < 36) {
            const pushDown = dirY >= 0;
            ly = clamp(pushDown ? pt.y + 42 : pt.y - 42, 24, STAGE_HEIGHT - 24);
          }
        }

        const labelPos = { x: lx, y: ly };

        return {
          community: comm,
          pathD,
          labelPos,
          pillWidth,
        };
      })
      .filter((h): h is ComputedHull => h !== null);
  }, [cohort.communities, canvasPositions, showCommunities, selectedModel]);

  // Adjacency lookup in the currently selected graph model
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of cohort.students) {
      map.set(s.id, new Set<string>());
    }
    for (const edge of activeGraph.edges) {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }
    return map;
  }, [cohort.students, activeGraph.edges]);

  // Map studentId -> AllocatedTeam and flatten intra-team pairs for Allocation Overlay
  const { studentToTeam, allocationEdges, teamPolygons } = useMemo(() => {
    const sToTeam = new Map<string, AllocatedTeam>();
    const edges: AllocationEdgeOverlay[] = [];
    const polygons: Array<{
      team: AllocatedTeam;
      pointsAttr: string;
      color: string;
    }> = [];

    for (const team of allocation.teams) {
      for (const id of team.memberIds) {
        sToTeam.set(id, team);
      }

      const includesActiveUser = team.memberIds.includes(activeStudentId);
      const firstCommIdx = cohort.nodeToCommunity[team.memberIds[0]];
      const allSameComm = team.memberIds.every(
        (id) => cohort.nodeToCommunity[id] === firstCommIdx,
      );
      const commColor = communityByIndex.get(firstCommIdx)?.color;

      const strokeColor = team.isLockedCustomTeam
        ? '#4F46E5'
        : includesActiveUser
          ? '#0D9488'
          : allSameComm && commColor
            ? commColor
            : '#334155';

      for (let i = 0; i < team.memberIds.length; i += 1) {
        for (let j = i + 1; j < team.memberIds.length; j += 1) {
          const a = team.memberIds[i];
          const b = team.memberIds[j];
          const compat =
            cohort.compatMatrix[a]?.[b] ?? cohort.compatMatrix[b]?.[a] ?? 0;
          edges.push({
            key: `${team.id}:${a}--${b}`,
            teamId: team.id,
            memberA: a,
            memberB: b,
            compatibility: compat,
            color: strokeColor,
            isLockedTeam: team.isLockedCustomTeam,
            includesActiveUser,
          });
        }
      }

      if (team.memberIds.length >= 3) {
        const pts = team.memberIds
          .map((id) => canvasPositions[id])
          .filter((p): p is Point2D => Boolean(p));
        if (pts.length >= 3) {
          const ordered = orderPointsAroundCentroid(pts);
          polygons.push({
            team,
            pointsAttr: ordered.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
            color: strokeColor,
          });
        }
      }
    }

    return {
      studentToTeam: sToTeam,
      allocationEdges: edges,
      teamPolygons: polygons,
    };
  }, [
    allocation.teams,
    activeStudentId,
    cohort.nodeToCommunity,
    cohort.compatMatrix,
    communityByIndex,
    canvasPositions,
  ]);

  // Smooth non-passive wheel zoom anchored at cursor SVG position
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svgEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const svgX = ((e.clientX - rect.left) / rect.width) * STAGE_WIDTH;
      const svgY = ((e.clientY - rect.top) / rect.height) * STAGE_HEIGHT;
      const factor = Math.exp(-e.deltaY * 0.0014);

      setCamera((prev) => {
        const nextK = clamp(prev.k * factor, MIN_ZOOM, MAX_ZOOM);
        const ratio = nextK / prev.k;
        return {
          k: nextK,
          x: svgX - (svgX - prev.x) * ratio,
          y: svgY - (svgY - prev.y) * ratio,
        };
      });
    };

    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Dismiss inspector or search with Escape key
  useEffect(() => {
    if (!selectedNodeId && !searchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false);
        else onSelectNode(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId, searchOpen, onSelectNode]);

  const zoomByFactor = useCallback((factor: number) => {
    const cx = STAGE_WIDTH / 2;
    const cy = STAGE_HEIGHT / 2;
    setCamera((prev) => {
      const nextK = clamp(prev.k * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = nextK / prev.k;
      return {
        k: nextK,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  }, []);

  const resetCamera = useCallback(() => {
    setCamera({ x: 0, y: 0, k: 1 });
  }, []);

  const focusStudentCamera = useCallback(
    (studentId: string) => {
      const pos = canvasPositions[studentId];
      if (!pos) return;
      const targetK = 1.38;
      setCamera({
        k: targetK,
        x: STAGE_WIDTH / 2 - pos.x * targetK,
        y: STAGE_HEIGHT / 2 - pos.y * targetK,
      });
    },
    [canvasPositions],
  );

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    didDragRef.current = false;
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: camera.x,
      originY: camera.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const state = dragStateRef.current;
    if (!state.active || state.pointerId !== e.pointerId) return;

    const dxClient = e.clientX - state.startClientX;
    const dyClient = e.clientY - state.startClientY;

    if (!state.moved && Math.hypot(dxClient, dyClient) > 4) {
      state.moved = true;
      didDragRef.current = true;
      setIsDragging(true);
    }

    if (state.moved && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = STAGE_WIDTH / Math.max(1, rect.width);
      const scaleY = STAGE_HEIGHT / Math.max(1, rect.height);
      setCamera((prev) => ({
        ...prev,
        x: state.originX + dxClient * scaleX,
        y: state.originY + dyClient * scaleY,
      }));
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const state = dragStateRef.current;
    if (!state.active || state.pointerId !== e.pointerId) return;
    const wasDrag = state.moved;
    dragStateRef.current.active = false;
    setIsDragging(false);

    if (!wasDrag && (e.target as Element).getAttribute('data-stage-bg') === 'true') {
      onSelectNode(null);
      setSearchOpen(false);
    }
  };

  // Filtered quick-find results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cohort.students.slice(0, 7);
    return cohort.students
      .filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) ||
          s.fullType.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      )
      .slice(0, 7);
  }, [cohort.students, searchQuery]);

  // Determine spotlight membership across all interactive layers
  const hoveredTeam = useMemo(
    () => (hoveredTeamId ? allocation.teams.find((t) => t.id === hoveredTeamId) ?? null : null),
    [hoveredTeamId, allocation.teams],
  );

  const hoveredTeamMemberSet = useMemo(
    () => new Set(hoveredTeam ? hoveredTeam.memberIds : []),
    [hoveredTeam],
  );

  const focusNodeId = hoveredNodeId ?? selectedNodeId;
  const focusNeighbors = useMemo(
    () => (focusNodeId ? neighborMap.get(focusNodeId) ?? new Set<string>() : new Set<string>()),
    [focusNodeId, neighborMap],
  );

  const egoNeighbors = useMemo(
    () => neighborMap.get(activeStudentId) ?? new Set<string>(),
    [neighborMap, activeStudentId],
  );

  const draftSet = useMemo(() => new Set(teamDraftIds), [teamDraftIds]);

  const isNodeHighlighted = (studentId: string): boolean => {
    if (hoveredTeam) {
      return hoveredTeamMemberSet.has(studentId);
    }
    if (hoveredCommunityIndex !== null) {
      return cohort.nodeToCommunity[studentId] === hoveredCommunityIndex;
    }
    if (focusNodeId) {
      return studentId === focusNodeId || focusNeighbors.has(studentId);
    }
    if (highlightMode === 'ego') {
      return studentId === activeStudentId || egoNeighbors.has(studentId);
    }
    if (spotlightBridges) {
      return Boolean(activeGraph.centralities[studentId]?.isBridgeHub);
    }
    return true;
  };

  const selectedStudent = selectedNodeId ? cohort.studentMap[selectedNodeId] ?? null : null;
  const activeStudent = cohort.studentMap[activeStudentId] ?? cohort.students[0];
  const selectedCentrality = selectedNodeId ? activeGraph.centralities[selectedNodeId] ?? null : null;
  const selectedCommunity =
    selectedNodeId !== null
      ? communityByIndex.get(cohort.nodeToCommunity[selectedNodeId]) ?? null
      : null;

  const selectedPairBreakdown = useMemo(() => {
    if (!selectedStudent || !activeStudent || selectedStudent.id === activeStudent.id) {
      return null;
    }
    return cohort.getPairBreakdown(activeStudent.id, selectedStudent.id);
  }, [cohort, activeStudent, selectedStudent]);

  const showAllocationLayer = highlightMode === 'allocation' || hoveredTeam !== null;

  return (
    <div className="editorial-card relative overflow-hidden rounded-3xl">
      {/* Top Floating Legend, Quick-Find & Community Chips */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-900/[0.08] bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-xs backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                onSelectNode(activeStudentId);
                focusStudentCamera(activeStudentId);
              }}
              className="inline-flex items-center gap-1.5 text-slate-900 transition-opacity hover:opacity-80"
              title="Inspect active profile"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25" />
              <span>You ({activeStudent?.displayName})</span>
            </button>
            <span className="h-3 w-px bg-slate-200" />
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Crown className="h-3 w-3 text-amber-500" />
              Bridge Hub
            </span>
            {teamDraftIds.length >= 2 ? (
              <>
                <span className="h-3 w-px bg-slate-200" />
                <span className="inline-flex items-center gap-1.5 text-indigo-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-600" />
                  {isTeamLocked ? 'Locked Studio Team' : 'Studio Draft'}
                </span>
              </>
            ) : null}
          </div>

          {/* Discreet Student Quick-Locator */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSearchOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 text-[11px] font-medium shadow-xs backdrop-blur-md transition-colors ${
                searchOpen
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-900/[0.08] bg-white/90 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="h-3 w-3" />
              <span>Find Student</span>
            </button>

            {searchOpen ? (
              <div className="editorial-card absolute left-0 mt-1.5 w-64 rounded-2xl bg-white/96 p-2 shadow-lg backdrop-blur-md">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name or MBTI (e.g. INTJ)…"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                />
                <div className="mt-1.5 max-h-48 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          onSelectNode(s.id);
                          focusStudentCamera(s.id);
                          setSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-100"
                      >
                        <span className="truncate font-medium text-slate-800">
                          {s.displayName}
                        </span>
                        <span
                          className="ml-2 shrink-0 rounded px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold"
                          style={{
                            backgroundColor: MBTI_GROUPS[s.group].softBg,
                            color: MBTI_GROUPS[s.group].color,
                          }}
                        >
                          {s.fullType}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-2 text-center text-[11px] text-slate-400">
                      No matching student
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {selectedModel === 'compatibility' && showCommunities ? (
          <div className="pointer-events-auto hidden flex-wrap items-center gap-1 rounded-2xl border border-slate-900/[0.08] bg-white/90 px-2 py-1.5 text-[11px] shadow-xs backdrop-blur-md md:inline-flex">
            {cohort.communities.map((comm) => {
              const isCommHovered = hoveredCommunityIndex === comm.index;
              return (
                <button
                  key={comm.code}
                  type="button"
                  onMouseEnter={() => setHoveredCommunityIndex(comm.index)}
                  onMouseLeave={() => setHoveredCommunityIndex(null)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2 py-0.5 font-medium transition-colors ${
                    isCommHovered
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title={`${comm.fullLabel} (${comm.members.length} students)`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: comm.color }}
                  />
                  <span>{comm.code}</span>
                  <span
                    className={`hidden text-[10px] 2xl:inline ${
                      isCommHovered ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {comm.archetype}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Interactive Vector Stage */}
      <div
        className={`dot-grid-canvas relative w-full select-none bg-[#FCFCFD] transition-[height] duration-300 ${
          isExpandedStage ? 'h-[600px] lg:h-[670px]' : 'h-[500px] sm:h-[560px] xl:h-[610px]'
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`h-full w-full touch-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          role="img"
          aria-label={`${activeGraph.title} Interactive Cohort Network`}
        >
          <defs>
            <filter
              id={`${svgUid}-medallion-shadow`}
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feDropShadow
                dx="0"
                dy="2.5"
                stdDeviation="3.5"
                floodColor="#0f172a"
                floodOpacity="0.11"
              />
            </filter>
            <filter
              id={`${svgUid}-pill-shadow`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="1.5"
                stdDeviation="2"
                floodColor="#0f172a"
                floodOpacity="0.08"
              />
            </filter>
            {/* Shared local-origin circular avatar clipPath (immune to special chars in student IDs) */}
            <clipPath id={`${svgUid}-avatar-clip`}>
              <circle cx="0" cy="0" r="18.2" />
            </clipPath>
          </defs>

          {/* Transparent click-catcher for stage background */}
          <rect
            x={0}
            y={0}
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            fill="transparent"
            data-stage-bg="true"
          />

          <g
            transform={`translate(${camera.x.toFixed(2)}, ${camera.y.toFixed(2)}) scale(${camera.k.toFixed(4)})`}
          >
            {/* 1. Smooth Louvain Community Convex Hulls */}
            {communityHulls.map(({ community, pathD }) => {
              const isDimmed =
                hoveredTeam !== null ||
                (hoveredCommunityIndex !== null && hoveredCommunityIndex !== community.index);
              const isSpotlighted = hoveredCommunityIndex === community.index;

              return (
                <path
                  key={community.code}
                  d={pathD}
                  fill={community.fillRgba}
                  stroke={community.borderRgba}
                  strokeWidth={isSpotlighted ? 2.2 : 1.35}
                  strokeDasharray={isSpotlighted ? undefined : '6 4'}
                  style={{
                    opacity: isDimmed ? 0.35 : 1,
                    transition: 'opacity 200ms ease',
                  }}
                  onMouseEnter={() => setHoveredCommunityIndex(community.index)}
                  onMouseLeave={() => setHoveredCommunityIndex(null)}
                  className="cursor-pointer transition-all duration-200"
                />
              );
            })}

            {/* 2. Base Graph Topology Edges */}
            <g>
              {activeGraph.edges.map((edge) => {
                const pA = canvasPositions[edge.source];
                const pB = canvasPositions[edge.target];
                if (!pA || !pB) return null;

                const isIncidentToFocus =
                  focusNodeId !== null &&
                  (edge.source === focusNodeId || edge.target === focusNodeId);
                const isIncidentToEgo =
                  highlightMode === 'ego' &&
                  (edge.source === activeStudentId || edge.target === activeStudentId);
                const isBridgeIncident =
                  spotlightBridges &&
                  (Boolean(activeGraph.centralities[edge.source]?.isBridgeHub) ||
                    Boolean(activeGraph.centralities[edge.target]?.isBridgeHub));
                const isSameHoveredComm =
                  hoveredCommunityIndex !== null &&
                  cohort.nodeToCommunity[edge.source] === hoveredCommunityIndex &&
                  cohort.nodeToCommunity[edge.target] === hoveredCommunityIndex;

                const baseWidth =
                  1.05 + Math.pow(clamp((edge.weight - 0.45) / 0.55, 0, 1), 1.25) * 2.4;

                let stroke = '#64748B';
                let strokeOpacity = 0.24 + clamp((edge.weight - 0.55) * 0.65, 0, 0.26);
                let strokeWidth = baseWidth;

                if (showAllocationLayer) {
                  strokeOpacity = 0.08;
                } else if (hoveredCommunityIndex !== null) {
                  strokeOpacity = isSameHoveredComm ? 0.65 : 0.07;
                  if (isSameHoveredComm) {
                    stroke = communityByIndex.get(hoveredCommunityIndex)?.color ?? '#475569';
                  }
                } else if (focusNodeId !== null) {
                  if (isIncidentToFocus) {
                    stroke = '#0F172A';
                    strokeOpacity = 0.84;
                    strokeWidth = baseWidth + 0.9;
                  } else {
                    strokeOpacity = 0.07;
                  }
                } else if (highlightMode === 'ego') {
                  if (isIncidentToEgo) {
                    stroke = '#0D9488';
                    strokeOpacity = 0.9;
                    strokeWidth = baseWidth + 1.1;
                  } else {
                    strokeOpacity = 0.07;
                  }
                } else if (spotlightBridges) {
                  strokeOpacity = isBridgeIncident ? 0.48 : 0.08;
                  if (isBridgeIncident) stroke = '#D97706';
                }

                return (
                  <line
                    key={`${edge.source}--${edge.target}`}
                    x1={pA.x}
                    y1={pA.y}
                    x2={pB.x}
                    y2={pB.y}
                    stroke={stroke}
                    strokeOpacity={strokeOpacity}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-opacity 180ms ease, stroke-width 180ms ease' }}
                  />
                );
              })}
            </g>

            {/* 3. Allocation Intra-Team Polygons & Edges Layer */}
            {showAllocationLayer ? (
              <g>
                {/* Translucent Triangles / Quads for Trios & Quartets */}
                {teamPolygons.map(({ team, pointsAttr, color }) => {
                  const isHoveredThisTeam = hoveredTeamId === team.id;
                  if (hoveredTeam && !isHoveredThisTeam) return null;
                  const fillAlpha = isHoveredThisTeam
                    ? 0.16
                    : team.isLockedCustomTeam || team.memberIds.includes(activeStudentId)
                      ? 0.11
                      : 0.06;

                  return (
                    <polygon
                      key={`poly-${team.id}`}
                      points={pointsAttr}
                      fill={color}
                      fillOpacity={fillAlpha}
                      stroke="none"
                      onMouseEnter={() => onHoverTeam(team.id)}
                      onMouseLeave={() => onHoverTeam(null)}
                      className="cursor-pointer transition-opacity duration-150"
                    />
                  );
                })}

                {/* Intra-Team Pairwise Links */}
                {allocationEdges.map((ae) => {
                  const isHoveredThisTeam = hoveredTeamId === ae.teamId;
                  if (hoveredTeam && !isHoveredThisTeam) return null;

                  const pA = canvasPositions[ae.memberA];
                  const pB = canvasPositions[ae.memberB];
                  if (!pA || !pB) return null;

                  const isFocusTeam =
                    focusNodeId !== null &&
                    studentToTeam.get(focusNodeId)?.id === ae.teamId;

                  const emphasized =
                    isHoveredThisTeam || ae.isLockedTeam || ae.includesActiveUser || isFocusTeam;

                  return (
                    <g
                      key={ae.key}
                      onMouseEnter={() => onHoverTeam(ae.teamId)}
                      onMouseLeave={() => onHoverTeam(null)}
                      className="cursor-pointer"
                    >
                      <line
                        x1={pA.x}
                        y1={pA.y}
                        x2={pB.x}
                        y2={pB.y}
                        stroke={ae.color}
                        strokeOpacity={emphasized ? 0.95 : 0.56}
                        strokeWidth={isHoveredThisTeam ? 3.4 : emphasized ? 2.7 : 1.95}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* 4. Edge Callout % Badges (Ego-Net, Node Focus, or Hovered/Pinned Allocation Team) */}
            <g className="pointer-events-none">
              {showAllocationLayer
                ? allocationEdges.map((ae) => {
                    const isHoveredThisTeam = hoveredTeamId === ae.teamId;
                    const isFocusTeam =
                      focusNodeId !== null &&
                      studentToTeam.get(focusNodeId)?.id === ae.teamId;

                    const showBadge =
                      hoveredTeam !== null
                        ? isHoveredThisTeam
                        : isHoveredThisTeam ||
                          isFocusTeam ||
                          ae.isLockedTeam ||
                          ae.includesActiveUser;

                    if (!showBadge) return null;
                    const pA = canvasPositions[ae.memberA];
                    const pB = canvasPositions[ae.memberB];
                    if (!pA || !pB) return null;

                    const mx = (pA.x + pB.x) / 2;
                    const my = (pA.y + pB.y) / 2;
                    const pct = `${Math.round(ae.compatibility * 100)}%`;

                    return (
                      <g
                        key={`badge-${ae.key}`}
                        transform={`translate(${mx.toFixed(1)}, ${my.toFixed(1)})`}
                        filter={`url(#${svgUid}-pill-shadow)`}
                      >
                        <rect
                          x={-19}
                          y={-9.5}
                          width={38}
                          height={19}
                          rx={9.5}
                          fill="#FFFFFF"
                          stroke={ae.color}
                          strokeWidth={1.3}
                        />
                        <text
                          x={0}
                          y={0.5}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="font-mono-tabular font-semibold"
                          fill={ae.color}
                          style={{ fontSize: 9.8 }}
                        >
                          {pct}
                        </text>
                      </g>
                    );
                  })
                : activeGraph.edges.map((edge) => {
                    const isIncidentToFocus =
                      focusNodeId !== null &&
                      (edge.source === focusNodeId || edge.target === focusNodeId);
                    const isIncidentToEgo =
                      highlightMode === 'ego' &&
                      (edge.source === activeStudentId || edge.target === activeStudentId);

                    if (!isIncidentToFocus && !isIncidentToEgo) return null;

                    const pA = canvasPositions[edge.source];
                    const pB = canvasPositions[edge.target];
                    if (!pA || !pB) return null;

                    const mx = (pA.x + pB.x) / 2;
                    const my = (pA.y + pB.y) / 2;

                    const compatScore =
                      cohort.compatMatrix[edge.source]?.[edge.target] ??
                      cohort.compatMatrix[edge.target]?.[edge.source] ??
                      edge.weight;
                    const scoreToDisplay =
                      highlightMode === 'ego' || selectedModel === 'compatibility'
                        ? compatScore
                        : edge.weight;
                    const pct = `${Math.round(scoreToDisplay * 100)}%`;
                    const accent = isIncidentToEgo ? '#0D9488' : '#0F172A';

                    return (
                      <g
                        key={`ebadge-${edge.source}--${edge.target}`}
                        transform={`translate(${mx.toFixed(1)}, ${my.toFixed(1)})`}
                        filter={`url(#${svgUid}-pill-shadow)`}
                      >
                        <rect
                          x={-19}
                          y={-9.5}
                          width={38}
                          height={19}
                          rx={9.5}
                          fill="#FFFFFF"
                          stroke={accent}
                          strokeWidth={1.2}
                        />
                        <text
                          x={0}
                          y={0.5}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="font-mono-tabular font-semibold"
                          fill={accent}
                          style={{ fontSize: 9.6 }}
                        >
                          {pct}
                        </text>
                      </g>
                    );
                  })}
            </g>

            {/* 5. Student Avatar Medallion Nodes */}
            <g>
              {cohort.students.map((student) => {
                const pos = canvasPositions[student.id];
                if (!pos) return null;

                const meta = MBTI_TYPES[student.mbti];
                const groupMeta = MBTI_GROUPS[student.group];
                const comm = communityByIndex.get(cohort.nodeToCommunity[student.id]);
                const centrality = activeGraph.centralities[student.id];

                const isYou = student.id === activeStudentId;
                const isSelected = student.id === selectedNodeId;
                const isHovered = student.id === hoveredNodeId;
                const isInStudioDraft = teamDraftIds.length >= 2 && draftSet.has(student.id);
                const isBridge = Boolean(centrality?.isBridgeHub);
                const highlighted = isNodeHighlighted(student.id);

                const outerRingColor =
                  selectedModel === 'compatibility' && comm ? comm.color : groupMeta.color;
                const scale = isSelected || isHovered ? 1.12 : isYou ? 1.06 : 1;

                return (
                  <g
                    key={student.id}
                    transform={`translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`}
                    style={{
                      opacity: highlighted ? 1 : 0.22,
                      transition: 'opacity 180ms ease',
                    }}
                    onMouseEnter={() => setHoveredNodeId(student.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (didDragRef.current) return;
                      onSelectNode(student.id === selectedNodeId ? null : student.id);
                    }}
                    className="cursor-pointer"
                  >
                    <g
                      style={{
                        transform: `scale(${scale})`,
                        transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      {/* Active User Emerald Halo */}
                      {isYou ? (
                        <circle
                          cx={0}
                          cy={0}
                          r={27.5}
                          fill="rgba(16, 185, 129, 0.10)"
                          stroke="#10B981"
                          strokeWidth={1.8}
                          strokeDasharray="4 2.5"
                        />
                      ) : null}

                      {/* Studio Draft / Locked Team Indigo Ring */}
                      {!isYou && isInStudioDraft ? (
                        <circle
                          cx={0}
                          cy={0}
                          r={26.5}
                          fill="rgba(79, 70, 229, 0.08)"
                          stroke="#4F46E5"
                          strokeWidth={1.6}
                          strokeDasharray={isTeamLocked ? undefined : '3.5 2.5'}
                        />
                      ) : null}

                      {/* Selected Node Spotlight Ring */}
                      {isSelected ? (
                        <circle
                          cx={0}
                          cy={0}
                          r={29.5}
                          fill="none"
                          stroke="#0F172A"
                          strokeWidth={2}
                        />
                      ) : null}

                      {/* Bridge Hub Double-Ring Aureole */}
                      {isBridge ? (
                        <circle
                          cx={0}
                          cy={0}
                          r={24.5}
                          fill="none"
                          stroke="#F59E0B"
                          strokeOpacity={spotlightBridges ? 0.95 : 0.65}
                          strokeWidth={spotlightBridges ? 2 : 1.35}
                        />
                      ) : null}

                      {/* Medallion Base with Cluster/Group Ring & White Inner Rim */}
                      <g filter={`url(#${svgUid}-medallion-shadow)`}>
                        <circle cx={0} cy={0} r={21.2} fill={outerRingColor} />
                        <circle cx={0} cy={0} r={19.2} fill="#FFFFFF" />
                        <circle cx={0} cy={0} r={18.2} fill={meta.softBg} />
                        <g clipPath={`url(#${svgUid}-avatar-clip)`}>
                          <image
                            href={meta.avatarSvgUrl}
                            x={-17.5}
                            y={-17.5}
                            width={35}
                            height={35}
                            preserveAspectRatio="xMidYMid meet"
                          />
                        </g>
                      </g>

                      {/* Bridge Hub Crown/Star Emblem */}
                      {isBridge ? (
                        <g transform="translate(15.5, -15.5)">
                          <circle
                            cx={0}
                            cy={0}
                            r={6.8}
                            fill="#FEF3C7"
                            stroke="#D97706"
                            strokeWidth={1.2}
                          />
                          <path
                            d="M 0 -3.6 L 1.05 -1.1 L 3.7 -0.85 L 1.7 0.95 L 2.25 3.55 L 0 2.15 L -2.25 3.55 L -1.7 0.95 L -3.7 -0.85 L -1.05 -1.1 Z"
                            fill="#D97706"
                          />
                        </g>
                      ) : null}

                      {/* Top Pill Tag for Active User ("YOU") or Locked Studio Member */}
                      {isYou ? (
                        <g transform="translate(0, -29)">
                          <rect
                            x={-17}
                            y={-7.5}
                            width={34}
                            height={15}
                            rx={7.5}
                            fill="#059669"
                          />
                          <text
                            x={0}
                            y={0.5}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-white font-bold"
                            style={{ fontSize: 8.5, letterSpacing: '0.05em' }}
                          >
                            YOU
                          </text>
                        </g>
                      ) : isInStudioDraft ? (
                        <g transform="translate(0, -28)">
                          <rect
                            x={-22}
                            y={-7}
                            width={44}
                            height={14}
                            rx={7}
                            fill="#4F46E5"
                          />
                          <text
                            x={0}
                            y={0.5}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-white font-semibold"
                            style={{ fontSize: 8, letterSpacing: '0.04em' }}
                          >
                            STUDIO
                          </text>
                        </g>
                      ) : null}

                      {/* Crisp Student Label Underneath */}
                      <g transform="translate(0, 29.5)" className="pointer-events-none">
                        <rect
                          x={-38}
                          y={-7.5}
                          width={76}
                          height={15}
                          rx={7.5}
                          fill={
                            isSelected || isHovered
                              ? '#0F172A'
                              : 'rgba(255, 255, 255, 0.88)'
                          }
                          stroke={
                            isSelected || isHovered
                              ? '#0F172A'
                              : 'rgba(15, 23, 42, 0.08)'
                          }
                          strokeWidth={0.9}
                        />
                        <text
                          x={0}
                          y={0.4}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className={
                            isSelected || isHovered
                              ? 'fill-white font-semibold'
                              : 'fill-slate-800 font-medium'
                          }
                          style={{ fontSize: 9.2 }}
                        >
                          {student.displayName.length > 12
                            ? `${student.displayName.slice(0, 11)}…`
                            : student.displayName}
                        </text>
                      </g>

                      {/* Optional Betweenness Pill when Bridge Hubs Spotlight is Active */}
                      {spotlightBridges && isBridge && centrality ? (
                        <g transform="translate(0, 45)" className="pointer-events-none">
                          <rect
                            x={-28}
                            y={-6.5}
                            width={56}
                            height={13}
                            rx={6.5}
                            fill="#FFFBEB"
                            stroke="#F59E0B"
                            strokeWidth={0.9}
                          />
                          <text
                            x={0}
                            y={0.4}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-amber-800 font-mono-tabular font-semibold"
                            style={{ fontSize: 8.2 }}
                          >
                            BC {centrality.betweenness.toFixed(2)}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  </g>
                );
              })}
            </g>

            {/* 6. Top-Layer Louvain Cluster Pill Badges (Never occluded by nodes) */}
            <g>
              {communityHulls.map(({ community, labelPos, pillWidth }) => {
                const halfW = pillWidth / 2;
                const isHoveredComm = hoveredCommunityIndex === community.index;
                const isDimmed =
                  (hoveredCommunityIndex !== null && !isHoveredComm) ||
                  hoveredTeam !== null;
                return (
                  <g
                    key={`pill-${community.code}`}
                    transform={`translate(${labelPos.x.toFixed(1)}, ${labelPos.y.toFixed(1)})`}
                    filter={`url(#${svgUid}-pill-shadow)`}
                    style={{
                      opacity: isDimmed ? 0.45 : 1,
                      transition: 'opacity 200ms ease',
                    }}
                    onMouseEnter={() => setHoveredCommunityIndex(community.index)}
                    onMouseLeave={() => setHoveredCommunityIndex(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={-halfW}
                      y={-11.5}
                      width={pillWidth}
                      height={23}
                      rx={11.5}
                      fill="rgba(255, 255, 255, 0.96)"
                      stroke={community.borderRgba}
                      strokeWidth={1.1}
                    />
                    <circle cx={-halfW + 13} cy={0} r={3.8} fill={community.color} />
                    <text
                      x={-halfW + 22}
                      y={0.5}
                      dominantBaseline="central"
                      className="fill-slate-800 font-semibold"
                      style={{ fontSize: 10.2, letterSpacing: '-0.01em' }}
                    >
                      {community.fullLabel}
                    </text>
                    <text
                      x={halfW - 11}
                      y={0.5}
                      textAnchor="end"
                      dominantBaseline="central"
                      className="fill-slate-400 font-mono-tabular"
                      style={{ fontSize: 9.5 }}
                    >
                      {community.members.length}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {/* Bottom-Left Floating Camera Controls */}
        <div className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-1 rounded-2xl border border-slate-900/[0.08] bg-white/92 p-1 text-xs text-slate-700 shadow-sm backdrop-blur-md">
          <button
            type="button"
            onClick={() => zoomByFactor(1 / 1.22)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[44px] text-center font-mono-tabular text-[11px] font-medium text-slate-600">
            {Math.round(camera.k * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomByFactor(1.22)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-4 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => focusStudentCamera(activeStudentId)}
            className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Center viewport on active profile"
          >
            <Compass className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Focus You</span>
          </button>
          <button
            type="button"
            onClick={resetCamera}
            className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Reset zoom and pan"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset View</span>
          </button>
          <span className="mx-0.5 hidden h-4 w-px bg-slate-200 xl:inline-block" />
          <button
            type="button"
            onClick={onToggleExpandStage}
            className="hidden items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 xl:inline-flex"
            title={isExpandedStage ? 'Return to split view' : 'Expand full-width theater stage'}
          >
            {isExpandedStage ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Split View</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Full Stage</span>
              </>
            )}
          </button>
        </div>

        {/* Floating Node Inspector Card */}
        <AnimatePresence>
          {selectedStudent ? (
            <motion.aside
              key={selectedStudent.id}
              initial={{ opacity: 0, x: 18, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 14, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="editorial-card absolute right-3 bottom-3 z-20 max-h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl bg-white/96 p-4 shadow-xl backdrop-blur-md sm:top-16 sm:right-4 sm:bottom-auto sm:max-h-[calc(100%-5rem)] sm:w-[336px]"
              aria-label={`Node Inspector for ${selectedStudent.displayName}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <LottieAvatar
                    mbti={selectedStudent.mbti}
                    playMode="always"
                    size={56}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold text-slate-900">
                        {selectedStudent.displayName}
                      </h3>
                      {selectedStudent.id === activeStudentId ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                          You
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span
                        className="rounded-md px-1.5 py-0.5 font-mono-tabular text-[11px] font-semibold"
                        style={{
                          backgroundColor: MBTI_GROUPS[selectedStudent.group].softBg,
                          color: MBTI_GROUPS[selectedStudent.group].color,
                        }}
                      >
                        {selectedStudent.fullType}
                      </span>
                      <span className="text-slate-500">
                        {MBTI_TYPES[selectedStudent.mbti].title}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {selectedCommunity ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: selectedCommunity.fillRgba,
                            color: selectedCommunity.color,
                            border: `1px solid ${selectedCommunity.borderRgba}`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: selectedCommunity.color }}
                          />
                          {selectedCommunity.fullLabel}
                        </span>
                      ) : null}
                      {selectedCentrality?.isBridgeHub ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          <Crown className="h-2.5 w-2.5 text-amber-600" />
                          Bridge Hub
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectNode(null)}
                  className="rounded-xl p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close node inspector"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Compatibility with Active User + Compact Psychometric Radar */}
              <div className="mt-3.5 rounded-2xl border border-slate-900/[0.06] bg-slate-50/80 p-3">
                {selectedPairBreakdown && activeStudent ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Compatibility with {activeStudent.displayName}
                        </div>
                        <div className="mt-0.5 flex items-baseline gap-2">
                          <span className="font-mono-tabular text-xl font-bold text-slate-900">
                            {(selectedPairBreakdown.compatibility * 100).toFixed(1)}%
                          </span>
                          <span className="font-mono-tabular text-[11px] text-slate-500">
                            Sim {Math.round(selectedPairBreakdown.similarity * 100)}% · Opp{' '}
                            {Math.round(selectedPairBreakdown.contrast * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {selectedPairBreakdown.isOptimalEdmondsPair ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-600/20">
                            <Sparkles className="h-2.5 w-2.5" />
                            Edmonds Pair
                          </span>
                        ) : null}
                        {selectedPairBreakdown.is4NNEdge ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                            Direct 4-NN Edge
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2 flex justify-center">
                      <TraitRadarSvg
                        compact
                        size={138}
                        showLegend
                        series={[
                          {
                            id: activeStudent.id,
                            label: `You (${activeStudent.mbti})`,
                            traits: activeStudent.traits,
                            color: '#10B981',
                            fillOpacity: 0.14,
                          },
                          {
                            id: selectedStudent.id,
                            label: `${selectedStudent.displayName} (${selectedStudent.mbti})`,
                            traits: selectedStudent.traits,
                            color: MBTI_GROUPS[selectedStudent.group].color,
                            fillOpacity: 0.16,
                          },
                        ]}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold tracking-wider text-emerald-700 uppercase">
                        Active Perspective (You)
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Overlaying your 5D profile with your theoretical complement{' '}
                        <span className="font-mono-tabular font-medium text-slate-800">x*</span>.
                      </p>
                    </div>
                    <TraitRadarSvg
                      compact
                      size={112}
                      showLegend={false}
                      series={[
                        {
                          id: 'self',
                          label: 'You',
                          traits: selectedStudent.traits,
                          color: '#10B981',
                          fillOpacity: 0.18,
                        },
                        {
                          id: 'ideal',
                          label: 'Ideal x*',
                          traits: selectedStudent.idealPartner,
                          color: '#4F46E5',
                          dashed: true,
                        },
                      ]}
                    />
                  </div>
                )}
              </div>

              {/* 5 Centrality Metrics strictly from activeGraph.centralities */}
              {selectedCentrality ? (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    <span>Graph Centralities ({activeGraph.settingLabel})</span>
                    <span className="font-mono-tabular text-slate-500">
                      Comp #{selectedCentrality.component + 1}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="rounded-xl border border-slate-900/[0.06] bg-white px-2.5 py-1.5">
                      <div className="text-[10px] text-slate-400">Degree</div>
                      <div className="font-mono-tabular font-semibold text-slate-900">
                        {selectedCentrality.degree}{' '}
                        <span className="text-[10px] font-normal text-slate-400">
                          ({(selectedCentrality.degreeCentrality * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-900/[0.06] bg-white px-2.5 py-1.5">
                      <div className="text-[10px] text-slate-400">Strength (Σw)</div>
                      <div className="font-mono-tabular font-semibold text-slate-900">
                        {selectedCentrality.strength.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-900/[0.06] bg-white px-2.5 py-1.5">
                      <div className="text-[10px] text-slate-400">Betweenness</div>
                      <div className="font-mono-tabular font-semibold text-slate-900">
                        {selectedCentrality.betweenness.toFixed(3)}{' '}
                        <span className="text-[10px] font-normal text-slate-400">
                          w:{selectedCentrality.betweennessWeighted.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-900/[0.06] bg-white px-2.5 py-1.5">
                      <div className="text-[10px] text-slate-400">Closeness</div>
                      <div className="font-mono-tabular font-semibold text-slate-900">
                        {selectedCentrality.closeness.toFixed(3)}
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-900/[0.06] bg-white px-2.5 py-1.5">
                      <span className="text-[10px] text-slate-400">Eigenvector Influence</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-slate-800"
                            style={{
                              width: `${clamp(selectedCentrality.eigenvector * 100, 4, 100).toFixed(0)}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono-tabular font-semibold text-slate-900">
                          {selectedCentrality.eigenvector.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={selectedStudent.id === activeStudentId}
                  onClick={() => onInspectOrSelectStudent(selectedStudent.id)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                    selectedStudent.id === activeStudentId
                      ? 'cursor-default border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>
                    {selectedStudent.id === activeStudentId
                      ? 'Active Profile'
                      : 'Set as Active Profile'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onLoadTeamIntoStudio(
                      selectedStudent.id === activeStudentId
                        ? [activeStudentId]
                        : [activeStudentId, selectedStudent.id],
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {selectedStudent.id === activeStudentId
                      ? 'Open in Studio'
                      : 'Open Duo in Studio'}
                  </span>
                  <ArrowUpRight className="h-3 w-3 opacity-75" />
                </button>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
