"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { platformColor, useChartTheme } from "@/components/charts/theme";
import type { NetworkGraph, NetworkNode } from "@/lib/api";

/**
 * The influence graph.
 *
 * The previous layout was a velocity integrator driven by a Fruchterman–Reingold
 * *force* (`k²/d`) with no limit on the resulting displacement. With k ≈ 56 and
 * 120 nodes, each node accumulated forces in the thousands per tick, overshot
 * the canvas, and was caught by the position clamp — so the whole graph ended up
 * pinned to the four corners and the edges. 120 nodes rendered as about 8 visible
 * blobs, and every edge was a long diagonal between corners.
 *
 * This is Fruchterman–Reingold as actually specified: forces accumulate into a
 * displacement vector, and the displacement is then **capped by a temperature**
 * that cools over the run. That cap is the part that was missing, and it is what
 * makes the algorithm converge instead of explode.
 *
 * One addition beyond textbook FR: a weak cohesion pull toward each node's
 * community centroid. Without it, detected communities are a colour legend and
 * nothing more — the reader has to find the clusters by eye. With it, the
 * partition the backend computed is the shape you actually see.
 */

export type ColorBy = "community" | "platform" | "sentiment";

/**
 * Community colours are fixed rather than theme-derived.
 *
 * A community's colour is its identity across the graph, the legend, the
 * influencer table and the bridge list; deriving it from the active theme would
 * make the same community change colour when someone flips the toggle, which
 * breaks the one thing the colour is for. These hold up on both backgrounds.
 */
const COMMUNITY_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#14B8A6",
  "#F59E0B",
  "#EC4899",
  "#0EA5E9",
  "#22C55E",
  "#A855F7",
];

export function communityColor(id: number) {
  return COMMUNITY_COLORS[id % COMMUNITY_COLORS.length];
}

const NODE_SENTIMENT: Record<string, string> = {
  positive: "#22C55E",
  neutral: "#94A3B8",
  negative: "#F43F5E",
};

export function sentimentFill(sentiment: string) {
  return NODE_SENTIMENT[sentiment] ?? NODE_SENTIMENT.neutral;
}

interface Sim extends NetworkNode {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Set while the user is dragging this node, which pins it. */
  fixed?: boolean;
}

const W = 900;
const H = 580;
const MARGIN = 26;

// ── Layout ────────────────────────────────────────────────────────────────────

function seed(nodes: NetworkNode[]): Sim[] {
  // Deterministic placement: an unseeded layout settles somewhere new on every
  // render, so the same graph never looks the same twice and a reader cannot
  // tell a layout change from a data change.
  const rand = (i: number) => ((i * 2654435761) >>> 0) / 0xffffffff;

  return nodes.map((node, i) => {
    // Seeded on a spiral rather than uniformly at random. A random cloud starts
    // with pairs at near-zero distance, where the repulsion term diverges and
    // the first few ticks are spent recovering from it.
    const a = i * 2.39996;
    const r = Math.sqrt(i / Math.max(nodes.length, 1)) * Math.min(W, H) * 0.42;
    return {
      ...node,
      x: W / 2 + Math.cos(a) * r + (rand(i) - 0.5) * 8,
      y: H / 2 + Math.sin(a) * r + (rand(i * 7) - 0.5) * 8,
      dx: 0,
      dy: 0,
    };
  });
}

