"use client";

import { useMemo, useState } from "react";
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
  AlertTriangle,
  Cpu,
  Gauge,
  Languages,
  MessageSquare,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";

import {
  useAnalyseText,
  useEmotions,
  useEmotionTimeline,
  useModelStatus,
  useSentimentTimeline,
} from "@/lib/queries";
import { cn, fmtPct } from "@/lib/utils";
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
  Delta,
  EmptyState,
  EpistemicBadge,
  ErrorState,
  ProgressBar,
  Segmented,
  Skeleton,
  StatusDot,
} from "@/components/ui";

const WINDOWS = [
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 168, label: "7d" },
];

/** Text worth pasting, because the interesting behaviour is not obvious. */
const EXAMPLES = [
  {
    label: "Sarcasm",
    text: "Great, another brilliant scheme from the government. Thanks a lot 🙄",
    why: "Surface praise with a sarcastic marker — polarity reads positive, stance resolves to against.",
  },
  {
    label: "Hindi",
    text: "पेट्रोल ₹112 प्रति लीटर — यह अन्याय है, हम विरोध करते हैं।",
    why: "Devanagari script, outrage and an explicit against stance.",
  },
  {
    label: "Mixed signal",
    text: "Finally someone is fixing this terrible mess, I support it",
    why: "Negative wording, supportive stance — the two axes genuinely disagree.",
  },
  {
    label: "Tamil",
    text: "புதிய மெட்ரோ வழித்தடம் அற்புதம், பயண நேரம் குறைந்தது",
    why: "Tamil script, joy, supportive.",
  },
];

export default function SentimentPage() {
  const [hours, setHours] = useState(24);
  const [text, setText] = useState("");

  const timeline = useSentimentTimeline(hours);
  const emotions = useEmotions(hours);
  const emotionSeries = useEmotionTimeline(Math.max(hours, 48));
  const models = useModelStatus();
  const analyse = useAnalyseText();

  return (
    <div className="p-5 lg:p-6 space-y-5 animate-fade-up">
      <AnalyserCard
        text={text}
        setText={setText}
        analyse={analyse}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-3 uppercase tracking-widest font-semibold">
          Corpus-wide affect
        </p>
        <Segmented value={hours} options={WINDOWS} onChange={setHours} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <PolarityCard
          points={timeline.data}
          loading={timeline.isLoading}
          error={timeline.error}
          onRetry={() => timeline.refetch()}
          hours={hours}
          className="xl:col-span-2"
        />
        <QualifierCard
          breakdown={emotions.data}
          loading={emotions.isLoading}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <EmotionMixCard breakdown={emotions.data} loading={emotions.isLoading} />
        <EmotionDriftCard points={emotionSeries.data} loading={emotionSeries.isLoading} />
      </div>

      <ModelCard statuses={models.data} loading={models.isLoading} />
    </div>
  );
}

// ── Live analyser ─────────────────────────────────────────────────────────────

