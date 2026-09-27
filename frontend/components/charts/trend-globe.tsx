"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useChartTheme } from "@/components/charts/theme";

/**
 * Trends as points on a rotating sphere.
 *
 * Why a sphere and not a bar chart: a ranked list answers "which is biggest",
 * which the list beside it already answers better. The globe answers a different
 * question — *how is the conversation distributed* — and a sphere is the only
 * surface where every point is equidistant from the centre, so no topic gets the
 * visual privilege that the left edge of a bar chart hands to whatever sorts
 * first. Rotation is what makes the far side reachable; it is not decoration, and
 * it stops on hover and under `prefers-reduced-motion`.
 *
 * Three encodings, no more:
 *   position — an even Fibonacci distribution, stable per trend across renders
 *   radius   — trend score
 *   colour   — velocity, on a cooling → steady → surging scale
 *
 * Drawn as hand-rolled SVG rather than three.js: this is a few hundred projected
 * points and two dozen wireframe polylines, which is cheaper as SVG than the
 * ~600 KB a WebGL renderer would add to a dashboard bundle.
 */

export type GlobeTrend = {
  id: number;
  name: string;
  score: number;
  velocity: number;
  isEmerging?: boolean;
  posts?: number;
};

type Projected = {
  trend: GlobeTrend;
  x: number;
  y: number;
  /** +1 = facing the viewer, -1 = on the far side. Drives depth cues. */
  z: number;
  r: number;
  color: string;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Even point distribution on a unit sphere — no clustering at the poles. */
function fibonacciPoint(i: number, n: number): [number, number, number] {
  const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * i;
  return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
}

function rotate(
  [x, y, z]: [number, number, number],
  yaw: number,
  tilt: number
): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;

  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const y2 = y * ct - z1 * st;
  const z2 = y * st + z1 * ct;

  return [x1, y2, z2];
}

