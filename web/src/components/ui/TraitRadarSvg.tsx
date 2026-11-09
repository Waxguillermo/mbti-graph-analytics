import type { TraitKey, TraitVector } from '../../engine/types';

export interface RadarSeries {
  id: string;
  label: string;
  traits: TraitVector;
  color: string;
  dashed?: boolean;
  fillOpacity?: number;
}

export interface TraitRadarSvgProps {
  series: RadarSeries[];
  size?: number;
  showLegend?: boolean;
  compact?: boolean;
}

const AXES: Array<{ key: TraitKey; short: string; full: string }> = [
  { key: 'E', short: 'E', full: 'Energy (E)' },
  { key: 'N', short: 'N', full: 'Mind (N)' },
  { key: 'T', short: 'T', full: 'Nature (T)' },
  { key: 'J', short: 'J', full: 'Tactics (J)' },
  { key: 'A', short: 'A', full: 'Identity (A)' },
];

export function TraitRadarSvg({
  series,
  size = 240,
  showLegend = true,
  compact = false,
}: TraitRadarSvgProps) {
  const cx = size / 2;
  const cy = size / 2;
  const pad = compact ? 28 : 42;
  const radius = Math.max(24, size / 2 - pad);
  const rings = [0.25, 0.5, 0.75, 1.0];

  const pointFor = (axisIdx: number, value: number) => {
    const angle = -Math.PI / 2 + (axisIdx * 2 * Math.PI) / AXES.length;
    const r = Math.max(0, Math.min(1, value)) * radius;
    return {
      x: Number((cx + r * Math.cos(angle)).toFixed(2)),
      y: Number((cy + r * Math.sin(angle)).toFixed(2)),
    };
  };

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible select-none"
        role="img"
        aria-label="5-Trait Psychometric Radar"
      >
        {/* Concentric reference pentagons */}
        {rings.map((ring) => {
          const pts = AXES.map((_, idx) => {
            const p = pointFor(idx, ring);
            return `${p.x},${p.y}`;
          }).join(' ');
          return (
            <polygon
              key={ring}
              points={pts}
              fill={ring === 1 ? 'rgba(248, 250, 252, 0.65)' : 'none'}
              stroke={ring === 0.5 ? 'rgba(100, 116, 139, 0.28)' : 'rgba(148, 163, 184, 0.22)'}
              strokeDasharray={ring === 0.5 ? '3 3' : undefined}
              strokeWidth={1}
            />
          );
        })}

        {/* Radial spokes & labels */}
        {AXES.map((axis, idx) => {
          const outer = pointFor(idx, 1);
          const labelPt = pointFor(idx, compact ? 1.24 : 1.22);
          return (
            <g key={axis.key}>
              <line
                x1={cx}
                y1={cy}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(148, 163, 184, 0.28)"
                strokeWidth={1}
              />
              <text
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-600 font-medium"
                style={{ fontSize: compact ? 10 : 11 }}
              >
                {compact ? axis.short : axis.full}
              </text>
            </g>
          );
        })}

        {/* Data polygons */}
        {series.map((s) => {
          const coords = AXES.map((axis, idx) => pointFor(idx, s.traits[axis.key]));
          const polyPoints = coords.map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <g key={s.id}>
              <polygon
                points={polyPoints}
                fill={s.dashed ? 'none' : s.color}
                fillOpacity={s.dashed ? 0 : (s.fillOpacity ?? 0.14)}
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? '4 3' : undefined}
                strokeLinejoin="round"
              />
              {!s.dashed
                ? coords.map((p, idx) => (
                    <circle
                      key={AXES[idx].key}
                      cx={p.x}
                      cy={p.y}
                      r={compact ? 2.5 : 3.2}
                      fill="#FFFFFF"
                      stroke={s.color}
                      strokeWidth={1.75}
                    />
                  ))
                : null}
            </g>
          );
        })}
      </svg>

      {showLegend && series.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-[11px] text-slate-600">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: s.dashed ? 'transparent' : s.color,
                  border: s.dashed ? `1.5px dashed ${s.color}` : 'none',
                }}
              />
              <span className="truncate max-w-[130px] font-medium">{s.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
