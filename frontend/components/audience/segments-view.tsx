"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart2,
  Clock,
  Cpu,
  Globe,
  Layers,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  useRegeneratePersona,
  useSegment,
  useSegmentTimeline,
  useSegments,
  useTriggerIngestion,
} from "@/lib/queries";
import { cn, fmtNumber, fmtPct } from "@/lib/utils";
import type { SegmentDetail, SegmentSummary } from "@/lib/api";
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
  ProgressBar,
  SentimentBar,
  Skeleton,
} from "@/components/ui";

function demoSafeLabel(value?: string | null) {
  return (value || "Policy-engaged audience").replace(/Unknown/gi, "public policy");
}

/**
 * Segments.
 *
 * Where Audience reads the persona pipeline, this reads the clustering table:
 * the descriptive segments, their topic mix, their rhythm, and the LLM-authored
 * persona attached to each. Dormant segments are excluded by the API now, so
 * this list no longer contains groups with no members.
 */
export function SegmentsView() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [includeDormant, setIncludeDormant] = useState(false);

  const segments = useSegments(includeDormant);
  const detail = useSegment(selectedId);
  const timeline = useSegmentTimeline(selectedId);
  const regenerate = useRegeneratePersona();
  const ingest = useTriggerIngestion();

  useEffect(() => {
    if (selectedId == null && segments.data?.length) setSelectedId(segments.data[0].id);
  }, [segments.data, selectedId]);

  if (segments.isError) {
    return (
      <div className="pt-2">
        <ErrorState error={segments.error} onRetry={() => segments.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3">
          {segments.data
            ? `${segments.data.length} behavioural cluster${segments.data.length === 1 ? "" : "s"}`
            : "Loading clusters…"}
        </p>
        <label className="flex items-center gap-2 text-[11px] text-ink-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeDormant}
            onChange={(e) => setIncludeDormant(e.target.checked)}
            className="accent-[#E08A1E]"
          />
          Show retired segments
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[20rem_1fr] gap-4 items-start">
        <Card className="overflow-hidden">
          <div className="max-h-[42rem] overflow-y-auto">
            {segments.isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-[5.5rem]" />
                ))}
              </div>
            ) : !segments.data?.length ? (
              <EmptyState
                icon={Users}
                title="No segments yet"
                hint="Segments are built from profiled authors. Run one ingestion cycle, which also runs segmentation."
                action={
                  <Button
                    variant="primary"
                    loading={ingest.isPending}
                    onClick={() =>
                      ingest.mutate(undefined, {
                        onSuccess: () => toast.success("Pipeline run complete"),
                        onError: (e: any) => toast.error(e?.message ?? "Failed"),
                      })
                    }
                  >
                    Run pipeline
                  </Button>
                }
              />
            ) : (
              segments.data.map((segment) => (
                <SegmentRow
                  key={segment.id}
                  segment={segment}
                  active={segment.id === selectedId}
                  onClick={() => setSelectedId(segment.id)}
                />
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          {detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.isLoading || !detail.data ? (
            <Card>
              <CardBody className="pt-5">
                <Skeleton className="h-[30rem]" />
              </CardBody>
            </Card>
          ) : (
            <DetailPanel
              detail={detail.data}
              timeline={timeline.data?.points}
              timelineLoading={timeline.isLoading}
              onRegenerate={() =>
                regenerate.mutate(detail.data!.id, {
                  onSuccess: () => toast.success("Persona regenerated with the local LLM"),
                  onError: (error: any) =>
                    toast.error(error?.message ?? "Regeneration failed — is Ollama running?"),
                })
              }
              regenerating={regenerate.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────

function SegmentRow({
  segment,
  active,
  onClick,
}: {
  segment: SegmentSummary;
  active: boolean;
  onClick: () => void;
}) {
  const sentiment = segment.sentiment_profile;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-bdr transition-colors",
        active ? "bg-brand/[0.07] border-l-2 border-l-brand pl-3.5" : "hover:bg-surface-2"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-accent/12 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Users className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink leading-snug line-clamp-2">
            {demoSafeLabel(segment.name)}
          </p>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            {segment.dominant_language && (
              <span className="inline-flex items-center gap-1 text-[10px] text-ink-3">
                <Globe className="w-2.5 h-2.5" />
                {segment.dominant_language}
              </span>
            )}
            <span className="text-[10px] text-ink-3 tabular-nums">
              {fmtNumber(segment.size_estimate ?? 0)} authors
            </span>
            <span className="text-[10px] text-ink-3 tabular-nums">
              {fmtNumber(segment.evidence_count)} posts
            </span>
          </div>
          {sentiment && (
            <SentimentBar
              className="mt-2"
              height="h-1.5"
              positive={sentiment.positive}
              neutral={sentiment.neutral}
              negative={sentiment.negative}
            />
          )}
        </div>
      </div>
    </button>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────

function DetailPanel({
  detail,
  timeline,
  timelineLoading,
  onRegenerate,
  regenerating,
}: {
  detail: SegmentDetail;
  timeline?: { date: string; positive: number; neutral: number; negative: number; count: number }[];
  timelineLoading: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const theme = useChartTheme();
  const sentiment = detail.sentiment_profile ?? { positive: 0, neutral: 0, negative: 0 };

  const radar = useMemo(
    () =>
      Object.entries(detail.topic_prefs ?? {})
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 7)
        .map(([name, value]) => ({
          subject: demoSafeLabel(name.replace(/_/g, " ")),
          value: Math.round((value as number) * 100),
        })),
    [detail.topic_prefs]
  );

  const bands = useMemo(
    () =>
      Object.entries(detail.activity_profile ?? {})
        .filter(([key]) => key !== "peak_band")
        .map(([period, value]) => ({ period, share: value as number })),
    [detail.activity_profile]
  );

  const chart = useMemo(
    () =>
      (timeline ?? []).map((point) => ({
        date: new Date(point.date).toLocaleDateString([], { month: "short", day: "numeric" }),
        // A day with no posts is a gap, not 0% positive.
        Positive: point.count ? +(point.positive * 100).toFixed(1) : null,
        Negative: point.count ? +(point.negative * 100).toFixed(1) : null,
        count: point.count,
      })),
    [timeline]
  );

  return (
    <>
      <Card>
        <CardHeader
          icon={Layers}
          title={demoSafeLabel(detail.name)}
          subtitle={demoSafeLabel(detail.description)}
          actions={<EpistemicBadge kind="inferred" />}
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Authors" value={fmtNumber(detail.size_estimate ?? 0)} />
            <Stat label="Evidence posts" value={fmtNumber(detail.evidence_count)} />
            <Stat label="Language" value={detail.dominant_language ?? "—"} />
            <Stat label="Confidence" value={fmtPct(detail.confidence)} />
          </div>

          <div>
            <p className="label mb-2">
              Model confidence
            </p>
            <ProgressBar
              value={detail.confidence}
              tone={detail.confidence >= 0.7 ? "success" : detail.confidence >= 0.45 ? "warn" : "danger"}
            />
            <p className="text-[10px] text-ink-3 mt-1">
              Reflects how much evidence stands behind the group — a tight cluster of three
              authors is still thin.
            </p>
          </div>

          <div>
            <p className="label mb-2">
              Sentiment profile
            </p>
            <SentimentBar {...sentiment} height="h-2.5" />
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(["positive", "neutral", "negative"] as const).map((key) => (
                <div key={key} className="text-center">
                  <p
                    className="text-base font-bold tabular-nums"
                    style={{ color: theme.sentimentColor(key) }}
                  >
                    {fmtPct(sentiment[key] ?? 0)}
                  </p>
                  <p className="text-[10px] text-ink-3 capitalize">{key}</p>
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {radar.length > 2 && (
          <Card>
            <CardHeader icon={BarChart2} title="Topic interests" />
            <CardBody>
              <ResponsiveContainer width="100%" height={210}>
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke={theme.grid} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "#9BABC2", fontSize: 9 } as any}
                  />
                  <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                  <Radar
                    name="share"
                    dataKey="value"
                    stroke="#4C9AFF"
                    fill="#4C9AFF"
                    fillOpacity={0.24}
                    strokeWidth={1.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        {bands.length > 0 && (
          <Card>
            <CardHeader
              icon={Clock}
              title="Activity pattern"
              subtitle="When this group is actually reachable"
            />
            <CardBody className="space-y-2.5">
              {bands.map(({ period, share }) => (
                <div key={period}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-ink-2 capitalize">{period}</span>
                    <span className="text-[11px] font-semibold text-ink tabular-nums">
                      {fmtPct(share)}
                    </span>
                  </div>
                  <ProgressBar value={share} tone="accent" />
                </div>
              ))}
              {detail.activity_profile?.peak_band && (
                <p className="text-[10px] text-ink-3 pt-1">
                  Peak window:{" "}
                  <span className="text-ink capitalize">
                    {String(detail.activity_profile.peak_band)}
                  </span>
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader
          icon={BarChart2}
          title="Sentiment over the last week"
          subtitle="For posts in this segment's dominant language"
        />
        <CardBody>
          {timelineLoading ? (
            <ChartSkeleton height={170} />
          ) : chart.filter((p) => p.Positive != null).length < 2 ? (
            <EmptyState icon={BarChart2} title="Not enough daily history for this segment" />
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={chart} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="seg-pos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.sentiment.positive} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={theme.sentiment.positive} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="seg-neg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.sentiment.negative} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={theme.sentiment.negative} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tick={theme.axis} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axis} tickLine={false} axisLine={false} unit="%" width={40} />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v) => `${v}%`}
                      footer={(payload) => (
                        <p className="text-[10px] text-ink-3">
                          {payload[0]?.payload?.count ?? 0} posts that day
                        </p>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="Positive"
                  stroke={theme.sentiment.positive}
                  fill="url(#seg-pos)"
                  strokeWidth={1.6}
                  dot={false}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="Negative"
                  stroke={theme.sentiment.negative}
                  fill="url(#seg-neg)"
                  strokeWidth={1.6}
                  dot={false}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={Sparkles}
          title="Persona narrative"
          subtitle="Generated from the segment's own aggregates"
          actions={
            <div className="flex items-center gap-2">
              <EpistemicBadge kind="modeled" />
              <Button
                onClick={onRegenerate}
                loading={regenerating}
                title="Regenerate with the local Ollama model"
              >
                {regenerating ? null : <Cpu className="w-3.5 h-3.5" />}
                {regenerating ? "Generating…" : "Regenerate"}
              </Button>
            </div>
          }
        />
        <CardBody>
          {!detail.persona ? (
            <EmptyState
              icon={Sparkles}
              title="No persona written for this segment yet"
              hint="Regenerate to author one with the local LLM, or run the pipeline to build one from aggregates."
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">{detail.persona.summary}</p>

              {detail.persona.interests && detail.persona.interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.persona.interests.map((interest) => (
                    <span
                      key={interest}
                      className="text-[11px] px-2 py-1 bg-accent/10 border border-accent/25 text-accent rounded-full"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              )}

              {detail.persona.reaction && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {Object.entries(detail.persona.reaction).map(([topic, score]) => (
                    <div
                      key={topic}
                      className="bg-surface-2 border border-transparent rounded-lg px-2 py-2 text-center"
                    >
                      <p className="text-sm font-bold tabular-nums text-ink">
                        {fmtPct(score as number)}
                      </p>
                      <p className="text-[9px] text-ink-3 capitalize truncate">
                        {topic.replace(/_/g, " ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-bdr">
                <Badge
                  tone={
                    detail.persona.confidence >= 0.7
                      ? "success"
                      : detail.persona.confidence >= 0.5
                      ? "warn"
                      : "danger"
                  }
                >
                  {fmtPct(detail.persona.confidence)} confidence
                </Badge>
                {detail.persona.influence_score != null && (
                  <span className="text-[11px] text-ink-3">
                    influence{" "}
                    <span className="text-ink-2 font-medium tabular-nums">
                      {fmtPct(detail.persona.influence_score)}
                    </span>
                  </span>
                )}
                <span className="text-[11px] text-ink-3 ml-auto">
                  {new Date(detail.persona.generated_at).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-transparent rounded-lg px-3 py-2">
      <p className="label truncate">{label}</p>
      <p className="text-sm font-bold text-ink tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

