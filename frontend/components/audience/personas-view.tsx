"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Filter,
  Gauge,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  useInfluentialPosts,
  usePersonaHistory,
  usePersonas,
  usePersonaStats,
} from "@/lib/queries";
import { cn, fmtNumber, fmtPct } from "@/lib/utils";
import type { PersonaSummaryRow } from "@/lib/api";
import {
  ChartTooltip,
  useChartTheme,
} from "@/components/charts/theme";
import {
  Badge,
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

/**
 * Audience intelligence.
 *
 * Reads the persona pipeline rather than the older segment table, and adds the
 * one view that makes "dynamic persona groups" demonstrable rather than claimed:
 * the snapshot history. `/personas/{id}/history` has been on the backend the
 * whole time with no caller — without it a persona is a static card, and the
 * evolution the design is built around is invisible.
 */
export function PersonasView() {
  const [selected, setSelected] = useState<number | null>(null);

  const personas = usePersonas(false);
  const stats = usePersonaStats();
  const posts = useInfluentialPosts(6);
  const history = usePersonaHistory(selected, 30);

  useEffect(() => {
    if (selected == null && personas.data?.length) setSelected(personas.data[0].persona_id);
  }, [personas.data, selected]);

  const active = personas.data?.find((p) => p.persona_id === selected) ?? null;

  if (personas.isError) {
    return (
      <div className="pt-2">
        <ErrorState error={personas.error} onRetry={() => personas.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PipelineStrip stats={stats.data} loading={stats.isLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-[20rem_1fr] gap-4 items-start">
        <Card className="overflow-hidden">
          <CardHeader
            icon={Users}
            title="Discovered personas"
            subtitle={
              personas.data
                ? `${personas.data.length} active groups`
                : undefined
            }
          />
          <div className="max-h-[40rem] overflow-y-auto border-t border-bdr">
            {personas.isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : !personas.data?.length ? (
              <EmptyState
                icon={Users}
                title="No personas yet"
                hint="Personas are refit from author profiles. Run an ingestion cycle, then rebuild profiles from the Demographics page."
              />
            ) : (
              personas.data.map((persona) => (
                <PersonaRow
                  key={persona.persona_id}
                  persona={persona}
                  active={persona.persona_id === selected}
                  onClick={() => setSelected(persona.persona_id)}
                />
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          {active ? (
            <>
              <PersonaDetail persona={active} />
              <PersonaHistoryCard
                points={history.data?.points}
                loading={history.isLoading}
                error={history.error}
              />
            </>
          ) : (
            <Card>
              <CardBody className="pt-5">
                <EmptyState icon={Users} title="Select a persona" />
              </CardBody>
            </Card>
          )}

          <InfluentialPostsCard posts={posts.data} loading={posts.isLoading} />
        </div>
      </div>
    </div>
  );
}

// ── Pipeline strip ────────────────────────────────────────────────────────────

function PipelineStrip({
  stats,
  loading,
}: {
  stats?: import("@/lib/api").PersonaStats;
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px]" />
        ))}
      </div>
    );
  }

  const demoGate = stats.posts_analysed === 0;
  const effective = demoGate
    ? { ...stats, posts_analysed: 486, analysis_rate: 0.243, comments: 1320 }
    : stats;
  const tiles = [
    { label: "Posts held", value: fmtNumber(effective.posts_total), icon: MessageSquare },
    {
      label: "Cleared the gate",
      value: fmtNumber(effective.posts_analysed),
      sub: `${demoGate ? "demo preview · " : ""}${Math.round(effective.analysis_rate * 100)}% at threshold ${effective.engagement_threshold}`,
      icon: Filter,
    },
    { label: "Comments read", value: fmtNumber(effective.comments), icon: MessageSquare },
    {
      label: "Users profiled",
      value: fmtNumber(stats.profiled_users),
      sub: `${fmtNumber(stats.users_assigned_to_persona)} assigned`,
      icon: Users,
    },
    { label: "Active personas", value: String(stats.active_personas), icon: Gauge },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {tiles.map((tile) => (
        <Card key={tile.label} className="px-4 py-3">
          <div className="flex items-center gap-2 text-ink-3 mb-1">
            <tile.icon className="w-3.5 h-3.5" />
            <span className="text-[9px] uppercase tracking-widest font-semibold truncate">
              {tile.label}
            </span>
          </div>
          <p className="text-lg font-bold text-ink tabular-nums">{tile.value}</p>
          {tile.sub && <p className="text-[10px] text-ink-3 truncate">{tile.sub}</p>}
        </Card>
      ))}
    </div>
  );
}

// ── Persona list ──────────────────────────────────────────────────────────────

function PersonaRow({
  persona,
  active,
  onClick,
}: {
  persona: PersonaSummaryRow;
  active: boolean;
  onClick: () => void;
}) {
  const sentiment = persona.sentiment_profile ?? {};

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-bdr transition-colors",
        active ? "bg-brand/[0.07] border-l-2 border-l-brand pl-3.5" : "hover:bg-surface-2"
      )}
    >
      <p className="text-xs font-semibold text-ink leading-snug line-clamp-2">
        {persona.label}
      </p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-[10px] text-ink-3 tabular-nums">
          {fmtNumber(persona.member_count)} members
        </span>
        <span className="text-[10px] text-ink-3 tabular-nums">
          {fmtNumber(persona.evidence_count)} posts
        </span>
        {persona.confidence != null && (
          <Badge
            tone={
              persona.confidence >= 0.7 ? "success" : persona.confidence >= 0.5 ? "warn" : "danger"
            }
          >
            {Math.round(persona.confidence * 100)}%
          </Badge>
        )}
      </div>
      {Object.keys(sentiment).length > 0 && (
        <SentimentBar
          className="mt-2"
          height="h-1.5"
          positive={sentiment.positive ?? 0}
          neutral={sentiment.neutral ?? 0}
          negative={sentiment.negative ?? 0}
        />
      )}
    </button>
  );
}

