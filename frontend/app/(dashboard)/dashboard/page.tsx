"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRight,
  Flame,
  Gauge,
  MessageSquare,
  Radio,
  RefreshCw,
  Rocket,
  Share2,
  Smile,
  Sparkles,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  useConnectors,
  useDashboard,
  useEmotions,
  useLiveFeed,
  useTriggerIngestion,
} from "@/lib/queries";
import { cn, fmtNumber, fmtPct } from "@/lib/utils";
import type { DashboardSummary, LiveFeedItem, TimePoint, TrendMover } from "@/lib/api";
import {
  ChartTooltip,
  Sparkline,
  platformColor,
  useChartTheme,
} from "@/components/charts/theme";
import {
  AnimatedNumber,

  Button,
  Card,
  CardBody,
  CardHeader,
  ChartSkeleton,
  Delta,
  EmptyState,
  EpistemicBadge,
  ErrorState,
  LivePill,
  ProgressBar,
  SentimentBar,
  Skeleton,
  StatusDot,
} from "@/components/ui";

/**
 * The overview.
 *
 * Organised around one question — *what changed* — and around one promise: that
 * the page is running, not a snapshot. The live column on the right streams
 * posts as they arrive; the headline figures count to their new values rather
 * than snapping, so a background refresh is visible rather than silent.
 *
 * Trending and emerging are shown side by side because they are different
 * rankings and the difference is the point: the biggest conversation is rarely
 * the one worth acting on first.
 */
export default function DashboardPage() {
  const summary = useDashboard();
  const emotions = useEmotions(24);
  const connectors = useConnectors();
  const live = useLiveFeed(14);
  const ingest = useTriggerIngestion();

  if (summary.isError) {
    return (
      <div className="p-6">
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      </div>
    );
  }

  const data = summary.data;

  return (
    <div className="p-5 lg:p-6 space-y-5">
      <KpiRow data={data} loading={summary.isLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_20rem] gap-5 items-start">
        <div className="space-y-5">
          <PulseCard
            points={data?.sentiment_timeline}
            loading={summary.isLoading}
            fetching={summary.isFetching}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TrendPanel
              title="Trending now"
              subtitle="Biggest conversations by composite score"
              icon={Flame}
              tone="brand"
              trends={data?.trending_now}
              loading={summary.isLoading}
              emptyHint="Topics are scored once they clear the minimum hourly volume."
            />
            <TrendPanel
              title="Emerging"
              subtitle="Breaking out — earliest point at which a response is cheap"
              icon={Rocket}
              tone="accent"
              trends={data?.emerging}
              loading={summary.isLoading}
              emptyHint="Nothing has tripped the emerging threshold in this window."
              showVelocity
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5">
            <PlatformCard data={data} loading={summary.isLoading} />
            <MoodCard
              data={data}
              emotions={emotions.data}
              loading={summary.isLoading || emotions.isLoading}
            />
          </div>

          <ConnectorCard
            connectors={connectors.data}
            loading={connectors.isLoading}
            error={connectors.error}
            onTrigger={() =>
              ingest.mutate(undefined, {
                onSuccess: (result: any) =>
                  toast.success(
                    result?.mode === "inline"
                      ? "Pipeline ran inline — every view refreshed"
                      : "Ingestion cycle queued"
                  ),
                onError: (error: any) =>
                  toast.error(error?.message ?? "Could not trigger ingestion"),
              })
            }
            triggering={ingest.isPending}
          />
        </div>

        <LiveColumn
          items={live.items}
          fetching={live.isFetching}
          loading={live.isLoading}
          data={data}
        />
      </div>
    </div>
  );
}

// ── KPI row ───────────────────────────────────────────────────────────────────

