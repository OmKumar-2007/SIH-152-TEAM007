"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  GitBranch,
  Info,
  Megaphone,
  MessagesSquare,
  RefreshCw,
  Share2,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { useCascades, useRecomputeDiffusion, useSpread } from "@/lib/queries";
import { cn, fmtNumber } from "@/lib/utils";
import type { Cascade, DiffusionResult, SpreadSummary } from "@/lib/api";
import {
  ChartTooltip,
  useChartTheme,
} from "@/components/charts/theme";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ChartSkeleton,
  EmptyState,
  EpistemicBadge,
  ErrorState,
  Segmented,
  Skeleton,
} from "@/components/ui";

const SHAPE_META: Record<
  string,
  {
    icon: React.ElementType;
    tone: "warn" | "accent" | "danger" | "neutral";
    color: string;
    label: string;
    hint: string;
  }
> = {
  broadcast: {
    icon: Megaphone,
    tone: "warn",
    color: "#F0A92C",
    label: "Broadcast",
    hint: "Wide and shallow — amplification, not discussion.",
  },
  conversation: {
    icon: MessagesSquare,
    tone: "accent",
    color: "#E08A1E",
    label: "Conversation",
    hint: "Deep and narrow — a sustained exchange between few.",
  },
  viral: {
    icon: Zap,
    tone: "danger",
    color: "#F0556B",
    label: "Viral",
    hint: "Deep and wide — spreading fast across many.",
  },
  mixed: {
    icon: Share2,
    tone: "neutral",
    color: "#4C9AFF",
    label: "Mixed",
    hint: "No dominant structure.",
  },
  isolated: {
    icon: Share2,
    tone: "neutral",
    color: "#46597A",
    label: "Isolated",
    hint: "Little onward spread.",
  },
};

const DEMO_CASCADES: Cascade[] = [
  { root_author: "demo-a", root_ts: new Date().toISOString(), size: 428, depth: 6, breadth: 94, unique_authors: 311, platforms: ["twitter", "reddit", "youtube"], cross_platform: true, duration_hours: 9.5, velocity_per_hour: 45.1, root_sentiment: "neutral", sentiment_drift: -0.08, shape: "viral", topic: "Digital public infrastructure" },
  { root_author: "demo-b", root_ts: new Date().toISOString(), size: 286, depth: 3, breadth: 127, unique_authors: 238, platforms: ["facebook", "instagram"], cross_platform: true, duration_hours: 14.2, velocity_per_hour: 20.1, root_sentiment: "positive", sentiment_drift: 0.06, shape: "broadcast", topic: "Education reform" },
  { root_author: "demo-c", root_ts: new Date().toISOString(), size: 174, depth: 8, breadth: 31, unique_authors: 96, platforms: ["reddit", "twitter"], cross_platform: true, duration_hours: 21.8, velocity_per_hour: 8.0, root_sentiment: "neutral", sentiment_drift: -0.03, shape: "conversation", topic: "Air quality measures" },
  { root_author: "demo-d", root_ts: new Date().toISOString(), size: 119, depth: 4, breadth: 42, unique_authors: 88, platforms: ["youtube"], cross_platform: false, duration_hours: 11.3, velocity_per_hour: 10.5, root_sentiment: "positive", sentiment_drift: 0.04, shape: "mixed", topic: "Healthcare access" },
];

const DEMO_SUMMARY: SpreadSummary = {
  cascade_count: 24,
  mean_depth: 4.8,
  max_depth: 9,
  cross_platform_share: 0.63,
  shapes: { viral: 6, broadcast: 8, conversation: 5, mixed: 5 },
  mean_sentiment_drift: -0.02,
  largest_cascade_size: 428,
};