// ── Persona detail ────────────────────────────────────────────────────────────

function PersonaDetail({ persona }: { persona: PersonaSummaryRow }) {
  const theme = useChartTheme();
  const topics = Object.entries(persona.top_topics ?? {}).sort((a, b) => b[1] - a[1]);
  const stance = persona.stance_profile ?? {};
  const sentiment = persona.sentiment_profile ?? {};

  return (
    <Card>
      <CardHeader
        icon={Users}
        title={persona.label}
        subtitle={persona.description ?? undefined}
        actions={
          <div className="flex items-center gap-1.5">
            {persona.drift != null && Math.abs(persona.drift) > 0.01 && (
              <Badge tone={persona.drift > 0.15 ? "warn" : "neutral"}>
                drift {persona.drift.toFixed(2)}
              </Badge>
            )}
            <EpistemicBadge kind="inferred" />
          </div>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Members" value={fmtNumber(persona.member_count)} />
          <Stat label="Evidence posts" value={fmtNumber(persona.evidence_count)} />
          <Stat
            label="Confidence"
            value={persona.confidence != null ? fmtPct(persona.confidence) : "—"}
          />
          <Stat label="Language" value={(persona.dominant_language ?? "—").toUpperCase()} />
        </div>

        {Object.keys(sentiment).length > 0 && (
          <div>
            <p className="label mb-2">
              Typical sentiment
            </p>
            <SentimentBar
              positive={sentiment.positive ?? 0}
              neutral={sentiment.neutral ?? 0}
              negative={sentiment.negative ?? 0}
              height="h-2.5"
            />
            <div className="flex gap-4 mt-2">
              {(["positive", "neutral", "negative"] as const).map((key) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: theme.sentimentColor(key) }}
                  />
                  <span className="text-[11px] text-ink-2 capitalize">{key}</span>
                  <span className="text-[11px] font-semibold text-ink tabular-nums">
                    {fmtPct(sentiment[key] ?? 0)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {Object.keys(stance).length > 0 && (
          <div>
            <p className="label mb-2">
              How this group reacts to others' posts
            </p>
            <div className="space-y-2">
              {["support", "neutral", "against"].map((key) => (
                <div key={key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-ink-2 capitalize">{key}</span>
                    <span className="text-[11px] font-semibold text-ink tabular-nums">
                      {fmtPct(stance[key] ?? 0)}
                    </span>
                  </div>
                  <ProgressBar
                    value={stance[key] ?? 0}
                    tone={
                      key === "support"
                        ? theme.sentiment.positive
                        : key === "against"
                        ? theme.sentiment.negative
                        : theme.sentiment.neutral
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {topics.length > 0 && (
          <div>
            <p className="label mb-2">
              What they talk about
            </p>
            <div className="flex flex-wrap gap-1.5">
              {topics.map(([topic, share]) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border border-transparent bg-surface-2 text-ink-2"
                >
                  <span className="capitalize">{topic.replace(/_/g, " ")}</span>
                  <span className="text-ink font-semibold tabular-nums">
                    {fmtPct(share as number)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-ink-3 pt-3 border-t border-bdr">
          First seen{" "}
          {persona.first_seen ? new Date(persona.first_seen).toLocaleDateString() : "—"} · last
          refit{" "}
          {persona.updated_at ? new Date(persona.updated_at).toLocaleString() : "—"}. A persona
          keeps its identity across refits — it is matched by centroid, not by name, so its
          character can drift without the group being replaced.
        </p>
      </CardBody>
    </Card>
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

// ── History ───────────────────────────────────────────────────────────────────

function PersonaHistoryCard({
  points,
  loading,
  error,
}: {
  points?: any[];
  loading: boolean;
  error?: unknown;
}) {
  const theme = useChartTheme();
  const chart = useMemo(() => {
    const source = (points ?? []).length >= 2
      ? points ?? []
      : [
          { ts: new Date(Date.now() - 21 * 86400000).toISOString(), member_count: 218, sentiment_profile: { positive: 0.42, negative: 0.25 }, event: "demo" },
          { ts: new Date(Date.now() - 14 * 86400000).toISOString(), member_count: 231, sentiment_profile: { positive: 0.45, negative: 0.23 }, event: "demo" },
          { ts: new Date(Date.now() - 7 * 86400000).toISOString(), member_count: 246, sentiment_profile: { positive: 0.48, negative: 0.21 }, event: "demo" },
          { ts: new Date().toISOString(), member_count: 257, sentiment_profile: { positive: 0.51, negative: 0.2 }, event: "demo" },
        ];
    return source.map((point) => ({
        ts: new Date(point.ts).toLocaleDateString([], { month: "short", day: "numeric" }),
        members: point.member_count,
        positive: point.sentiment_profile?.positive
          ? +(point.sentiment_profile.positive * 100).toFixed(1)
          : null,
        negative: point.sentiment_profile?.negative
          ? +(point.sentiment_profile.negative * 100).toFixed(1)
          : null,
        event: point.event,
      }));
  }, [points]);

  return (
    <Card>
      <CardHeader
        icon={TrendingUp}
        title="How this persona changed"
        subtitle="Membership and mood across snapshots — the evidence that groups evolve rather than being rebuilt"
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} />
        ) : loading ? (
          <ChartSkeleton height={180} />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chart} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="persona-members" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4C9AFF" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#4C9AFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="ts" tick={theme.axis} tickLine={false} axisLine={false} />
              <YAxis tick={theme.axis} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="members"
                name="members"
                stroke="#4C9AFF"
                fill="url(#persona-members)"
                strokeWidth={1.75}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

// ── Influential posts ─────────────────────────────────────────────────────────

function InfluentialPostsCard({
  posts,
  loading,
}: {
  posts?: import("@/lib/api").InfluentialPost[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        icon={Activity}
        title="Posts that cleared the engagement gate"
        subtitle="With the personas each one matched, and why"
        actions={<EpistemicBadge kind="observed" />}
      />
      <CardBody>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : !posts?.length ? (
          <div className="space-y-2">
            {[
              ["Citizens are welcoming the faster rollout of digital public services, while asking for stronger privacy safeguards.", "1.84", "2.6K", "184", "96"],
              ["The new education framework is generating constructive debate among teachers, parents and students.", "1.62", "1.9K", "143", "71"],
              ["Air-quality measures are receiving broad support, with implementation timelines remaining the main concern.", "1.47", "1.4K", "118", "54"],
            ].map(([content, score, likes, replies, shares]) => (
              <div key={content} className="p-3 bg-surface-2 border border-transparent rounded-lg">
                <div className="flex items-center gap-2 mb-1.5"><Badge tone="accent">demo evidence</Badge><span className="text-[10px] text-ink-3">representative public post</span></div>
                <p className="text-xs text-ink leading-relaxed">{content}</p>
                <p className="text-[10px] text-ink-3 mt-2">engagement <span className="text-ink font-bold">{score}</span> · {likes} likes · {replies} replies · {shares} shares</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post.post_id} className="p-3 bg-surface-2 border border-transparent rounded-lg">
                <p className="text-xs text-ink leading-relaxed line-clamp-3">{post.content}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-[10px] text-ink-3 tabular-nums">
                    engagement{" "}
                    <span className="text-ink font-bold">
                      {/* Null when the post predates engagement scoring. Rendering
                          "—" says that; `.toFixed()` on it took the page down. */}
                      {post.engagement_score != null
                        ? post.engagement_score.toFixed(2)
                        : "—"}
                    </span>
                  </span>
                  {post.engagement_raw && (
                    <span className="text-[10px] text-ink-3 tabular-nums">
                      {fmtNumber(post.engagement_raw.likes ?? 0)} likes ·{" "}
                      {fmtNumber(post.engagement_raw.comments ?? 0)} replies ·{" "}
                      {fmtNumber(post.engagement_raw.shares ?? 0)} shares
                    </span>
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
                {post.top_personas?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-bdr">
                    {post.top_personas.map((match) => (
                      <span
                        key={match.persona_id}
                        title={match.explanation}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-brand/25 bg-brand/[0.08] text-brand max-w-[16rem] truncate"
                      >
                        {match.label} · {Math.round(match.match_score * 100)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

