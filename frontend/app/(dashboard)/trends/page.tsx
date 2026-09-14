"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Cpu,
  Flame,
  Gauge,
  MessageSquare,
  Rocket,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  useEmergingTrends,
  useTrend,
  useTrendBrief,
  useTrendHistory,
  useTrendNarrative,
  useTrendPosts,
  useTrends,
  useTriggerIngestion,
  useViralKeywords,
} from "@/lib/queries";
import { cn, fmtNumber, fmtPct } from "@/lib/utils";
import type { TrendBrief, TrendDetail, TrendPost, TrendSummary } from "@/lib/api";
import {
  ChartTooltip,
  platformColor,
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
  ProgressBar,
  Segmented,
  SentimentBar,
  Skeleton,
} from "@/components/ui";

type Tab = "all" | "emerging";
type PostOrder = "engagement" | "recent" | "negative";

/**
 * Trend intelligence.
 *
 * The page answers four questions in order, because that is the order an analyst
 * asks them: *what is this* (the brief), *is it growing* (the curve and its
 * motion), *who is carrying it* (platforms, audiences, concentration), and
 * *what are they actually saying* (the posts).
 *
 * Velocity and acceleration are on the page but no longer the headline — on
 * their own they say a number went up without saying what the number is about.
 */
export default function TrendsPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [order, setOrder] = useState<PostOrder>("engagement");

  const all = useTrends(30);
  const emerging = useEmergingTrends();
  const keywords = useViralKeywords(20);
  const detail = useTrend(selected);
  const history = useTrendHistory(selected, 72);
  const brief = useTrendBrief(selected, 72);
  // Issued alongside, not instead: the analysis paints in ~200ms while the local
  // model takes ~12s to phrase it, so the panel must not wait on the model.
  const narrative = useTrendNarrative(selected, 72);
  const posts = useTrendPosts(selected, order, 10, 72);
  const ingest = useTriggerIngestion();

  // Deep link from the overview's trending / emerging panels.
  useEffect(() => {
    const fromUrl = Number(params.get("id"));
    if (fromUrl) {
      setSelected(fromUrl);
      return;
    }
    if (selected == null && all.data?.length) setSelected(all.data[0].id);
  }, [params, all.data, selected]);

  const rows = useMemo(() => {
    const source: TrendSummary[] = tab === "emerging" ? emerging.data ?? [] : all.data ?? [];
    if (!query.trim()) return source;
    const needle = query.toLowerCase();
    return source.filter((t) => t.name.toLowerCase().includes(needle));
  }, [tab, all.data, emerging.data, query]);

  if (all.isError) {
    return (
      <div className="p-6">
        <ErrorState error={all.error} onRetry={() => all.refetch()} />
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-6 space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-[19rem_1fr] gap-5 items-start">
        {/* ── Trend list ──────────────────────────────────────────────────── */}
        <div className="space-y-4 xl:sticky xl:top-[4.5rem]">
          <Card className="overflow-hidden">
            <div className="p-3 space-y-2.5 border-b border-bdr">
              <Segmented
                value={tab}
                onChange={setTab}
                className="w-full"
                options={[
                  { value: "all", label: `All (${all.data?.length ?? 0})` },
                  { value: "emerging", label: `Emerging (${emerging.data?.length ?? 0})` },
                ]}
              />
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter topics…"
                  className="w-full bg-surface-2 border border-transparent rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-brand/50 focus:bg-surface transition-colors"
                />
              </div>
            </div>

            <div className="max-h-[32rem] overflow-y-auto">
              {all.isLoading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : !rows.length ? (
                <EmptyState
                  icon={TrendingUp}
                  title={query ? "No topic matches" : "No trends scored yet"}
                />
              ) : (
                rows.map((trend) => (
                  <TrendRow
                    key={trend.id}
                    trend={trend}
                    active={selected === trend.id}
                    onClick={() => setSelected(trend.id)}
                  />
                ))
              )}
            </div>
          </Card>

          <Button
            className="w-full justify-center"
            onClick={() =>
              ingest.mutate(undefined, {
                onSuccess: () => toast.success("Trend scores recomputed"),
                onError: (error: any) => toast.error(error?.message ?? "Recompute failed"),
              })
            }
            loading={ingest.isPending}
          >
            Recompute trends
          </Button>
        </div>

        {/* ── Detail ──────────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.isLoading || !detail.data ? (
            <Skeleton className="h-[26rem]" />
          ) : (
            <>
              <BriefCard
                brief={brief.data}
                loading={brief.isLoading}
                error={brief.error}
                name={detail.data.name}
                onRetry={() => brief.refetch()}
                narrative={narrative.data?.narrative ?? null}
                narrativeWriting={narrative.isFetching}
                narrativeFailed={narrative.isError}
              />

              <VolumeCard
                detail={detail.data}
                history={history.data}
                brief={brief.data}
                loading={history.isLoading}
                briefLoading={brief.isLoading}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <DriversCard brief={brief.data} loading={brief.isLoading} />
                <MoodCard brief={brief.data} loading={brief.isLoading} />
              </div>

              <PostsCard
                posts={posts.data}
                loading={posts.isLoading}
                order={order}
                onOrderChange={setOrder}
              />

              <KeywordsCard keywords={keywords.data} loading={keywords.isLoading} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────

const PHASE_TONE: Record<string, "success" | "brand" | "accent" | "warn" | "neutral"> = {
  emerging: "accent",
  rising: "brand",
  peaking: "warn",
  declining: "neutral",
  dormant: "neutral",
};

function TrendRow({
  trend,
  active,
  onClick,
}: {
  trend: TrendSummary & { phase?: string | null };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3.5 py-2.5 border-b border-bdr transition-colors",
        active ? "bg-brand/[0.07]" : "hover:bg-surface-2"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <p
          className={cn(
            "text-[13px] font-medium truncate flex-1",
            active ? "text-brand" : "text-ink"
          )}
        >
          {trend.name}
        </p>
        {trend.is_emerging && <Badge tone="accent">new</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ProgressBar
            value={trend.trend_score}
            tone={active ? "brand" : "accent"}
            trackClassName="h-1"
          />
        </div>
        <span className="text-[10px] text-ink-3 tabular-nums w-9 text-right">
          {trend.trend_score.toFixed(2)}
        </span>
        <span
          className={cn(
            "text-[10px] font-semibold tabular-nums w-10 text-right",
            trend.velocity > 0 ? "text-success" : trend.velocity < 0 ? "text-danger" : "text-ink-3"
          )}
        >
          {trend.velocity > 0 ? "+" : ""}
          {trend.velocity.toFixed(1)}
        </span>
      </div>
    </button>
  );
}

// ── The brief ─────────────────────────────────────────────────────────────────

/**
 * What the trend means, in prose.
 *
 * `generated_by` is shown, not hidden: a reader has to know whether they are
 * looking at a language model's phrasing of the analysis or the deterministic
 * fallback's. Both are composed from the same evidence, so neither can
 * contradict the charts below — but they are not the same artefact.
 */
function BriefCard({
  brief,
  loading,
  error,
  name,
  onRetry,
  narrative,
  narrativeWriting,
  narrativeFailed,
}: {
  brief?: TrendBrief;
  loading: boolean;
  error?: unknown;
  name: string;
  onRetry: () => void;
  narrative: string | null;
  narrativeWriting: boolean;
  narrativeFailed: boolean;
}) {

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-brand/[0.08] to-accent/[0.05] border-b border-bdr">
        <CardHeader
          icon={Sparkles}
          title={
            <span className="flex items-center gap-2">
              <span className="text-base">{name}</span>
              {brief && (
                <Badge tone={PHASE_TONE[brief.phase] ?? "neutral"}>{brief.phase}</Badge>
              )}
              {brief?.metrics.bursting && (
                <Badge tone="danger">
                  <Zap className="w-2.5 h-2.5" />
                  bursting
                </Badge>
              )}
            </span>
          }
          subtitle={brief?.phase_meaning}
          actions={
            <div className="flex items-center gap-1.5">
              {/* Withheld until the brief lands: labelling it "analytic" while the
                  request is still in flight asserts which writer ran before
                  anything knows. */}
              {brief && (
                <Badge tone={narrative ? "success" : narrativeWriting ? "brand" : "neutral"}>
                  <Cpu className={cn("w-2.5 h-2.5", narrativeWriting && "animate-spin")} />
                  {narrative
                    ? "local LLM"
                    : narrativeWriting
                    ? "writing…"
                    : "analytic"}
                </Badge>
              )}
              <EpistemicBadge kind="modeled" />
            </div>
          }
        />
      </div>

      <CardBody className="pt-4">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : !brief ? (
          <EmptyState icon={Sparkles} title="No brief available" />
        ) : (
          <div className="space-y-3.5">
            {/*
              The lede. Until the model answers this slot shows what it is doing
              rather than nothing — an empty gap above a full analysis reads as a
              failure, and this one is just slow.
            */}
            {narrative ? (
              <p className="text-[13.5px] text-ink leading-relaxed border-l-2 border-brand/40 pl-3.5 animate-fade-in">
                {narrative}
              </p>
            ) : narrativeWriting ? (
              <div className="border-l-2 border-brand/25 pl-3.5 space-y-2">
                <p className="text-[11px] text-brand flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 animate-spin" />
                  Local model is writing a summary — the analysis below is already
                  complete and does not depend on it.
                </p>
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ) : narrativeFailed ? (
              <p className="text-[11px] text-ink-3 border-l-2 border-bdr pl-3.5">
                No local model reachable, so the brief below is the deterministic
                analytic read. Start Ollama to have it written in prose as well.
              </p>
            ) : null}

            <div className="space-y-2.5">
              <Section icon={Activity} text={brief.sections.headline} />
              <Section icon={Users} text={brief.sections.distribution} />
              <Section icon={Gauge} text={brief.sections.sentiment} />
              <Section icon={Rocket} text={brief.sections.outlook} />
            </div>

            <p className="text-[11px] text-ink-3 leading-relaxed pt-3 border-t border-bdr">
              {brief.sections.caveat}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Renders the brief's light markdown — **bold** and *emphasis* only. */
function Section({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  const parts = useMemo(() => text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g), [text]);

  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0 mt-1" />
      <p className="text-[12.5px] text-ink-2 leading-relaxed">
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={i} className="text-ink font-semibold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return (
              <em key={i} className="text-ink not-italic font-medium">
                {part.slice(1, -1)}
              </em>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    </div>
  );
}

// ── Volume and motion ─────────────────────────────────────────────────────────

function VolumeCard({
  detail,
  history,
  brief,
  loading,
  briefLoading,
}: {
  detail: TrendDetail;
  history?: import("@/lib/api").TrendHistory;
  brief?: TrendBrief;
  loading: boolean;
  briefLoading: boolean;
}) {
  const theme = useChartTheme();

  const chart = useMemo(
    () =>
      (history?.points ?? []).map((p) => ({
        time: new Date(p.bucket_ts).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
        }),
        volume: p.volume,
        users: p.unique_users,
      })),
    [history]
  );

  const baseline = brief?.metrics.baseline ?? 0;
  const forecast = brief?.forecast ?? history?.forecast;

  return (
    <Card>
      <CardHeader
        icon={BarChart3}
        title="Volume and motion"
        subtitle="Hourly posts over 72 hours, against this topic's own baseline"
        actions={<EpistemicBadge kind="observed" />}
      />
      <CardBody className="space-y-4">
        {loading ? (
          <ChartSkeleton height={200} />
        ) : chart.length < 3 ? (
          <EmptyState icon={BarChart3} title="Not enough history for this trend" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart} margin={{ top: 6, right: 4, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="trend-vol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.brand} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={theme.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} strokeDasharray="2 5" vertical={false} />
              <XAxis
                dataKey="time"
                tick={theme.axis}
                tickLine={false}
                axisLine={false}
                interval={Math.max(1, Math.floor(chart.length / 6))}
              />
              <YAxis tick={theme.axis} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} />
              {baseline > 0 && (
                <ReferenceLine
                  y={baseline}
                  stroke={theme.axis.fill}
                  strokeDasharray="4 4"
                  label={{
                    value: `baseline ${baseline.toFixed(0)}/h`,
                    position: "insideTopRight",
                    fill: theme.axis.fill,
                    fontSize: 9,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="volume"
                name="posts"
                stroke={theme.brand}
                fill="url(#trend-vol)"
                strokeWidth={2}
                dot={false}
                animationDuration={700}
              />
              <Line
                type="monotone"
                dataKey="users"
                name="distinct authors"
                stroke={theme.accent}
                strokeWidth={1.4}
                dot={false}
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/*
          The metric grid sits *below* the brief and the curve on purpose. These
          are the inputs to the reading above, not the reading itself — a page
          that leads with "velocity 12.4" makes the reader do the interpretation
          the platform exists to do.
        */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric
            label="Rate now"
            value={brief ? `${brief.metrics.level.toFixed(0)}/h` : "—"}
            sub={brief ? `baseline ${baseline.toFixed(0)}` : "loading"}
          />
          <Metric
            label="Velocity"
            value={`${detail.velocity > 0 ? "+" : ""}${detail.velocity.toFixed(1)}`}
            sub="posts/h change"
            tone={detail.velocity > 0 ? "success" : undefined}
          />
          <Metric
            label="Acceleration"
            value={`${detail.acceleration > 0 ? "+" : ""}${detail.acceleration.toFixed(2)}`}
            sub="is growth compounding"
          />
          <Metric
            label="Composite score"
            value={detail.trend_score.toFixed(2)}
            sub={`spread ${fmtPct(detail.community_spread)}`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-surface-2 rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] text-ink-3 uppercase tracking-wider">
                Projection
              </span>
            </div>
            {briefLoading && !forecast ? (
              <Skeleton className="h-12" />
            ) : !forecast?.available ? (
              <p className="text-xs text-ink-3">
                {forecast?.reason ?? "Series too short or too flat to fit."}
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-lg font-bold text-ink tabular-nums">
                      {Math.round(forecast.values["6h"] ?? 0)}
                      <span className="text-[11px] text-ink-3 font-normal">/h</span>
                    </p>
                    <p className="text-[9px] text-ink-3 uppercase tracking-wider">in 6h</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-ink tabular-nums">
                      {Math.round(forecast.values["24h"] ?? 0)}
                      <span className="text-[11px] text-ink-3 font-normal">/h</span>
                    </p>
                    <p className="text-[9px] text-ink-3 uppercase tracking-wider">in 24h</p>
                  </div>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    value={forecast.confidence}
                    tone={forecast.confidence >= 0.5 ? "success" : "warn"}
                    trackClassName="h-1"
                  />
                  <p className="text-[10px] text-ink-3 mt-1">
                    {fmtPct(forecast.confidence)} confidence
                    {forecast.confidence < 0.4 && " — read as direction, not level"}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="bg-surface-2 rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-brand" />
              <span className="text-[10px] text-ink-3 uppercase tracking-wider">
                Who is posting
              </span>
            </div>
            {briefLoading && !brief ? (
              <Skeleton className="h-12" />
            ) : brief ? (
              <>
                <p className="text-lg font-bold text-ink tabular-nums">
                  {fmtNumber(brief.concentration.authors)}
                  <span className="text-[11px] text-ink-3 font-normal"> authors</span>
                </p>
                <p className="text-[11px] text-ink-2 mt-1 leading-snug">
                  Top 10 accounts produce{" "}
                  <span className="font-semibold text-ink">
                    {fmtPct(brief.concentration.top10_share)}
                  </span>{" "}
                  of volume
                  {brief.concentration.top10_share > 0.35
                    ? " — amplification by a small group"
                    : " — broad participation"}
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-3">Not available.</p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warn";
}) {
  return (
    <div className="bg-surface-2 rounded-xl px-3 py-2.5">
      <p className="text-[9px] text-ink-3 uppercase tracking-wider truncate">{label}</p>
      <p
        className={cn(
          "text-[15px] font-bold tabular-nums mt-0.5",
          tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "text-ink"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[9px] text-ink-3 truncate">{sub}</p>}
    </div>
  );
}

// ── Drivers ───────────────────────────────────────────────────────────────────

function DriversCard({ brief, loading }: { brief?: TrendBrief; loading: boolean }) {
  return (
    <Card>
      <CardHeader
        icon={Users}
        title="Who is carrying it"
        subtitle="Platform mix and the audience segments producing the posts"
      />
      <CardBody className="space-y-4">
        {loading || !brief ? (
          <Skeleton className="h-48" />
        ) : (
          <>
            <div>
              <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-2">Platforms</p>
              <div className="space-y-2">
                {brief.platforms.slice(0, 6).map((p) => (
                  <div key={p.platform} className="flex items-center gap-2.5">
                    <span className="text-[11px] text-ink-2 w-20 truncate">
                      {p.display_name}
                    </span>
                    <div className="flex-1">
                      <ProgressBar
                        value={p.share}
                        tone={platformColor(p.platform, p.color)}
                        trackClassName="h-1.5"
                      />
                    </div>
                    <span className="text-[11px] text-ink tabular-nums w-10 text-right">
                      {fmtPct(p.share)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {brief.audience.length > 0 && (
              <div className="pt-3 border-t border-bdr">
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-2">
                  Audience segments
                </p>
                <div className="space-y-1.5">
                  {brief.audience.map((a) => (
                    <div
                      key={a.segment_id}
                      className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-2 rounded-lg"
                    >
                      <span className="text-[11px] text-ink-2 flex-1 truncate">{a.label}</span>
                      <span className="text-[11px] font-semibold text-ink tabular-nums">
                        {fmtPct(a.share)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(brief.languages).length > 1 && (
              <div className="pt-3 border-t border-bdr">
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-2">
                  Languages
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(brief.languages).map(([lang, share]) => (
                    <Badge key={lang} tone="neutral">
                      {lang} {fmtPct(share)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Mood ──────────────────────────────────────────────────────────────────────

function MoodCard({ brief, loading }: { brief?: TrendBrief; loading: boolean }) {
  const theme = useChartTheme();

  if (loading || !brief) {
    return (
      <Card>
        <CardHeader icon={Gauge} title="How it feels" />
        <CardBody>
          <Skeleton className="h-48" />
        </CardBody>
      </Card>
    );
  }

  const now = brief.sentiment.current;
  const shift = brief.sentiment.shift;
  const emotions = Object.entries(brief.emotions)
    .filter(([k]) => k !== "neutral" && k !== "unknown")
    .slice(0, 5);

  return (
    <Card>
      <CardHeader
        icon={Gauge}
        title="How it feels"
        subtitle="And whether that is moving"
        actions={<EpistemicBadge kind="inferred" />}
      />
      <CardBody className="space-y-4">
        <div>
          <SentimentBar
            positive={now.positive}
            neutral={now.neutral}
            negative={now.negative}
            height="h-2.5"
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-3">
              {(["positive", "neutral", "negative"] as const).map((key) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: theme.sentimentColor(key) }}
                  />
                  <span className="text-[11px] font-semibold text-ink tabular-nums">
                    {fmtPct(now[key])}
                  </span>
                </span>
              ))}
            </div>
            <span
              className={cn(
                "text-[11px] font-semibold tabular-nums",
                Math.abs(shift) < 0.03
                  ? "text-ink-3"
                  : shift > 0
                  ? "text-danger"
                  : "text-success"
              )}
              title="Change in negative share across the window"
            >
              {Math.abs(shift) < 0.03
                ? "mood stable"
                : `${shift > 0 ? "+" : ""}${(shift * 100).toFixed(1)}pp neg`}
            </span>
          </div>
        </div>

        {emotions.length > 0 && (
          <div className="pt-3 border-t border-bdr">
            <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-2">Emotions</p>
            <div className="space-y-1.5">
              {emotions.map(([emotion, share]) => (
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
                  <span className="text-[11px] text-ink tabular-nums w-10 text-right">
                    {fmtPct(share)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-bdr">
          {[
            { key: "supportive", label: "Support", color: theme.sentiment.positive },
            { key: "neutral", label: "Neutral", color: theme.sentiment.neutral },
            { key: "against", label: "Oppose", color: theme.sentiment.negative },
          ].map((row) => (
            <div key={row.key} className="text-center">
              <p
                className="text-[15px] font-bold tabular-nums"
                style={{ color: row.color }}
              >
                {fmtPct(brief.stances[row.key] ?? 0)}
              </p>
              <p className="text-[9px] text-ink-3 uppercase tracking-wider">{row.label}</p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Posts ─────────────────────────────────────────────────────────────────────

/**
 * The posts behind the numbers.
 *
 * Three orderings because "top" means different things: what travelled, what is
 * being said right now, and the sharpest criticism — which is usually what a
 * policy reader wants and is never what an engagement sort returns.
 */
function PostsCard({
  posts,
  loading,
  order,
  onOrderChange,
}: {
  posts?: TrendPost[];
  loading: boolean;
  order: PostOrder;
  onOrderChange: (order: PostOrder) => void;
}) {
  const theme = useChartTheme();

  return (
    <Card>
      <CardHeader
        icon={MessageSquare}
        title="What people are actually saying"
        subtitle="The posts behind the metrics above"
        actions={
          <Segmented
            value={order}
            onChange={onOrderChange}
            options={[
              { value: "engagement", label: "Top" },
              { value: "recent", label: "Latest" },
              { value: "negative", label: "Critical" },
            ]}
          />
        }
      />
      <CardBody>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : !posts?.length ? (
          <EmptyState
            icon={MessageSquare}
            title={
              order === "negative"
                ? "No negative posts in this window"
                : "No posts found for this trend"
            }
          />
        ) : (
          <div className="space-y-2 stagger">
            {posts.map((post) => (
              <article
                key={post.post_id}
                className="p-3.5 rounded-xl bg-surface-2 hover:bg-surface-3 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: platformColor(post.platform, post.platform_color),
                    }}
                  />
                  <span className="text-[11px] text-ink-2 capitalize">{post.platform}</span>
                  <span className="text-[11px] text-ink-3 font-mono">·{post.author}</span>
                  {post.geo_hint && (
                    <span className="text-[11px] text-ink-3">· {post.geo_hint}</span>
                  )}
                  {post.language && post.language !== "en" && (
                    <Badge tone="neutral">{post.language}</Badge>
                  )}
                  <span className="text-[10px] text-ink-3 ml-auto">
                    {new Date(post.post_ts).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <p className="text-[13px] text-ink leading-relaxed">{post.content}</p>

                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  {post.sentiment && (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: theme.sentimentColor(post.sentiment) }}
                    >
                      {post.sentiment}
                    </span>
                  )}
                  {post.emotion && post.emotion !== "neutral" && (
                    <span
                      className="text-[10px] capitalize"
                      style={{ color: theme.emotionColor(post.emotion) }}
                    >
                      {post.emotion}
                    </span>
                  )}
                  {post.stance && post.stance !== "neutral" && (
                    <span className="text-[10px] text-ink-3">stance: {post.stance}</span>
                  )}
                  {post.sarcasm_flag && (
                    <Badge tone="warn">sarcasm — surface reading inverted</Badge>
                  )}

                  {/*
                    Raw counts, not the composite score: the score clamps at 1.00,
                    so on a list of top posts it reads "1.00" for every row and
                    differentiates nothing. Reach is what separates them.
                  */}
                  <span className="text-[10px] text-ink-3 tabular-nums ml-auto">
                    {fmtNumber(post.engagement_raw.likes ?? 0)} likes ·{" "}
                    {fmtNumber(post.engagement_raw.shares ?? 0)} shares ·{" "}
                    {fmtNumber(post.engagement_raw.comments ?? 0)} replies
                  </span>
                  {post.engagement_raw.views != null && (
                    <Badge tone="brand">{fmtNumber(post.engagement_raw.views)} views</Badge>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Keywords ──────────────────────────────────────────────────────────────────

function KeywordsCard({
  keywords,
  loading,
}: {
  keywords?: import("@/lib/api").ViralKeyword[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        icon={Flame}
        title="Accelerating language"
        subtitle="Terms running hottest against their own baseline, across every trend"
      />
      <CardBody>
        {loading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24" />
            ))}
          </div>
        ) : !keywords?.length ? (
          <EmptyState icon={Flame} title="No keyword lift in the recent window" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <span
                key={`${kw.trend_id}-${kw.keyword}`}
                title={kw.trend_name ? `From: ${kw.trend_name}` : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                  kw.is_new
                    ? "border-accent/30 bg-accent/[0.08] text-accent"
                    : "border-bdr bg-surface-2 text-ink-2"
                )}
              >
                {kw.is_hashtag ? "#" : ""}
                {kw.keyword}
                <span className="text-[10px] font-bold text-success tabular-nums">
                  {kw.lift >= 10 ? "10x+" : `${kw.lift.toFixed(1)}x`}
                </span>
              </span>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
