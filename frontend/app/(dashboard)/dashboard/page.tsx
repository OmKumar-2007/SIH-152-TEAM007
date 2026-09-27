"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Globe2, Shuffle } from "lucide-react";

import { useDashboard, useTrends } from "@/lib/queries";
import { cn, fmtNumber } from "@/lib/utils";
import type { DashboardSummary, TimePoint, TrendSummary } from "@/lib/api";
import { ChartTooltip, Sparkline, useChartTheme } from "@/components/charts/theme";
import { GlobeLegend, TrendGlobe, type GlobeTrend } from "@/components/charts/trend-globe";
import {
  AnimatedNumber,
  Button,
  Card,
  CardBody,
  CardHeader,
  ChartSkeleton,
  Delta,
  EmptyState,
  ErrorState,
  SentimentBar,
  Skeleton,
} from "@/components/ui";

// Presentation-only mode: keep the Overview page populated without depending
// on live ingestion or database state. Set this to false when the real API
// should drive the page again.
const SYNTHETIC_OVERVIEW = true;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function createSyntheticTimeline(random = Math.random): TimePoint[] {
  const end = new Date();
  end.setMinutes(0, 0, 0);
  let positive = 0.3 + (random() - 0.5) * 0.06;
  let negative = 0.23 + (random() - 0.5) * 0.05;

  return Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(end.getTime() - (23 - index) * 60 * 60 * 1000);
    const localHour = hour.getHours();
    const activityWave = Math.max(0, Math.sin(((localHour - 7) / 24) * Math.PI * 2));
    positive = clamp(positive + (random() - 0.48) * 0.045, 0.22, 0.46);
    negative = clamp(negative + (random() - 0.52) * 0.04, 0.14, 0.38);

    // Preserve room for a neutral share and keep neighbouring points related,
    // so a new sample looks like a plausible day rather than white noise.
    if (positive + negative > 0.78) negative = 0.78 - positive;

    return {
      timestamp: hour.toISOString(),
      positive: Number(positive.toFixed(3)),
      negative: Number(negative.toFixed(3)),
      neutral: Number((1 - positive - negative).toFixed(3)),
      volume: Math.round(360 + activityWave * 540 + random() * 170),
    };
  });
}

// Seeded once for identical server/client HTML. A fresh random sample replaces
// it immediately after hydration and whenever the demo control is pressed.
let syntheticSeed = 19;
const seededRandom = () => {
  syntheticSeed = (syntheticSeed * 9301 + 49297) % 233280;
  return syntheticSeed / 233280;
};
const SYNTHETIC_TIMELINE: TimePoint[] = createSyntheticTimeline(seededRandom);

const SYNTHETIC_SUMMARY: DashboardSummary = {
  total_posts: 128640,
  posts_24h: 12480,
  posts_prev_24h: 10320,
  active_segments: 8,
  trending_topics: 12,
  emerging_count: 4,
  overall_sentiment: { positive: 0.31, neutral: 0.44, negative: 0.25 },
  sentiment_prev_24h: { positive: 0.28, neutral: 0.47, negative: 0.25 },
  authors_24h: 6840,
  authors_prev_24h: 6012,
  unique_authors: 42310,
  comments_24h: 7960,
  nlp_coverage: 0.94,
  analysed_posts: 12090,
  sarcasm_rate: 0.08,
  mean_intensity: 0.62,
  languages_seen: 9,
  top_emotions: { hope: 0.24, anxiety: 0.18, anger: 0.14 },
  stance_breakdown: { supportive: 0.38, against: 0.27, neutral: 0.35 },
  platform_breakdown: [],
  sentiment_timeline: SYNTHETIC_TIMELINE,
  top_movers: [],
  trending_now: [],
  emerging: [],
  demo_mode: true,
};

const SYNTHETIC_TRENDS: TrendSummary[] = [
  { id: 1, name: "Petrol Price Hike Backlash", trend_score: 0.92, velocity: 0.42, acceleration: 0.18, is_emerging: true, platform_count: 5, unique_users: 18400, measured_at: "2026-09-19T12:00:00Z" },
  { id: 2, name: "EV Subsidy Announcement Buzz", trend_score: 0.86, velocity: 0.31, acceleration: 0.12, is_emerging: true, platform_count: 4, unique_users: 12600, measured_at: "2026-09-19T12:00:00Z" },
  { id: 3, name: "MSP Guarantee Bill Discussion", trend_score: 0.78, velocity: 0.24, acceleration: 0.08, is_emerging: false, platform_count: 4, unique_users: 9800, measured_at: "2026-09-19T12:00:00Z" },
  { id: 4, name: "NEP 2020 Implementation Update", trend_score: 0.74, velocity: 0.21, acceleration: 0.06, is_emerging: false, platform_count: 3, unique_users: 8210, measured_at: "2026-09-19T12:00:00Z" },
  { id: 5, name: "Delhi AQI Emergency Alert", trend_score: 0.68, velocity: 0.17, acceleration: 0.04, is_emerging: true, platform_count: 4, unique_users: 7340, measured_at: "2026-09-19T12:00:00Z" },
  { id: 6, name: "Ayushman Bharat Expansion", trend_score: 0.63, velocity: 0.14, acceleration: 0.03, is_emerging: false, platform_count: 3, unique_users: 6120, measured_at: "2026-09-19T12:00:00Z" },
  { id: 7, name: "GST on Essentials Debate", trend_score: 0.58, velocity: 0.11, acceleration: 0.02, is_emerging: true, platform_count: 3, unique_users: 4980, measured_at: "2026-09-19T12:00:00Z" },
  { id: 8, name: "AI in Governance Initiative", trend_score: 0.52, velocity: 0.08, acceleration: 0.01, is_emerging: false, platform_count: 2, unique_users: 3760, measured_at: "2026-09-19T12:00:00Z" },
];