function AnalyserCard({
  text,
  setText,
  analyse,
}: {
  text: string;
  setText: (value: string) => void;
  analyse: ReturnType<typeof useAnalyseText>;
}) {
  const theme = useChartTheme();
  const result = analyse.data;

  return (
    <Card>
      <CardHeader
        icon={Wand2}
        title="Analyse any text"
        subtitle="Four axes at once — polarity, emotion, stance and sarcasm — in any supported script"
        actions={<EpistemicBadge kind="inferred" />}
      />
      <CardBody className="space-y-3">
        <div className="flex gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Submitting a multi-line textarea with a bare Enter would make it
              // impossible to type a paragraph; the modifier keeps both usable.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
                analyse.mutate({ text });
              }
            }}
            rows={3}
            placeholder="Paste a post in any language… (⌘/Ctrl + Enter to analyse)"
            className="flex-1 bg-surface-2 border border-transparent rounded-lg px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-brand/60 resize-none transition-colors"
          />
          <Button
            variant="primary"
            onClick={() => text.trim() && analyse.mutate({ text })}
            loading={analyse.isPending}
            disabled={!text.trim()}
            className="self-end px-4 py-2.5 text-sm"
          >
            {analyse.isPending ? null : <Send className="w-4 h-4" />}
            Analyse
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-ink-3 uppercase tracking-widest mr-1">
            Try
          </span>
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              title={example.why}
              onClick={() => {
                setText(example.text);
                analyse.mutate({ text: example.text });
              }}
              className="text-[11px] px-2 py-1 rounded-full border border-transparent bg-surface-2 text-ink-2 hover:text-ink hover:border-bdr-strong transition-colors"
            >
              {example.label}
            </button>
          ))}
        </div>

        {analyse.isError && <ErrorState error={analyse.error} />}

        {result && (
          <div className="space-y-3 pt-3 border-t border-bdr">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Axis
                label="Polarity"
                value={result.sentiment}
                score={result.sentiment_score}
                color={
                  result.sentiment === "positive"
                    ? theme.sentiment.positive
                    : result.sentiment === "negative"
                    ? theme.sentiment.negative
                    : theme.sentiment.neutral
                }
              />
              <Axis
                label="Emotion"
                value={result.emotion ?? "—"}
                score={result.emotion_score ?? undefined}
                color={theme.emotionColor(result.emotion ?? "neutral")}
              />
              <Axis
                label="Intensity"
                value={result.intensity != null ? result.intensity.toFixed(2) : "—"}
                color="#E08A1E"
              />
              <Axis
                label="Sarcasm"
                value={result.sarcasm_flag ? "likely" : "no"}
                score={result.sarcasm_conf ?? undefined}
                color={result.sarcasm_flag ? "#C77DFF" : theme.sentiment.neutral}
              />
              <Axis label="Language" value={result.language.toUpperCase()} color="#4C9AFF" />
            </div>

            {/*
              The epistemic note is the point of this panel, not a footnote. When
              sarcasm fires, the polarity head is reading the surface text and is
              *meant* to disagree with the resolved stance — saying so is what
              stops a reader treating the positive label as the answer.
            */}
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 border text-xs",
                result.sarcasm_flag
                  ? "bg-warn/8 border-warn/25 text-warn"
                  : "bg-bg border-bdr text-ink-2"
              )}
            >
              {result.sarcasm_flag && (
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">{result.epistemic_note}</p>
                {result.sarcasm_flag && (
                  <p className="text-ink-2 mt-1 leading-relaxed">
                    The polarity above describes the surface wording, which really is
                    praise-shaped. Downstream, the sarcasm flag inverts it — this post is
                    stored with an <span className="font-semibold">against</span> stance.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Axis({
  label,
  value,
  score,
  color,
}: {
  label: string;
  value: string;
  score?: number;
  color: string;
}) {
  return (
    <div className="bg-surface-2 border border-transparent rounded-lg p-3">
      <p className="text-[9px] text-ink-3 uppercase tracking-widest">{label}</p>
      <p className="text-sm font-bold capitalize mt-0.5" style={{ color }}>
        {value}
      </p>
      {score != null && (
        <>
          <ProgressBar value={score} tone={color} className="mt-1.5" />
          <p className="text-[10px] text-ink-3 tabular-nums mt-0.5">{fmtPct(score)}</p>
        </>
      )}
    </div>
  );
}

// ── Polarity over time ────────────────────────────────────────────────────────

function PolarityCard({
  points,
  loading,
  error,
  onRetry,
  hours,
  className,
}: {
  points?: import("@/lib/api").TimePoint[];
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  hours: number;
  className?: string;
}) {
  const theme = useChartTheme();
  const chart = useMemo(
    () =>
      (points ?? []).map((p) => ({
        time: new Date(p.timestamp).toLocaleString([], {
          hour: "2-digit",
          minute: "2-digit",
          ...(hours > 48 ? { month: "short", day: "numeric" } : {}),
        }),
        positive: p.positive == null ? null : +(p.positive * 100).toFixed(1),
        neutral: p.neutral == null ? null : +(p.neutral * 100).toFixed(1),
        negative: p.negative == null ? null : +(p.negative * 100).toFixed(1),
        volume: p.volume,
      })),
    [points, hours]
  );

  const measured = chart.filter((p) => p.positive != null);
  const firstHalf = measured.slice(0, Math.floor(measured.length / 2));
  const secondHalf = measured.slice(Math.floor(measured.length / 2));
  const mean = (rows: typeof measured, key: "positive" | "negative") =>
    rows.length ? rows.reduce((sum, r) => sum + (r[key] ?? 0), 0) / rows.length : 0;

  return (
    <Card className={className}>
      <CardHeader
        icon={Gauge}
        title={`Polarity over ${hours >= 168 ? "7 days" : `${hours} hours`}`}
        subtitle={
          measured.length
            ? `${measured.length} of ${chart.length} buckets carry analysed posts`
            : undefined
        }
        actions={
          measured.length > 4 ? (
            <div className="text-right">
              <p className="text-[9px] text-ink-3 uppercase tracking-widest">
                Negative, 2nd half vs 1st
              </p>
              <Delta
                current={mean(secondHalf, "negative")}
                previous={mean(firstHalf, "negative")}
                invert
                className="justify-end"
              />
            </div>
          ) : undefined
        }
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : loading ? (
          <ChartSkeleton height={232} />
        ) : measured.length < 2 ? (
          <EmptyState
            icon={MessageSquare}
            title="Not enough analysed history"
            hint="Sentiment history is built from posts that have been through the NLP pass."
          />
        ) : (
          <ResponsiveContainer width="100%" height={232}>
            <AreaChart data={chart} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
              <defs>
                {(["positive", "negative"] as const).map((key) => (
                  <linearGradient key={key} id={`sent-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.sentimentColor(key)} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={theme.sentimentColor(key)} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="time"
                tick={theme.axis}
                tickLine={false}
                axisLine={false}
                interval={Math.max(1, Math.floor(chart.length / 8))}
              />
              <YAxis tick={theme.axis} tickLine={false} axisLine={false} unit="%" width={40} />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v) => `${v}%`}
                    footer={(payload) => (
                      <p className="text-[10px] text-ink-3">
                        {payload[0]?.payload?.volume ?? 0} posts in this bucket
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
                fill="url(#sent-positive)"
                strokeWidth={1.75}
                dot={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="negative"
                name="Negative"
                stroke={theme.sentiment.negative}
                fill="url(#sent-negative)"
                strokeWidth={1.75}
                dot={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="neutral"
                name="Neutral"
                stroke={theme.sentiment.neutral}
                fill="none"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

// ── Stance / sarcasm qualifiers ───────────────────────────────────────────────

function QualifierCard({
  breakdown,
  loading,
}: {
  breakdown?: import("@/lib/api").EmotionBreakdown;
  loading: boolean;
}) {
  const theme = useChartTheme();
  if (loading || !breakdown) {
    return (
      <Card>
        <CardHeader icon={Gauge} title="Stance & reliability" />
        <CardBody>
          <Skeleton className="h-[232px]" />
        </CardBody>
      </Card>
    );
  }

  const stance = breakdown.stance ?? {};
  const rows = [
    { key: "supportive", label: "Supportive", color: theme.sentiment.positive },
    { key: "neutral", label: "Neutral", color: theme.sentiment.neutral },
    { key: "against", label: "Against", color: theme.sentiment.negative },
  ];

  return (
    <Card>
      <CardHeader
        icon={Gauge}
        title="Stance & reliability"
        subtitle="Stance is a separate axis from polarity"
      />
      <CardBody className="space-y-4">
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-ink-2">{row.label}</span>
                <span className="text-[11px] font-semibold text-ink tabular-nums">
                  {fmtPct(stance[row.key] ?? 0)}
                </span>
              </div>
              <ProgressBar value={stance[row.key] ?? 0} tone={row.color} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-bdr">
          <div className="bg-surface-2 border border-transparent rounded-lg px-3 py-2">
            <p className="text-[9px] text-ink-3 uppercase tracking-widest">Sarcasm rate</p>
            <p
              className={cn(
                "text-sm font-bold tabular-nums mt-0.5",
                breakdown.sarcasm_rate > 0.08 ? "text-warn" : "text-ink"
              )}
            >
              {fmtPct(breakdown.sarcasm_rate)}
            </p>
          </div>
          <div className="bg-surface-2 border border-transparent rounded-lg px-3 py-2">
            <p className="text-[9px] text-ink-3 uppercase tracking-widest">Mean intensity</p>
            <p className="text-sm font-bold text-ink tabular-nums mt-0.5">
              {breakdown.mean_intensity.toFixed(2)}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-bdr pt-3">
          {breakdown.epistemic_note}
        </p>
      </CardBody>
    </Card>
  );
}

// ── Emotion mix ───────────────────────────────────────────────────────────────

function EmotionMixCard({
  breakdown,
  loading,
}: {
  breakdown?: import("@/lib/api").EmotionBreakdown;
  loading: boolean;
}) {
  const theme = useChartTheme();
  const rows = useMemo(
    () =>
      Object.entries(breakdown?.emotions ?? {})
        .filter(([key]) => key !== "unknown")
        .sort((a, b) => b[1] - a[1])
        .map(([emotion, share]) => ({
          emotion,
          share: +(share * 100).toFixed(1),
          color: theme.emotionColor(emotion),
        })),
    [breakdown]
  );

  return (
    <Card>
      <CardHeader
        icon={Sparkles}
        title="Emotion distribution"
        subtitle="The full twelve-class taxonomy, not just polarity"
        hint={breakdown ? `${breakdown.analysed_posts.toLocaleString()} posts` : undefined}
      />
      <CardBody>
        {loading ? (
          <ChartSkeleton height={240} />
        ) : !rows.length ? (
          <EmptyState icon={Sparkles} title="No emotion signal in this window" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 18, left: 2, bottom: 0 }}
            >
              <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" horizontal={false} />
              <XAxis
                type="number"
                tick={theme.axis}
                tickLine={false}
                axisLine={false}
                unit="%"
              />
              <YAxis
                type="category"
                dataKey="emotion"
                tick={{ ...theme.axis, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                cursor={{ fill: "rgba(230,236,245,0.04)" }}
                content={<ChartTooltip formatter={(v) => `${v}%`} />}
              />
              <Bar dataKey="share" name="share" radius={[0, 3, 3, 0]}>
                {rows.map((row) => (
                  <Cell key={row.emotion} fill={row.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

// ── Emotion drift ─────────────────────────────────────────────────────────────

function EmotionDriftCard({
  points,
  loading,
}: {
  points?: any[];
  loading: boolean;
}) {
  const theme = useChartTheme();
  const { chart, series } = useMemo(() => {
    const rows = points ?? [];
    const totals: Record<string, number> = {};
    for (const point of rows) {
      for (const [emotion, share] of Object.entries(point.shares ?? {})) {
        if (emotion === "unknown") continue;
        totals[emotion] = (totals[emotion] ?? 0) + (share as number);
      }
    }
    // Plot the five emotions that actually carry the conversation. Drawing all
    // twelve produces a hairball in which no single line is readable, and
    // "neutral" would dominate every one of them.
    const top = Object.entries(totals)
      .filter(([emotion]) => emotion !== "neutral")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emotion]) => emotion);

    return {
      series: top,
      chart: rows.map((point) => {
        const row: Record<string, any> = {
          time: new Date(point.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          total: point.total,
        };
        for (const emotion of top) {
          const value = point.shares?.[emotion];
          row[emotion] = value == null ? null : +(value * 100).toFixed(1);
        }
        return row;
      }),
    };
  }, [points]);

  return (
    <Card>
      <CardHeader
        icon={Sparkles}
        title="Emotion drift"
        subtitle="How each feeling's share of the conversation moved"
      />
      <CardBody>
        {loading ? (
          <ChartSkeleton height={240} />
        ) : chart.length < 3 ? (
          <EmptyState icon={Sparkles} title="Not enough history for a drift view" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={216}>
              <AreaChart data={chart} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={theme.axis}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(1, Math.floor(chart.length / 7))}
                />
                <YAxis tick={theme.axis} tickLine={false} axisLine={false} unit="%" width={40} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                {series.map((emotion) => (
                  <Area
                    key={emotion}
                    type="monotone"
                    dataKey={emotion}
                    name={emotion}
                    stroke={theme.emotionColor(emotion)}
                    fill="none"
                    strokeWidth={1.6}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-1">
              {series.map((emotion) => (
                <span
                  key={emotion}
                  className="inline-flex items-center gap-1.5 text-[10px] text-ink-3"
                >
                  <span
                    className="w-2.5 h-0.5 rounded-full"
                    style={{ background: theme.emotionColor(emotion) }}
                  />
                  <span className="capitalize">{emotion}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Model state ───────────────────────────────────────────────────────────────

const MODEL_META: Record<string, { label: string; note: string }> = {
  sentiment: { label: "Sentiment", note: "XLM-RoBERTa · 50+ languages" },
  emotion: { label: "Emotion", note: "DistilRoBERTa · 12 classes" },
  irony: { label: "Sarcasm", note: "RoBERTa · treat as low confidence" },
  embedding: { label: "Embedding", note: "MiniLM · 384 dimensions" },
};

function ModelCard({
  statuses,
  loading,
}: {
  statuses?: import("@/lib/api").ModelStatus[];
  loading: boolean;
}) {
  const real = statuses?.[0]?.use_real_nlp ?? false;

  return (
    <Card>
      <CardHeader
        icon={Cpu}
        title="NLP pipeline"
        subtitle={
          real
            ? "Transformer models in use"
            : "Rule-based fallback — a lexicon over twelve emotion classes, stance cues and sarcasm markers"
        }
        actions={
          <Badge tone={real ? "success" : "warn"}>
            {real ? "transformer" : "rule-based"}
          </Badge>
        }
      />
      <CardBody>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(statuses ?? []).map((model) => {
              const meta = MODEL_META[model.name] ?? { label: model.name, note: "" };
              return (
                <div key={model.name} className="bg-surface-2 border border-transparent rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[9px] text-ink-3 uppercase tracking-widest">
                      {meta.label}
                    </p>
                    <StatusDot tone={model.loaded ? "success" : model.error ? "danger" : "warn"} />
                  </div>
                  <p className="text-xs font-medium text-ink">
                    {model.loaded ? "Loaded" : model.error ? "Error" : "Not loaded"}
                  </p>
                  <p className="text-[10px] text-ink-3 mt-0.5 line-clamp-2">
                    {model.error ?? meta.note}
                  </p>
                </div>
              );
            })}
            {!statuses?.length && (
              <p className="text-xs text-ink-3 col-span-full">
                Model status unavailable.
              </p>
            )}
          </div>
        )}

        {!real && (
          <p className="text-[11px] text-ink-3 mt-3 pt-3 border-t border-bdr leading-relaxed flex items-start gap-2">
            <Languages className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            The fallback is a real analyser, not a stub: it covers the same twelve
            emotions, the same stance labels and the same sarcasm inversion across
            English and five Indic scripts. It is less accurate on nuance than the
            transformer path, which is why confidence scores are reported alongside
            every label.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