function step(
  nodes: Sim[],
  edges: { source: string; target: string; weight: number }[],
  index: Record<string, number>,
  k: number,
  temp: number
): void {
  for (const n of nodes) {
    n.dx = 0;
    n.dy = 0;
  }

  // Repulsion — every pair inside the cutoff.
  //
  // The cutoff is what keeps weakly-connected nodes on the canvas. Summed over
  // 119 neighbours, an unbounded `k²/d` reaches ~1300 at the rim while centre
  // gravity is worth ~2, so anything not held by an edge is pushed into the
  // boundary clamp and parks there in a straight line along the margin. Beyond
  // ~3k a node is already well separated and the term is only doing that
  // damage, so it is dropped — the same thing Barnes–Hut approximations do to
  // distant cells, here for legibility rather than speed.
  const cutoff2 = (k * 3.2) * (k * 3.2);

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      let dx = nodes[i].x - nodes[j].x;
      let dy = nodes[i].y - nodes[j].y;
      let d2 = dx * dx + dy * dy;
      if (d2 > cutoff2) continue;
      if (d2 < 0.01) {
        // Coincident nodes have no defined direction to separate along; nudge
        // them apart deterministically instead of dividing by zero.
        dx = (i % 7) - 3 || 1;
        dy = (j % 5) - 2 || 1;
        d2 = dx * dx + dy * dy;
      }
      const d = Math.sqrt(d2);
      const f = (k * k) / d;
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      nodes[i].dx += ux;
      nodes[i].dy += uy;
      nodes[j].dx -= ux;
      nodes[j].dy -= uy;
    }
  }

  // Attraction — along edges only.
  for (const e of edges) {
    const si = index[e.source];
    const ti = index[e.target];
    if (si == null || ti == null) continue;
    const dx = nodes[si].x - nodes[ti].x;
    const dy = nodes[si].y - nodes[ti].y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    // log1p on weight: a 40-interaction edge is stronger than a 4-interaction
    // one, but not ten times stronger, and linear weighting collapses heavy
    // pairs on top of each other.
    const f = ((d * d) / k) * Math.log1p(e.weight) * 0.55;
    const ux = (dx / d) * f;
    const uy = (dy / d) * f;
    nodes[si].dx -= ux;
    nodes[si].dy -= uy;
    nodes[ti].dx += ux;
    nodes[ti].dy += uy;
  }

  // Community cohesion + centre gravity.
  const cent: Record<number, { x: number; y: number; n: number }> = {};
  for (const n of nodes) {
    const c = (cent[n.community_id] ??= { x: 0, y: 0, n: 0 });
    c.x += n.x;
    c.y += n.y;
    c.n += 1;
  }
  for (const n of nodes) {
    const c = cent[n.community_id];
    if (c && c.n > 1) {
      n.dx += (c.x / c.n - n.x) * 0.22;
      n.dy += (c.y / c.n - n.y) * 0.22;
    }
    // Gravity strong enough to actually recover an outlier now that repulsion
    // no longer reaches across the canvas to fight it.
    n.dx += (W / 2 - n.x) * 0.05;
    n.dy += (H / 2 - n.y) * 0.05;
  }

  // Apply, limited by temperature. This is the step whose absence made the
  // previous layout diverge.
  for (const n of nodes) {
    if (n.fixed) continue;
    const disp = Math.sqrt(n.dx * n.dx + n.dy * n.dy) || 0.01;
    const scale = Math.min(disp, temp) / disp;
    n.x = Math.max(MARGIN, Math.min(W - MARGIN, n.x + n.dx * scale));
    n.y = Math.max(MARGIN, Math.min(H - MARGIN, n.y + n.dy * scale));
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ForceGraph({
  graph,
  colorBy,
  highlight,
  onSelect,
  className,
}: {
  graph: NetworkGraph;
  colorBy: ColorBy;
  highlight?: string | null;
  onSelect?: (node: NetworkNode | null) => void;
  className?: string;
}) {
  const theme = useChartTheme();
  const [nodes, setNodes] = React.useState<Sim[]>([]);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [view, setView] = React.useState({ k: 1, x: 0, y: 0 });
  const [settled, setSettled] = React.useState(false);

  const live = React.useRef<Sim[]>([]);
  const frame = React.useRef(0);
  const dragNode = React.useRef<string | null>(null);
  const panFrom = React.useRef<{ x: number; y: number } | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const index = React.useMemo(() => {
    const m: Record<string, number> = {};
    graph.nodes.forEach((n, i) => (m[n.id] = i));
    return m;
  }, [graph.nodes]);

  React.useEffect(() => {
    const sim = seed(graph.nodes);
    live.current = sim;
    setNodes([...sim]);
    setSettled(false);

    const k = Math.sqrt((W * H) / Math.max(graph.nodes.length, 1)) * 0.72;
    let temp = W / 8;
    let i = 0;

    function run() {
      // A few iterations per frame: the layout reaches a readable state in well
      // under a second without blocking the main thread for the whole run.
      for (let s = 0; s < 3 && i < 220; s++, i++) {
        step(live.current, graph.edges, index, k, temp);
        temp = Math.max(temp * 0.965, 0.6);
      }
      setNodes([...live.current]);
      if (i < 220) {
        frame.current = requestAnimationFrame(run);
      } else {
        setSettled(true);
      }
    }

    frame.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame.current);
  }, [graph, index]);

  const byId = React.useMemo(() => {
    const m: Record<string, Sim> = {};
    nodes.forEach((n) => (m[n.id] = n));
    return m;
  }, [nodes]);

  const focus = pinned ?? hovered ?? highlight ?? null;

  /** The focused node plus everything one hop away. */
  const ego = React.useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const e of graph.edges) {
      if (e.source === focus) set.add(e.target);
      if (e.target === focus) set.add(e.source);
    }
    return set;
  }, [focus, graph.edges]);

  const maxRank = React.useMemo(
    () => Math.max(0.0001, ...graph.nodes.map((n) => n.pagerank)),
    [graph.nodes]
  );

  /** Labelled: the most central handful, plus whatever is focused. */
  const labelled = React.useMemo(() => {
    const top = [...graph.nodes]
      .sort((a, b) => b.pagerank - a.pagerank)
      .slice(0, 6)
      .map((n) => n.id);
    return new Set(focus ? [...top, focus] : top);
  }, [graph.nodes, focus]);

  const colorOf = React.useCallback(
    (n: NetworkNode) => {
      if (colorBy === "platform") return platformColor(n.platform);
      if (colorBy === "sentiment") return sentimentFill(n.dominant_sentiment);
      return communityColor(n.community_id);
    },
    [colorBy]
  );

  const radiusOf = React.useCallback(
    (n: NetworkNode) => 3.5 + Math.sqrt(n.pagerank / maxRank) * 11,
    [maxRank]
  );

  // ── Interaction ─────────────────────────────────────────────────────────────

  function toLocal(e: React.PointerEvent | React.WheelEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragNode.current) {
      const p = toLocal(e);
      const n = live.current.find((c) => c.id === dragNode.current);
      if (n) {
        n.x = Math.max(MARGIN, Math.min(W - MARGIN, p.x));
        n.y = Math.max(MARGIN, Math.min(H - MARGIN, p.y));
        n.fixed = true;
        setNodes([...live.current]);
      }
      return;
    }
    if (panFrom.current) {
      const dx = e.clientX - panFrom.current.x;
      const dy = e.clientY - panFrom.current.y;
      panFrom.current = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }

  function onWheel(e: React.WheelEvent) {
    const p = toLocal(e);
    const next = Math.max(0.45, Math.min(4, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    // Anchor the zoom on the pointer, so the thing under the cursor stays put.
    setView({
      k: next,
      x: view.x + (p.x * view.k - p.x * next),
      y: view.y + (p.y * view.k - p.y * next),
    });
  }

  const focusNode = focus ? byId[focus] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl bg-surface-2 touch-none"
        style={{ maxHeight: H, cursor: panFrom.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            panFrom.current = { x: e.clientX, y: e.clientY };
            setPinned(null);
            onSelect?.(null);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragNode.current = null;
          panFrom.current = null;
        }}
        onPointerLeave={() => {
          dragNode.current = null;
          panFrom.current = null;
          setHovered(null);
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* Edges first, so nodes sit on top of them. */}
          <g>
            {graph.edges.map((e, i) => {
              const s = byId[e.source];
              const t = byId[e.target];
              if (!s || !t) return null;
              const inFocus = !ego || (ego.has(e.source) && ego.has(e.target));
              // Dimming everything outside the focused node's neighbourhood is
              // what makes a 120-node graph readable: the question is almost
              // always "who is this one connected to", not "what is the overall
              // shape".
              if (ego && !inFocus && view.k < 1.5) {
                return (
                  <line
                    key={i}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={theme.grid}
                    strokeWidth={0.5}
                    opacity={0.35}
                  />
                );
              }
              // A slight arc separates the two directions of a reciprocal pair,
              // which a straight line draws on top of itself.
              const mx = (s.x + t.x) / 2;
              const my = (s.y + t.y) / 2;
              const nx = -(t.y - s.y) * 0.08;
              const ny = (t.x - s.x) * 0.08;
              return (
                <path
                  key={i}
                  d={`M${s.x},${s.y} Q${mx + nx},${my + ny} ${t.x},${t.y}`}
                  fill="none"
                  stroke={inFocus && ego ? theme.brand : theme.axis.fill}
                  strokeWidth={Math.min(0.5 + Math.log1p(e.weight) * 0.5, 2.4)}
                  opacity={ego ? 0.7 : 0.28}
                />
              );
            })}
          </g>

          <g>
            {nodes.map((n) => {
              const r = radiusOf(n);
              const dim = ego ? !ego.has(n.id) : false;
              const isFocus = n.id === focus;
              const color = colorOf(n);

              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={dim ? 0.2 : 1}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    dragNode.current = n.id;
                  }}
                  onPointerEnter={() => !dragNode.current && setHovered(n.id)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = pinned === n.id ? null : n.id;
                    setPinned(next);
                    onSelect?.(next ? n : null);
                  }}
                >
                  {isFocus && (
                    <circle r={r + 7} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />
                  )}
                  {/* Bridges get a dashed ring: they are the actors whose removal
                      would split the graph, which size alone does not convey. */}
                  {n.is_bridge && (
                    <circle
                      r={r + 3.5}
                      fill="none"
                      stroke={theme.emotion.excitement}
                      strokeWidth={1.4}
                      strokeDasharray="3 2.5"
                    />
                  )}
                  <circle r={r} fill={color} stroke={theme.mode === "dark" ? "#0D1117" : "#fff"} strokeWidth={1.2} />
                  {labelled.has(n.id) && !dim && (
                    <text
                      y={-r - 6}
                      textAnchor="middle"
                      fontSize={9.5}
                      fill={theme.axis.fill}
                      style={{ pointerEvents: "none", fontWeight: 600 }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Zoom / reset */}
      <div className="absolute top-2.5 right-2.5 flex flex-col gap-1">
        {[
          { label: "+", act: () => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.25) })) },
          { label: "−", act: () => setView((v) => ({ ...v, k: Math.max(0.45, v.k / 1.25) })) },
          { label: "⌂", act: () => setView({ k: 1, x: 0, y: 0 }) },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.act}
            className="w-6 h-6 rounded-md bg-surface border border-bdr text-ink-2 hover:text-ink text-xs leading-none flex items-center justify-center transition-colors"
          >
            {b.label}
          </button>
        ))}
      </div>

      {!settled && (
        <div className="absolute bottom-2.5 left-3 text-[10px] text-ink-3 animate-fade-in">
          settling layout…
        </div>
      )}

      {focusNode && (
        <div className="absolute bottom-2.5 right-2.5 bg-surface border border-bdr-strong rounded-xl px-3 py-2 shadow-pop max-w-[15rem] animate-fade-in">
          <p className="text-[11px] font-bold text-ink truncate">{focusNode.label}</p>
          <div className="mt-1 space-y-0.5 text-[10px] text-ink-3 tabular-nums">
            <p>
              <span className="text-ink-2 font-semibold">{focusNode.post_count}</span> posts ·{" "}
              <span className="text-ink-2 font-semibold">{focusNode.topic_count}</span> topics
            </p>
            <p>
              PageRank{" "}
              <span className="text-ink-2 font-semibold">{focusNode.pagerank.toFixed(4)}</span>
              {focusNode.is_bridge && (
                <span className="text-warn font-semibold"> · bridge</span>
              )}
            </p>
            <p className="capitalize">
              {focusNode.platform} · {focusNode.dominant_sentiment}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