/**
 * The overview.
 *
 * Deliberately three blocks: four numbers, one chart, one sphere. Everything
 * that used to live here — the platform split, the connector table, the emotion
 * breakdown, the live feed — still exists, on the page that is actually about
 * it. An overview that reprints every other page is not an overview; it is a
 * table of contents with charts, and it makes the four numbers that matter
 * compete with a dozen that do not.
 *
 * The rule applied throughout: if a panel could not change what someone does in
 * the next five minutes, it belongs one click away.
 */
export default function DashboardPage() {
  const summary = useDashboard({ enabled: !SYNTHETIC_OVERVIEW });
  const trends = useTrends(48, { enabled: !SYNTHETIC_OVERVIEW });
  const [overviewTimeline, setOverviewTimeline] = useState(SYNTHETIC_TIMELINE);

  useEffect(() => {
    if (SYNTHETIC_OVERVIEW) setOverviewTimeline(createSyntheticTimeline());
  }, []);

  const summaryData = useMemo(
    () =>
      SYNTHETIC_OVERVIEW
        ? { ...SYNTHETIC_SUMMARY, sentiment_timeline: overviewTimeline }
        : summary.data,
    [overviewTimeline, summary.data]
  );
  const trendItems = SYNTHETIC_OVERVIEW ? SYNTHETIC_TRENDS : trends.data?.items;

  if (!SYNTHETIC_OVERVIEW && summary.isError) {
    return (
      <div className="p-6">
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-6 space-y-5 max-w-[1500px] mx-auto">
      <div className="flex items-center gap-2 text-[11px] font-medium text-accent">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Synthetic presentation data — live ingestion is disabled on this overview
      </div>

      <KpiRow data={summaryData} loading={false} />

      <PulseCard
        points={summaryData?.sentiment_timeline}
        loading={false}
        onRandomize={() => setOverviewTimeline(createSyntheticTimeline())}
      />

      <SphereCard
        trends={trendItems}
        loading={false}
      />
    </div>
  );
}

// ── The four numbers ──────────────────────────────────────────────────────────

function KpiRow({ data, loading }: { data?: DashboardSummary; loading: boolean }) {
  const volume = useMemo(
    () => (data?.sentiment_timeline ?? []).map((p) => p.volume),
    [data]
  );

  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[6.5rem]" />
        ))}
      </div>
    );
  }

  const s = data.overall_sentiment;
  const total = s.positive + s.neutral + s.negative || 1;
  // Net sentiment rather than "% positive": a topic that is 40 % positive and
  // 10 % negative is in a different place from one that is 40 % positive and
  // 45 % negative, and a single positive share cannot tell them apart.
  const net = (s.positive - s.negative) / total;
  const prev = data.sentiment_prev_24h;
  const prevNet = prev
    ? (prev.positive - prev.negative) / (prev.positive + prev.neutral + prev.negative || 1)
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
      <Kpi
        label="Posts today"
        value={data.posts_24h}
        delta={<Delta current={data.posts_24h} previous={data.posts_prev_24h} />}
        chart={<Sparkline values={volume} width={112} height={30} />}
      />
      <Kpi
        label="Distinct voices"
        value={data.authors_24h}
        delta={<Delta current={data.authors_24h} previous={data.authors_prev_24h} />}
        hint={`${fmtNumber(data.unique_authors)} all time`}
      />
      <Kpi
        label="Net sentiment"
        value={net}
        format={(n) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(0)}%`}
        tone={net > 0.02 ? "success" : net < -0.02 ? "danger" : "neutral"}
        delta={
          prevNet !== null ? (
            <Delta current={net + 1} previous={prevNet + 1} />
          ) : undefined
        }
        chart={
          <SentimentBar
            positive={s.positive}
            neutral={s.neutral}
            negative={s.negative}
            className="w-28"
          />
        }
      />
      <Kpi
        label="Live topics"
        value={data.trending_topics}
        hint={
          data.emerging_count
            ? `${data.emerging_count} emerging`
            : "none emerging"
        }
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  format = (n: number) => fmtNumber(n),
  tone = "neutral",
  delta,
  hint,
  chart,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  tone?: "neutral" | "success" | "danger";
  delta?: React.ReactNode;
  hint?: string;
  chart?: React.ReactNode;
}) {
  return (
    <Card className="p-4 flex flex-col justify-between min-h-[6.5rem]">
      <p className="label font-semibold">
        {label}
      </p>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div className="min-w-0">
          <div
            className={cn(
              "figure text-[2rem] leading-none",
              tone === "success" && "text-success",
              tone === "danger" && "text-danger",
              tone === "neutral" && "text-ink"
            )}
          >
            <AnimatedNumber
              value={value}
              format={(n) => format(value < 1 && value > -1 ? value : n)}
            />
          </div>
          <div className="mt-1.5 h-4">
            {delta ?? (hint && <span className="text-[11px] text-ink-3">{hint}</span>)}
          </div>
        </div>
        {chart && <div className="flex-shrink-0 pb-0.5">{chart}</div>}
      </div>
    </Card>
  );
}

// ── The one chart ─────────────────────────────────────────────────────────────

function PulseCard({
  points,
  loading,
  onRandomize,
}: {
  points?: TimePoint[];
  loading: boolean;
  onRandomize?: () => void;
}) {
  const theme = useChartTheme();

  const data = useMemo(
    () =>
      (points ?? []).map((p) => ({
        time: new Date(p.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        positive: p.positive == null ? null : p.positive * 100,
        negative: p.negative == null ? null : p.negative * 100,
        volume: p.volume,
      })),
    [points]
  );

  return (
    <Card>
      <CardHeader
        title="Sentiment through the day"
        subtitle="Share of analysed posts, hour by hour. Gaps are hours with nothing analysed, not zeroes."
        actions={
          onRandomize ? (
            <Button onClick={onRandomize} title="Generate a new demo curve">
              <Shuffle className="h-3.5 w-3.5" />
              New sample
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {loading ? (
          <ChartSkeleton height={220} />
        ) : !data.length ? (
          <EmptyState
            title="No analysed posts in this window"
            hint="Run an ingestion cycle from the toolbar to populate the timeline."
          />
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="pos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.sentiment.positive} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={theme.sentiment.positive} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="neg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.sentiment.negative} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={theme.sentiment.negative} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis
                dataKey="time"
                tick={theme.axis}
                axisLine={false}
                tickLine={false}
                minTickGap={44}
              />
              <YAxis
                tick={theme.axis}
                axisLine={false}
                tickLine={false}
                unit="%"
                width={46}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v) => `${v.toFixed(1)}%`}
                    footer={(p) => (
                      <span className="text-[10px] text-ink-3">
                        {(p[0]?.payload?.volume ?? 0).toLocaleString()} posts analysed
                      </span>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="positive"
                stroke={theme.sentiment.positive}
                strokeWidth={1.8}
                fill="url(#pos)"
                connectNulls={false}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="negative"
                stroke={theme.sentiment.negative}
                strokeWidth={1.8}
                fill="url(#neg)"
                connectNulls={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

// ── The sphere ────────────────────────────────────────────────────────────────

function SphereCard({
  trends,
  loading,
}: {
  trends?: { id: number; name: string; trend_score: number; velocity: number; is_emerging: boolean }[];
  loading: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const items: GlobeTrend[] = useMemo(
    () =>
      (trends ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        score: t.trend_score,
        velocity: t.velocity,
        isEmerging: t.is_emerging,
      })),
    [trends]
  );

  // The list beside the globe is ranked by movement, not size — the globe
  // already shows size, and "what is moving" is the question the pair is for.
  const movers = useMemo(
    () => [...items].sort((a, b) => b.velocity - a.velocity).slice(0, 6),
    [items]
  );

  return (
    <Card>
      <CardHeader
        title="The conversation, as a whole"
        subtitle="Every live topic on one surface — size is scale, colour is direction. Drag to turn it."
        icon={Globe2}
        actions={<GlobeLegend />}
      />
      <CardBody>
        {loading ? (
          <div className="flex justify-center py-6">
            <Skeleton className="w-[340px] h-[340px] rounded-full" />
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Globe2}
            title="No topics are live yet"
            hint="Topics appear once they clear the minimum hourly volume."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-8 items-center">
            <div className="flex justify-center">
              <TrendGlobe
                trends={items}
                selectedId={selected}
                onSelect={(t) => setSelected(t.id)}
                size={420}
              />
            </div>

            <div className="min-w-0">
              <p className="label font-semibold mb-2.5">
                Moving fastest
              </p>
              <div className="space-y-1">
                {movers.map((t, i) => (
                  <Link
                    key={t.id}
                    href={`/trends?id=${t.id}`}
                    onMouseEnter={() => setSelected(t.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors group",
                      selected === t.id ? "bg-surface-2" : "hover:bg-surface-2"
                    )}
                  >
                    <span className="text-[11px] font-bold text-ink-3 tabular-nums w-4">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-ink truncate">
                      {t.name}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums",
                        t.velocity > 0 ? "text-success" : "text-ink-3"
                      )}
                    >
                      {t.velocity > 0 ? "+" : ""}
                      {(t.velocity * 100).toFixed(0)}%
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