function KpiRow({ data, loading }: { data?: DashboardSummary; loading: boolean }) {
  const volumeSeries = useMemo(
    () => (data?.sentiment_timeline ?? []).map((p) => p.volume),
    [data]
  );

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[106px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger">
      <Kpi
        icon={MessageSquare}
        label="Conversation volume"
        value={data.posts_24h}
        unit="posts · last 24h"
        delta={<Delta current={data.posts_24h} previous={data.posts_prev_24h} />}
        spark={volumeSeries}
      />
      <Kpi
        icon={Users}
        label="Distinct voices"
        value={data.authors_24h}
        unit="authors · last 24h"
        delta={<Delta current={data.authors_24h} previous={data.authors_prev_24h} />}
        note={`${fmtNumber(data.comments_24h)} replies`}
      />
      <Kpi
        icon={Gauge}
        label="Negative share"
        value={Math.round(data.overall_sentiment.negative * 1000) / 10}
        format={(n) => `${n.toFixed(1)}%`}
        unit="of analysed posts"
        tone={data.overall_sentiment.negative > 0.4 ? "danger" : undefined}
        delta={
          data.sentiment_prev_24h ? (
            // Inverted: a rise in negativity is not an improvement, so the arrow
            // and the colour have to disagree about "up is good".
            <Delta
              current={data.overall_sentiment.negative}
              previous={data.sentiment_prev_24h.negative}
              invert
            />
          ) : undefined
        }
      />
      <Kpi
        icon={TrendingUp}
        label="Topics tracked"
        value={data.trending_topics}
        unit={`${data.emerging_count} emerging`}
        tone={data.emerging_count > 0 ? "accent" : undefined}
        note={`${data.active_segments} audience segments`}
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  note,
  spark,
  tone,
  format,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  unit?: string;
  delta?: React.ReactNode;
  note?: string;
  spark?: number[];
  tone?: "accent" | "danger";
  format?: (value: number) => string;
}) {
  const theme = useChartTheme();
  return (
    <Card hover className="p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0",
            tone === "accent"
              ? "bg-accent/10"
              : tone === "danger"
              ? "bg-danger/10"
              : "bg-brand/10"
          )}
        >
          <Icon
            className={cn(
              "w-3.5 h-3.5",
              tone === "accent"
                ? "text-accent"
                : tone === "danger"
                ? "text-danger"
                : "text-brand"
            )}
          />
        </div>
        <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider truncate">
          {label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[26px] font-bold text-ink leading-none tracking-tight">
            <AnimatedNumber value={value} format={format ?? fmtNumber} />
          </p>
          {unit && <p className="text-[10px] text-ink-3 mt-1.5">{unit}</p>}
        </div>
        {spark && spark.length > 2 && (
          <Sparkline values={spark} color={theme.brand} width={82} height={30} />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[18px]">
        {delta}
        {note && <span className="text-[10px] text-ink-3 tabular-nums">{note}</span>}
      </div>
    </Card>
  );
}

// ── Pulse ─────────────────────────────────────────────────────────────────────

function PulseCard({
  points,
  loading,
  fetching,
}: {
  points?: TimePoint[];
  loading: boolean;
  fetching: boolean;
}) {
  const theme = useChartTheme();

  const chart = useMemo(
    () =>
      (points ?? []).map((p) => ({
        time: new Date(p.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        // Nulls are preserved rather than coerced to zero: Recharts breaks the
        // line on a null, which is what a gap in the record should look like.
        positive: p.positive == null ? null : +(p.positive * 100).toFixed(1),
        negative: p.negative == null ? null : +(p.negative * 100).toFixed(1),
        volume: p.volume,
      })),
    [points]
  );

  const measured = chart.filter((p) => p.positive != null).length;
  const gaps = chart.length - measured;

  return (
    <Card className="relative overflow-hidden">
      {fetching && <span className="refetch-bar" />}
      <CardHeader
        icon={Activity}
        title="Discourse pulse"
        subtitle={
          gaps > 0
            ? `Last 24 hours · ${measured} hours measured, ${gaps} with nothing analysed`
            : "Polarity and volume across the last 24 hours"
        }
        actions={
          <div className="flex items-center gap-2">
            <LivePill active={fetching} />
            <EpistemicBadge kind="observed" />
          </div>
        }
      />
      <CardBody>
        {loading ? (
          <ChartSkeleton height={230} />
        ) : measured < 2 ? (
          <EmptyState
            icon={Activity}
            title="Not enough history yet"
            hint="At least two analysed hours are needed to draw a trend."
          />
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={chart} margin={{ top: 6, right: 4, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="pulse-pos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.sentiment.positive} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={theme.sentiment.positive} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pulse-neg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.sentiment.negative} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={theme.sentiment.negative} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} strokeDasharray="2 5" vertical={false} />
              <XAxis
                dataKey="time"
                tick={theme.axis}
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis tick={theme.axis} tickLine={false} axisLine={false} unit="%" width={40} />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v) => `${v}%`}
                    footer={(payload) => (
                      <p className="text-[10px] text-ink-3">
                        {payload[0]?.payload?.volume ?? 0} posts analysed this hour
                      </p>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="positive"
                name="Positive"
                stroke={theme.sentiment.positive}
                fill="url(#pulse-pos)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive
                animationDuration={700}
              />
              <Area
                type="monotone"
                dataKey="negative"
                name="Negative"
                stroke={theme.sentiment.negative}
                fill="url(#pulse-neg)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

// ── Trend panels ──────────────────────────────────────────────────────────────

const PHASE_TONE: Record<string, "success" | "brand" | "accent" | "warn" | "neutral"> = {
  emerging: "accent",
  rising: "brand",
  peaking: "warn",
  declining: "neutral",
  dormant: "neutral",
};

function TrendPanel({
  title,
  subtitle,
  icon,
  tone,
  trends,
  loading,
  emptyHint,
  showVelocity = false,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  tone: "brand" | "accent";
  trends?: TrendMover[];
  loading: boolean;
  emptyHint: string;
  showVelocity?: boolean;
}) {
  return (
    <Card>
      <CardHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        actions={
          <Link
            href="/trends"
            className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
          >
            Analyse
            <ArrowRight className="w-3 h-3" />
          </Link>
        }
      />
      <CardBody>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : !trends?.length ? (
          <EmptyState icon={TrendingUp} title="Nothing here yet" hint={emptyHint} />
        ) : (
          <div className="space-y-0.5 stagger">
            {trends.map((trend, index) => (
              <Link
                key={trend.id}
                href={`/trends?id=${trend.id}`}
                className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-2 transition-colors group"
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                    tone === "accent"
                      ? "bg-accent/10 text-accent"
                      : "bg-brand/10 text-brand"
                  )}
                >
                  {index + 1}
                </span>

                {/*
                  The topic name gets the room. Squeezing it to fit a phase chip
                  and a score in one row produces "AI Gover…", which identifies
                  nothing — so the phase moves onto the metadata line where it
                  can wrap, and the number keeps a fixed narrow column.
                */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink truncate group-hover:text-brand transition-colors">
                    {trend.name}
                  </p>
                  <p className="text-[10px] text-ink-3 tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span>{fmtNumber(trend.unique_users)} voices</span>
                    <span>· {trend.platform_count} platforms</span>
                    {trend.phase && (
                      <span
                        className={cn(
                          "uppercase tracking-wide font-semibold",
                          trend.phase === "emerging" || trend.phase === "rising"
                            ? "text-accent"
                            : trend.phase === "peaking"
                            ? "text-warn"
                            : "text-ink-3"
                        )}
                      >
                        · {trend.phase}
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-right flex-shrink-0 w-12">
                  {showVelocity ? (
                    <p
                      className={cn(
                        "text-[13px] font-bold tabular-nums leading-none",
                        trend.velocity > 0 ? "text-success" : "text-ink-2"
                      )}
                    >
                      {trend.velocity > 0 ? "+" : ""}
                      {trend.velocity.toFixed(1)}
                    </p>
                  ) : (
                    <p className="text-[13px] font-bold tabular-nums text-ink leading-none">
                      {trend.trend_score.toFixed(2)}
                    </p>
                  )}
                  <ProgressBar
                    value={showVelocity ? Math.min(1, trend.velocity / 30) : trend.trend_score}
                    tone={tone}
                    trackClassName="h-1 mt-1.5"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Platform mix ──────────────────────────────────────────────────────────────

function PlatformCard({
  data,
  loading,
}: {
  data?: DashboardSummary;
  loading: boolean;
}) {
  const theme = useChartTheme();

  const rows = useMemo(
    () =>
      (data?.platform_breakdown ?? []).map((p) => ({
        name: p.display_name,
        platform: p.platform,
        total: p.post_count,
        recent: p.posts_24h,
        authors: p.unique_authors,
        share: p.share,
        color: platformColor(p.platform, p.color),
      })),
    [data]
  );

  return (
    <Card>
      <CardHeader
        icon={Share2}
        title="Where the conversation lives"
        subtitle="Last 24 hours by source, against total corpus share"
      />
      <CardBody>
        {loading ? (
          <ChartSkeleton height={190} />
        ) : !rows.length ? (
          <EmptyState icon={Share2} title="No platform data" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-5">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={rows} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} strokeDasharray="2 5" vertical={false} />
                <XAxis
                  dataKey="platform"
                  tick={{ ...theme.axis, fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={theme.axis} tickLine={false} axisLine={false} width={40} />
                <Tooltip cursor={{ fill: theme.cursor }} content={<ChartTooltip />} />
                <Bar
                  dataKey="recent"
                  name="posts · 24h"
                  radius={[5, 5, 0, 0]}
                  animationDuration={700}
                >
                  {rows.map((row) => (
                    <Cell key={row.platform} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="space-y-2.5 self-center">
              {rows.map((row) => (
                <div key={row.platform}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] text-ink-2 flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-[3px]"
                        style={{ background: row.color }}
                      />
                      {row.name}
                    </span>
                    <span className="text-[11px] text-ink tabular-nums">
                      {fmtNumber(row.total)}
                      <span className="text-ink-3"> · {fmtPct(row.share)}</span>
                    </span>
                  </div>
                  <ProgressBar value={row.share} tone={row.color} trackClassName="h-1" />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Mood ──────────────────────────────────────────────────────────────────────

function MoodCard({
  data,
  emotions,
  loading,
}: {
  data?: DashboardSummary;
  emotions?: { emotions: Record<string, number> };
  loading: boolean;
}) {
  const theme = useChartTheme();

  const affect = useMemo(
    () =>
      Object.entries(emotions?.emotions ?? data?.top_emotions ?? {})
        .filter(([key]) => key !== "neutral" && key !== "unknown")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    [emotions, data]
  );

  if (loading || !data) {
    return (
      <Card>
        <CardHeader icon={Smile} title="How it feels" />
        <CardBody>
          <Skeleton className="h-[190px]" />
        </CardBody>
      </Card>
    );
  }

  const stance = data.stance_breakdown ?? {};

  return (
    <Card>
      <CardHeader
        icon={Smile}
        title="How it feels"
        subtitle="Tone, stance and the signals that qualify them"
        actions={<EpistemicBadge kind="inferred" />}
      />
      <CardBody className="space-y-4">
        <div>
          <SentimentBar {...data.overall_sentiment} height="h-2.5" />
          <div className="flex gap-3 mt-2 flex-wrap">
            {(["positive", "neutral", "negative"] as const).map((key) => (
              <span key={key} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: theme.sentimentColor(key) }}
                />
                <span className="text-[11px] text-ink-3 capitalize">{key}</span>
                <span className="text-[11px] font-semibold text-ink tabular-nums">
                  {fmtPct(data.overall_sentiment[key])}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Stance is a separate axis from tone: a post can be negative in
            wording while supporting the thing it is angry about. */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-bdr">
          {[
            { key: "supportive", label: "Support", tone: "success" },
            { key: "neutral", label: "Neutral", tone: "neutral" },
            { key: "against", label: "Oppose", tone: "danger" },
          ].map((row) => (
            <div key={row.key} className="text-center">
              <p
                className={cn(
                  "text-base font-bold tabular-nums",
                  row.tone === "success"
                    ? "text-success"
                    : row.tone === "danger"
                    ? "text-danger"
                    : "text-ink-2"
                )}
              >
                {fmtPct(stance[row.key] ?? 0)}
              </p>
              <p className="text-[9px] text-ink-3 uppercase tracking-wider">{row.label}</p>
            </div>
          ))}
        </div>

        {affect.length > 0 && (
          <div className="pt-3 border-t border-bdr">
            <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-2">
              Dominant emotions
            </p>
            <div className="space-y-1.5">
              {affect.map(([emotion, share]) => (
                <div key={emotion} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-ink-2 capitalize w-20 truncate">
                    {emotion}
                  </span>
                  <div className="flex-1">
                    <ProgressBar
                      value={share}
                      tone={theme.emotionColor(emotion)}
                      trackClassName="h-1.5"
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-ink tabular-nums w-10 text-right">
                    {fmtPct(share)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <MiniStat
            label="Sarcasm"
            value={fmtPct(data.sarcasm_rate)}
            tone={data.sarcasm_rate > 0.08 ? "warn" : undefined}
          />
          <MiniStat label="Intensity" value={data.mean_intensity.toFixed(2)} />
        </div>
      </CardBody>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="bg-surface-2 rounded-xl px-3 py-2">
      <p className="text-[9px] text-ink-3 uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          "text-sm font-bold tabular-nums mt-0.5",
          tone === "warn" ? "text-warn" : "text-ink"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── Live column ───────────────────────────────────────────────────────────────

/**
 * The stream.
 *
 * Rows animate in individually rather than the list re-rendering, which is the
 * difference between a feed that reads as live and one that flickers. Each entry
 * carries its platform, its inferred tone and its age, so the column doubles as
 * a sanity check on the analysis: if the sentiment labels beside real sentences
 * look wrong, they are wrong.
 */
function LiveColumn({
  items,
  fetching,
  loading,
  data,
}: {
  items: LiveFeedItem[];
  fetching: boolean;
  loading: boolean;
  data?: DashboardSummary;
}) {
  const theme = useChartTheme();

  return (
    <div className="space-y-5 xl:sticky xl:top-[4.5rem]">
      <Card className="overflow-hidden">
        <CardHeader
          icon={Radio}
          title="Live stream"
          subtitle="Newest posts as they land"
          actions={<LivePill active={fetching} />}
        />
        <div className="px-3 pb-3 max-h-[30rem] overflow-y-auto">
          {loading ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState icon={Radio} title="Nothing streaming yet" />
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => (
                <article
                  key={item.post_id}
                  className="animate-slide-in px-2.5 py-2 rounded-xl hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: platformColor(item.platform, item.platform_color),
                      }}
                    />
                    <span className="text-[10px] text-ink-3 capitalize">{item.platform}</span>
                    <span className="text-[10px] text-ink-3 font-mono">·{item.author}</span>
                    {item.sentiment && (
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wide ml-auto"
                        style={{ color: theme.sentimentColor(item.sentiment) }}
                      >
                        {item.sentiment}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-ink-2 leading-snug line-clamp-3">
                    {item.content}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-ink-3">{timeAgo(item.post_ts)}</span>
                    {item.sarcasm_flag && (
                      <span className="text-[9px] text-warn font-medium">sarcasm flagged</span>
                    )}
                    {item.emotion && item.emotion !== "neutral" && (
                      <span
                        className="text-[9px] capitalize"
                        style={{ color: theme.emotionColor(item.emotion) }}
                      >
                        {item.emotion}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </Card>

      {data && (
        <Card className="p-4">
          <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-3">
            Corpus at a glance
          </p>
          <div className="space-y-2.5">
            <GlanceRow label="Posts held" value={fmtNumber(data.total_posts)} />
            <GlanceRow label="Distinct authors" value={fmtNumber(data.unique_authors)} />
            <GlanceRow
              label="Analysed"
              value={`${Math.round(data.nlp_coverage * 100)}%`}
              bar={data.nlp_coverage}
            />
            <GlanceRow label="Languages" value={String(data.languages_seen)} />
            <GlanceRow label="Audience segments" value={String(data.active_segments)} />
          </div>
        </Card>
      )}
    </div>
  );
}

function GlanceRow({
  label,
  value,
  bar,
}: {
  label: string;
  value: string;
  bar?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-ink-3">{label}</span>
        <span className="text-[12px] font-semibold text-ink tabular-nums">{value}</span>
      </div>
      {bar != null && <ProgressBar value={bar} tone="success" trackClassName="h-1 mt-1" />}
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

// ── Connectors ────────────────────────────────────────────────────────────────

function ConnectorCard({
  connectors,
  loading,
  error,
  onTrigger,
  triggering,
}: {
  connectors?: import("@/lib/api").ConnectorStatus[];
  loading: boolean;
  error?: unknown;
  onTrigger: () => void;
  triggering: boolean;
}) {
  const unhealthy = connectors?.filter((c) => !c.is_healthy) ?? [];

  return (
    <Card>
      <CardHeader
        icon={Radio}
        title="Source health"
        subtitle={
          unhealthy.length
            ? `${unhealthy.length} connector${unhealthy.length > 1 ? "s" : ""} reporting a fault`
            : "All sources responding"
        }
        actions={
          <Button variant="subtle" onClick={onTrigger} loading={triggering}>
            {triggering ? null : <RefreshCw className="w-3.5 h-3.5" />}
            {triggering ? "Running…" : "Run ingest cycle"}
          </Button>
        }
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} />
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 stagger">
            {(connectors ?? []).map((connector) => (
              <div
                key={connector.platform}
                className={cn(
                  "bg-surface-2 rounded-xl p-3 border",
                  connector.is_healthy ? "border-transparent" : "border-danger/30"
                )}
                title={connector.error ?? undefined}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {connector.is_healthy ? (
                    <StatusDot tone="success" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-danger" />
                  )}
                  <span className="text-[11px] font-semibold text-ink capitalize truncate">
                    {connector.platform}
                  </span>
                </div>
                <p className="text-[13px] font-bold text-ink tabular-nums">
                  {fmtNumber(connector.posts_stored)}
                </p>
                <p className="text-[9px] text-ink-3">
                  stored · {connector.mode}
                </p>
                {connector.error && (
                  <p className="text-[9px] text-danger mt-1 line-clamp-2 leading-tight">
                    {connector.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