export function TrendGlobe({
  trends,
  selectedId,
  onSelect,
  size = 340,
  className,
}: {
  trends: GlobeTrend[];
  selectedId?: number | null;
  onSelect?: (trend: GlobeTrend) => void;
  size?: number;
  className?: string;
}) {
  const theme = useChartTheme();
  const [yaw, setYaw] = React.useState(0.4);
  const [tilt, setTilt] = React.useState(-0.32);
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const drag = React.useRef<{ x: number; y: number } | null>(null);
  const frame = React.useRef(0);

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Idle rotation. Paused while a point is hovered or the globe is being
  // dragged, so reading a label never becomes a moving target.
  const spinning = !reduced && hovered === null && !dragging;

  React.useEffect(() => {
    if (!spinning) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setYaw((a) => a + dt * 0.00018);
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [spinning]);

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.37;

  const maxScore = React.useMemo(
    () => Math.max(0.0001, ...trends.map((t) => t.score)),
    [trends]
  );

  /** Cooling → steady → surging. Velocity is the globe's whole point. */
  const velocityColor = React.useCallback(
    (v: number) => {
      if (v > 0.25) return theme.emotion.excitement;
      if (v > 0.05) return theme.accent;
      if (v < -0.05) return theme.sentiment.neutral;
      return theme.brand;
    },
    [theme]
  );

  const points: Projected[] = React.useMemo(() => {
    const n = trends.length;
    return trends
      .map((trend, i) => {
        const [x, y, z] = rotate(fibonacciPoint(i, n), yaw, tilt);
        const norm = trend.score / maxScore;
        return {
          trend,
          x: cx + x * R,
          y: cy - y * R,
          z,
          r: 3 + Math.sqrt(norm) * 7,
          color: velocityColor(trend.velocity),
        };
      })
      // Painter's algorithm: far side first, so near points draw over them.
      .sort((a, b) => a.z - b.z);
  }, [trends, yaw, tilt, cx, cy, R, maxScore, velocityColor]);

  // Wireframe. Parallels and meridians are sampled densely enough that the
  // polyline reads as a curve rather than a polygon.
  const wires = React.useMemo(() => {
    const paths: { d: string; back: boolean }[] = [];
    const seg = 64;

    for (let k = 1; k < 6; k++) {
      const lat = (k / 6) * Math.PI - Math.PI / 2;
      const ring: string[] = [];
      let back = false;
      for (let s = 0; s <= seg; s++) {
        const lon = (s / seg) * Math.PI * 2;
        const p: [number, number, number] = [
          Math.cos(lat) * Math.cos(lon),
          Math.sin(lat),
          Math.cos(lat) * Math.sin(lon),
        ];
        const [x, y, z] = rotate(p, yaw, tilt);
        if (s === Math.floor(seg / 2)) back = z < 0;
        ring.push(`${s === 0 ? "M" : "L"}${(cx + x * R).toFixed(1)},${(cy - y * R).toFixed(1)}`);
      }
      paths.push({ d: ring.join(" "), back });
    }

    for (let k = 0; k < 6; k++) {
      const lon = (k / 6) * Math.PI;
      const arc: string[] = [];
      for (let s = 0; s <= seg; s++) {
        const lat = (s / seg) * Math.PI * 2;
        const p: [number, number, number] = [
          Math.cos(lat) * Math.cos(lon),
          Math.sin(lat),
          Math.cos(lat) * Math.sin(lon),
        ];
        const [x, y] = rotate(p, yaw, tilt);
        arc.push(`${s === 0 ? "M" : "L"}${(cx + x * R).toFixed(1)},${(cy - y * R).toFixed(1)}`);
      }
      paths.push({ d: arc.join(" "), back: false });
    }

    return paths;
  }, [yaw, tilt, cx, cy, R]);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setYaw((a) => a + dx * 0.007);
    // Clamped so the globe cannot be tipped past its poles into an unreadable
    // orientation the user then has to fight back out of.
    setTilt((a) => Math.max(-1.1, Math.min(1.1, a + dy * 0.006)));
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  const active = points.find((p) => p.trend.id === (hovered ?? selectedId));
  const glowId = React.useId();
  const coreId = React.useId();

  return (
    <div className={cn("relative select-none", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={dragging ? "cursor-grabbing" : "cursor-grab"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          endDrag();
          setHovered(null);
        }}
        role="img"
        aria-label={`Trend sphere showing ${trends.length} topics, sized by score and coloured by velocity`}
      >
        <defs>
          <radialGradient id={coreId} cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor={theme.brand} stopOpacity={0.16} />
            <stop offset="62%" stopColor={theme.brand} stopOpacity={0.05} />
            <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
          </radialGradient>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={R} fill={`url(#${coreId})`} />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={theme.grid} strokeWidth={1} />

        {wires.map((w, i) => (
          <path
            key={i}
            d={w.d}
            fill="none"
            stroke={theme.grid}
            strokeWidth={0.7}
            opacity={0.85}
          />
        ))}

        {points.map((p) => {
          const front = p.z > 0;
          const isActive = p.trend.id === hovered || p.trend.id === selectedId;
          // Depth cue: far-side points recede rather than disappearing, so the
          // sphere reads as a volume instead of a flat disc of dots.
          const depth = 0.25 + ((p.z + 1) / 2) * 0.75;
          return (
            <g key={p.trend.id}>
              {(p.trend.isEmerging || isActive) && front && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r + (isActive ? 7 : 4)}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={1.2}
                  opacity={isActive ? 0.85 : 0.4}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? p.r * 1.35 : p.r}
                fill={p.color}
                opacity={isActive ? 1 : depth * (front ? 1 : 0.55)}
                filter={isActive || (front && p.r > 7) ? `url(#${glowId})` : undefined}
                style={{ cursor: "pointer", transition: "r 140ms ease" }}
                onPointerEnter={() => !dragging && setHovered(p.trend.id)}
                onPointerLeave={() => setHovered(null)}
                onClick={() => onSelect?.(p.trend)}
              />
            </g>
          );
        })}
      </svg>

      {active && (
        <div
          className="absolute pointer-events-none z-10 bg-surface border border-bdr-strong rounded-xl px-2.5 py-1.5 shadow-pop animate-fade-in max-w-[13rem]"
          style={{
            left: Math.min(Math.max(active.x + 12, 4), size - 150),
            top: Math.max(active.y - 34, 4),
          }}
        >
          <p className="text-[11px] font-semibold text-ink leading-tight truncate">
            {active.trend.name}
          </p>
          <p className="text-[10px] text-ink-3 tabular-nums mt-0.5">
            score {active.trend.score.toFixed(2)} ·{" "}
            <span style={{ color: active.color }}>
              {active.trend.velocity > 0 ? "+" : ""}
              {(active.trend.velocity * 100).toFixed(0)}%
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

/** Compact three-stop key. The globe carries no other chrome. */
export function GlobeLegend({ className }: { className?: string }) {
  const theme = useChartTheme();
  const stops = [
    { label: "Surging", color: theme.emotion.excitement },
    { label: "Rising", color: theme.accent },
    { label: "Steady", color: theme.brand },
    { label: "Cooling", color: theme.sentiment.neutral },
  ];

  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
      {stops.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: s.color }}
          />
          <span className="text-[10px] text-ink-3">{s.label}</span>
        </span>
      ))}
    </div>
  );
}