export default function DiffusionPage() {
  const [days, setDays] = useState(7);

  const cascades = useCascades(days);
  const spread = useSpread(days, 3);
  const recompute = useRecomputeDiffusion();

  const hasCascades = Boolean(cascades.data?.items?.length);
  const summary = hasCascades ? cascades.data?.summary : DEMO_SUMMARY;
  const cascadeItems = hasCascades ? cascades.data?.items : DEMO_CASCADES;

  return (
    <div className="p-5 lg:p-6 space-y-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <SummaryRow summary={summary} loading={cascades.isLoading} />
        <div className="flex items-center gap-2 flex-shrink-0">
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: 1, label: "24h" },
              { value: 7, label: "7d" },
              { value: 14, label: "14d" },
              { value: 30, label: "30d" },
            ]}
          />
          <Button
            variant="subtle"
            loading={recompute.isPending}
            onClick={() =>
              recompute.mutate(
                { days },
                {
                  onSuccess: (r: any) =>
                    toast.success(
                      `${fmtNumber(r.edges_materialised)} edges, ${fmtNumber(
                        r.diffusion_events
                      )} diffusion events`
                    ),
                  onError: (e: any) => toast.error(e?.message ?? "Recompute failed"),
                }
              )
            }
          >
            {recompute.isPending ? null : <RefreshCw className="w-3.5 h-3.5" />}
            Recompute
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SpreadTimelineCard
          spread={spread.data}
          loading={spread.isLoading}
          error={spread.error}
          onRetry={() => spread.refetch()}
          className="xl:col-span-2"
        />
        <ShapeMixCard summary={summary} loading={cascades.isLoading} />
      </div>

      <HopsCard
        spread={spread.data}
        loading={spread.isLoading}
      />

      <CascadeTable
        cascades={cascadeItems}
        loading={cascades.isLoading}
        error={cascades.error}
        onRetry={() => cascades.refetch()}
      />
    </div>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({
  summary,
  loading,
}: {
  summary?: SpreadSummary;
  loading: boolean;
}) {
  const tiles = [
    { label: "Cascades", value: summary ? fmtNumber(summary.cascade_count) : "—" },
    {
      label: "Mean depth",
      value: summary ? summary.mean_depth.toFixed(1) : "—",
      sub: summary ? `max ${summary.max_depth}` : undefined,
    },
    {
      label: "Largest",
      value: summary ? fmtNumber(summary.largest_cascade_size ?? 0) : "—",
      sub: "posts",
    },
    {
      label: "Cross-platform",
      value: summary ? `${Math.round(summary.cross_platform_share * 100)}%` : "—",
      sub: "jumped source",
    },
    {
      label: "Mood drift",
      value: summary ? summary.mean_sentiment_drift.toFixed(2) : "—",
      sub: "root → leaves",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 flex-1">
      {tiles.map((tile) => (
        <Card key={tile.label} className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-3 mb-1.5">
            {tile.label}
          </p>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-xl font-bold text-ink tabular-nums">{tile.value}</p>
          )}
          {tile.sub && <p className="text-[10px] text-ink-3 mt-0.5">{tile.sub}</p>}
        </Card>
      ))}
    </div>
  );
}

// ── Spread timeline ───────────────────────────────────────────────────────────

/**
 * The replayable timeline the API returns and the page used to discard.
 *
 * `/diffusion/spread` has always sent a `timeline` array of per-segment volume
 * and mean sentiment per bucket, and the previous page fetched it and rendered
 * only the hop list. That left the most useful artefact unused: the hop list says
 * a story moved, while this says *how the audience composition changed* as it did.
 */
function SpreadTimelineCard({
  spread,
  loading,
  error,
  onRetry,
  className,
}: {
  spread?: DiffusionResult;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  className?: string;
}) {
  const theme = useChartTheme();
  const { chart, segments } = useMemo(() => {
    const buckets = spread?.timeline ?? [];
    const names = new Map<string, string>();
    for (const bucket of buckets) {
      for (const entry of Object.values(bucket.segments ?? {})) {
        names.set(String(entry.segment_id), entry.segment_name);
      }
    }
    // Too many series makes a stacked area unreadable; the biggest contributors
    // are the ones that carry the story.
    const totals = new Map<string, number>();
    for (const bucket of buckets) {
      for (const entry of Object.values(bucket.segments ?? {})) {
        const key = String(entry.segment_id);
        totals.set(key, (totals.get(key) ?? 0) + entry.volume);
      }
    }
    const top = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key]) => key);

    return {
      segments: top.map((key) => ({ key, name: names.get(key) ?? `Segment ${key}` })),
      chart: buckets.map((bucket) => {
        const row: Record<string, any> = {
          time: new Date(bucket.bucket_ts).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
          }),
        };
        for (const key of top) {
          const match = Object.values(bucket.segments ?? {}).find(
            (entry) => String(entry.segment_id) === key
          );
          row[key] = match?.volume ?? 0;
        }
        return row;
      }),
    };
  }, [spread]);

  return (
    <Card className={className}>
      <CardHeader
        icon={Share2}
        title="Which audiences carried the story, over time"
        subtitle="Volume by segment per bucket — the composition shift, not just the total"
        actions={<EpistemicBadge kind="observed" />}
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : loading ? (
          <ChartSkeleton height={260} />
        ) : !spread?.available ? (
          <EmptyState
            icon={Info}
            title="Spread analysis unavailable"
            hint={
              spread?.reason ??
              "This needs authors mapped to segments — rebuild demographic profiles, then run segmentation."
            }
          />
        ) : chart.length < 2 ? (
          <EmptyState icon={Share2} title="Not enough buckets to plot a spread timeline" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chart} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={theme.axis}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(1, Math.floor(chart.length / 8))}
                />
                <YAxis tick={theme.axis} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTooltip />} />
                {segments.map((segment, i) => (
                  <Area
                    key={segment.key}
                    type="monotone"
                    dataKey={segment.key}
                    name={segment.name}
                    stackId="1"
                    stroke={theme.categoricalColor(i)}
                    fill={theme.categoricalColor(i)}
                    fillOpacity={0.3}
                    strokeWidth={1.25}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2">
              {segments.map((segment, i) => (
                <span
                  key={segment.key}
                  className="inline-flex items-center gap-1.5 text-[10px] text-ink-3 max-w-[14rem]"
                >
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: theme.categoricalColor(i) }}
                  />
                  <span className="truncate">{segment.name}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Shape mix ─────────────────────────────────────────────────────────────────

function ShapeMixCard({
  summary,
  loading,
}: {
  summary?: SpreadSummary;
  loading: boolean;
}) {
  const rows = useMemo(
    () =>
      Object.entries(summary?.shapes ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([shape, count]) => ({
          shape,
          count,
          ...(SHAPE_META[shape] ?? SHAPE_META.mixed),
        })),
    [summary]
  );

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card>
      <CardHeader
        icon={GitBranch}
        title="Cascade shapes"
        subtitle="The same post count means different things depending on structure"
      />
      <CardBody>
        {loading ? (
          <Skeleton className="h-[260px]" />
        ) : !rows.length ? (
          <EmptyState icon={GitBranch} title="No cascades in this window" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={42}
                  outerRadius={72}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {rows.map((row) => (
                    <Cell key={row.shape} fill={row.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-1.5 mt-2">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.shape}
                    className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-transparent"
                    title={row.hint}
                  >
                    <Icon
                      className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                      style={{ color: row.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ink">{row.label}</span>
                        <span className="text-xs text-ink tabular-nums">
                          {row.count}
                          <span className="text-ink-3">
                            {" "}
                            · {Math.round((row.count / (total || 1)) * 100)}%
                          </span>
                        </span>
                      </div>
                      <p className="text-[10px] text-ink-3 leading-snug">{row.hint}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Hops ──────────────────────────────────────────────────────────────────────

function HopsCard({
  spread,
  loading,
}: {
  spread?: DiffusionResult;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        icon={ArrowRight}
        title="Inferred segment-to-segment hops"
        subtitle="Correlational — ordering plus connectivity, not observed transmission, which is why each hop carries a confidence"
        actions={<EpistemicBadge kind="modeled" />}
      />
      <CardBody>
        {loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !spread?.available ? (
          <EmptyState icon={Info} title="Unavailable" hint={spread?.reason} />
        ) : !spread.hops.length ? (
          <EmptyState
            icon={ArrowRight}
            title="No segment-to-segment movement detected"
            hint="Either the window is too narrow, or the conversation stayed inside single audiences."
          />
        ) : (
          <div className="space-y-1 max-h-[24rem] overflow-y-auto pr-1">
            {spread.hops.map((hop, i) => (
              <div
                key={`${hop.ts}-${i}`}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-surface-2 rounded-lg"
              >
                <span className="text-[10px] text-ink-3 w-24 flex-shrink-0 tabular-nums">
                  {new Date(hop.ts).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                  })}
                </span>

                <div className="flex items-center gap-2 flex-1 min-w-[14rem]">
                  <span className="text-xs text-ink-2 truncate max-w-[40%]">
                    {hop.from_segment}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  <span className="text-xs font-medium text-ink truncate max-w-[40%]">
                    {hop.to_segment}
                  </span>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 ml-auto">
                  <span className="text-[10px] text-ink-3 tabular-nums">
                    {fmtNumber(hop.volume)} posts
                  </span>
                  <span className="text-[10px] text-ink-3 tabular-nums">
                    {fmtNumber(hop.interaction_edges)} links
                  </span>
                  <DriftBadge drift={hop.sentiment_delta} />
                  <Badge
                    tone={hop.confidence >= 0.6 ? "success" : hop.confidence >= 0.35 ? "warn" : "neutral"}
                  >
                    <span title="Confidence that this is real transmission rather than coincidence">
                      {Math.round(hop.confidence * 100)}% conf
                    </span>
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {spread?.method && (
          <p className="text-[11px] text-ink-3 flex items-start gap-2 pt-3 mt-2 border-t border-bdr leading-relaxed">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {spread.method}.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Drift is the finding: a story that leaves one audience neutral and arrives hostile in another. */
function DriftBadge({ drift }: { drift: number }) {
  if (Math.abs(drift) < 0.05) {
    return <span className="text-[10px] text-ink-3 tabular-nums">no drift</span>;
  }
  const worsened = drift < 0;
  const Icon = worsened ? TrendingDown : TrendingUp;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium tabular-nums",
        worsened ? "text-danger" : "text-success"
      )}
      title="Change in mean sentiment between the two segments"
    >
      <Icon className="w-3 h-3" />
      {drift > 0 ? "+" : ""}
      {drift.toFixed(2)}
    </span>
  );
}

// ── Cascade table ─────────────────────────────────────────────────────────────

function CascadeTable({
  cascades,
  loading,
  error,
  onRetry,
}: {
  cascades?: Cascade[];
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader
        icon={GitBranch}
        title="Largest cascades"
        subtitle="Reply and forward trees, biggest first"
        hint="structure, not volume"
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : !cascades?.length ? (
          <EmptyState
            icon={GitBranch}
            title="No cascades found"
            hint="Cascades need posts carrying reply or forward links to a parent author."
          />
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[46rem]">
              <thead>
                <tr className="label border-b border-bdr">
                  <th className="text-left font-semibold py-2">Shape</th>
                  <th className="text-right font-semibold py-2">Size</th>
                  <th className="text-right font-semibold py-2">Depth</th>
                  <th className="text-right font-semibold py-2">Breadth</th>
                  <th className="text-right font-semibold py-2">Authors</th>
                  <th className="text-right font-semibold py-2">Speed</th>
                  <th className="text-right font-semibold py-2">Duration</th>
                  <th className="text-left font-semibold py-2 pl-4">Platforms</th>
                  <th className="text-right font-semibold py-2">Drift</th>
                </tr>
              </thead>
              <tbody>
                {cascades.slice(0, 20).map((cascade, i) => {
                  const meta = SHAPE_META[cascade.shape] ?? SHAPE_META.mixed;
                  const ShapeIcon = meta.icon;
                  return (
                    <tr
                      key={`${cascade.root_author}-${i}`}
                      className="border-b border-bdr/50 hover:bg-surface-2/60 transition-colors"
                    >
                      <td className="py-2.5">
                        <Badge tone={meta.tone}>
                          <ShapeIcon className="w-3 h-3" />
                          <span title={meta.hint}>{meta.label}</span>
                        </Badge>
                      </td>
                      <td className="text-right text-ink font-medium tabular-nums">
                        {cascade.size}
                      </td>
                      <td className="text-right text-ink-2 tabular-nums">{cascade.depth}</td>
                      <td className="text-right text-ink-2 tabular-nums">{cascade.breadth}</td>
                      <td className="text-right text-ink-2 tabular-nums">
                        {cascade.unique_authors}
                      </td>
                      <td className="text-right text-ink-2 tabular-nums">
                        {cascade.velocity_per_hour.toFixed(1)}/h
                      </td>
                      <td className="text-right text-ink-2 tabular-nums">
                        {cascade.duration_hours < 24
                          ? `${cascade.duration_hours.toFixed(1)}h`
                          : `${(cascade.duration_hours / 24).toFixed(1)}d`}
                      </td>
                      <td className="pl-4">
                        <div className="flex gap-1 flex-wrap">
                          {cascade.platforms.map((platform) => (
                            <span
                              key={platform}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 border border-bdr text-ink-3"
                            >
                              {platform}
                            </span>
                          ))}
                          {cascade.cross_platform && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent">
                              crossed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <DriftBadge drift={cascade.sentiment_drift} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
