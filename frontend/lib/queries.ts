"use client";

import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  dashboardApi,
  demographicsApi,
  diffusionApi,
  emotionApi,
  forecastApi,
  ingestApi,
  networkApi,
  ollamaApi,
  personaApi,
  personaExtraApi,
  segmentsApi,
  sentimentApi,
  timelineApi,
  trendsApi,
  type ActivityTimeline,
  type Cascade,
  type CoverageRow,
  type DashboardSummary,
  type DemographicsOverview,
  type DiffusionResult,
  type EmotionBreakdown,
  type IngestionRun,
  type IngestionStats,
  type IngestionState,
  type InfluentialPost,
  type LiveFeedItem,
  type ModelStatus,
  type NetworkGraph,
  type OllamaStatus,
  type PersonaStats,
  type PersonaSummaryRow,
  type ProfilingCoverage,
  type RedditHistoricalState,
  type RisingTrend,
  type SegmentDetail,
  type SegmentSummary,
  type SpreadSummary,
  type TimePoint,
  type TrendDetail,
  type TrendHistory,
  type TrendSummary,
  type ViralKeyword,
} from "./api";

/**
 * Every server read in one place, keyed consistently.
 *
 * Two things this buys that per-page `useEffect` could not: a shared cache, so
 * the segment list fetched on Audience is already warm on Segments; and one
 * honest definition of "how live is this view", expressed as a refetch interval
 * per data shape rather than an interval copied into whichever page remembered
 * to add one.
 */

// ── Refresh cadences ──────────────────────────────────────────────────────────
// Chosen from how fast the underlying data can actually change. Connector health
// and the overview move with ingestion; a persona refit or a demographic rebuild
// is an operator action, so polling those would be wasted requests.
const LIVE = 30_000;
const FREQUENT = 60_000;
const SLOW = 5 * 60_000;

export const keys = {
  dashboard: ["dashboard", "summary"] as const,
  connectors: ["ingest", "status"] as const,
  ingestStats: ["ingest", "stats"] as const,
  ingestRunning: ["ingest", "running"] as const,
  models: ["ingest", "models"] as const,
  trends: (limit: number) => ["trends", "list", limit] as const,
  emerging: ["trends", "emerging"] as const,
  trend: (id: number) => ["trends", "detail", id] as const,
  trendHistory: (id: number, hours: number) => ["trends", "history", id, hours] as const,
  rising: (limit: number) => ["trends", "rising", limit] as const,
  keywords: (limit: number) => ["trends", "keywords", limit] as const,
  segments: (includeDormant: boolean) => ["segments", "list", includeDormant] as const,
  segment: (id: number) => ["segments", "detail", id] as const,
  segmentTimeline: (id: number) => ["segments", "timeline", id] as const,
  personas: (includeDormant: boolean) => ["personas", "list", includeDormant] as const,
  personaStats: ["personas", "stats"] as const,
  personaHistory: (id: number, days: number) => ["personas", "history", id, days] as const,
  influentialPosts: (limit: number) => ["personas", "influential", limit] as const,
  sentimentTimeline: (hours: number, platform?: string) =>
    ["sentiment", "timeline", hours, platform ?? "all"] as const,
  emotions: (hours: number, platform?: string) =>
    ["sentiment", "emotions", hours, platform ?? "all"] as const,
  emotionTimeline: (hours: number, emotion?: string) =>
    ["sentiment", "emotion-timeline", hours, emotion ?? "all"] as const,
  activity: (hours: number, granularity: string, platform?: string) =>
    ["timeline", "activity", hours, granularity, platform ?? "all"] as const,
  coverage: ["timeline", "coverage"] as const,
  runs: (limit: number, platform?: string) =>
    ["timeline", "runs", limit, platform ?? "all"] as const,
  demographics: (platform?: string) => ["demographics", "overview", platform ?? "all"] as const,
  profiling: ["demographics", "coverage"] as const,
  network: (days: number) => ["network", "graph", days] as const,
  cascades: (days: number, topic?: string) => ["diffusion", "cascades", days, topic ?? "all"] as const,
  spread: (days: number, bucketHours: number, topic?: string) =>
    ["diffusion", "spread", days, bucketHours, topic ?? "all"] as const,
  ollama: ["ollama", "status"] as const,
  redditHistoricalStatus: ["ingest", "reddit-historical", "status"] as const,
};

type Opts<T> = Omit<UseQueryOptions<T, Error, T, any>, "queryKey" | "queryFn">;

// ── Overview ──────────────────────────────────────────────────────────────────

export function useDashboard(opts?: Opts<DashboardSummary>) {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: async () => (await dashboardApi.summary()).data,
    refetchInterval: LIVE,
    ...opts,
  });
}

export function useConnectors(opts?: Opts<Awaited<ReturnType<typeof ingestApi.status>>["data"]>) {
  return useQuery({
    queryKey: keys.connectors,
    queryFn: async () => (await ingestApi.status()).data,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useIngestStats(opts?: Opts<IngestionStats>) {
  return useQuery({
    queryKey: keys.ingestStats,
    queryFn: async () => (await ingestApi.stats()).data,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useIngestionStatus(opts?: Opts<IngestionState>) {
  return useQuery({
    queryKey: keys.ingestRunning,
    queryFn: async () => (await ingestApi.running()).data,
    refetchInterval: 3000,
    ...opts,
  });
}

export function useRedditHistoricalStatus(opts?: Opts<RedditHistoricalState>) {
  return useQuery({
    queryKey: keys.redditHistoricalStatus,
    queryFn: async () => (await ingestApi.redditHistoricalStatus()).data,
    refetchInterval: 3000,
    ...opts,
  });
}

export function useModelStatus(opts?: Opts<ModelStatus[]>) {
  return useQuery({
    queryKey: keys.models,
    queryFn: async () => (await ingestApi.modelStatus()).data,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

// ── Trends ────────────────────────────────────────────────────────────────────

export function useTrends(limit = 20, opts?: Opts<TrendSummary[]>) {
  return useQuery({
    queryKey: keys.trends(limit),
    queryFn: async () => (await trendsApi.list(limit)).data.items,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useEmergingTrends(opts?: Opts<TrendSummary[]>) {
  return useQuery({
    queryKey: keys.emerging,
    queryFn: async () => (await trendsApi.emerging()).data.items,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useTrend(id: number | null, opts?: Opts<TrendDetail>) {
  return useQuery({
    queryKey: keys.trend(id ?? -1),
    queryFn: async () => (await trendsApi.get(id!)).data,
    enabled: id != null,
    ...opts,
  });
}

export function useTrendHistory(id: number | null, hours = 48, opts?: Opts<TrendHistory>) {
  return useQuery({
    queryKey: keys.trendHistory(id ?? -1, hours),
    queryFn: async () => (await forecastApi.history(id!, hours)).data,
    enabled: id != null,
    ...opts,
  });
}

export function useRisingTrends(limit = 10, opts?: Opts<RisingTrend[]>) {
  return useQuery({
    queryKey: keys.rising(limit),
    queryFn: async () => (await forecastApi.rising(limit)).data.items,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useViralKeywords(limit = 25, opts?: Opts<ViralKeyword[]>) {
  return useQuery({
    queryKey: keys.keywords(limit),
    queryFn: async () => (await forecastApi.keywords(limit)).data.items,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

// ── Audience ──────────────────────────────────────────────────────────────────

export function useSegments(includeDormant = false, opts?: Opts<SegmentSummary[]>) {
  return useQuery({
    queryKey: keys.segments(includeDormant),
    queryFn: async () => (await segmentsApi.list(includeDormant)).data.items,
    staleTime: SLOW,
    ...opts,
  });
}

export function useSegment(id: number | null, opts?: Opts<SegmentDetail>) {
  return useQuery({
    queryKey: keys.segment(id ?? -1),
    queryFn: async () => (await segmentsApi.get(id!)).data,
    enabled: id != null,
    staleTime: SLOW,
    ...opts,
  });
}

export function useSegmentTimeline(id: number | null, opts?: Opts<any>) {
  return useQuery({
    queryKey: keys.segmentTimeline(id ?? -1),
    queryFn: async () => (await segmentsApi.timeline(id!)).data,
    enabled: id != null,
    staleTime: SLOW,
    ...opts,
  });
}

export function usePersonas(includeDormant = false, opts?: Opts<PersonaSummaryRow[]>) {
  return useQuery({
    queryKey: keys.personas(includeDormant),
    queryFn: async () => (await personaApi.list(includeDormant)).data.items as PersonaSummaryRow[],
    staleTime: SLOW,
    ...opts,
  });
}

export function usePersonaStats(opts?: Opts<PersonaStats>) {
  return useQuery({
    queryKey: keys.personaStats,
    queryFn: async () => (await personaApi.stats()).data as PersonaStats,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function usePersonaHistory(id: number | null, days = 30, opts?: Opts<any>) {
  return useQuery({
    queryKey: keys.personaHistory(id ?? -1, days),
    queryFn: async () => (await personaExtraApi.history(id!, days)).data,
    enabled: id != null,
    staleTime: SLOW,
    ...opts,
  });
}

export function useInfluentialPosts(limit = 10, opts?: Opts<InfluentialPost[]>) {
  return useQuery({
    queryKey: keys.influentialPosts(limit),
    queryFn: async () =>
      (await personaApi.influentialPosts(limit)).data.items as InfluentialPost[],
    staleTime: SLOW,
    ...opts,
  });
}

// ── Sentiment ─────────────────────────────────────────────────────────────────

export function useSentimentTimeline(hours = 24, platform?: string, opts?: Opts<TimePoint[]>) {
  return useQuery({
    queryKey: keys.sentimentTimeline(hours, platform),
    queryFn: async () => (await sentimentApi.timeline(platform, hours)).data.points,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useEmotions(hours = 24, platform?: string, opts?: Opts<EmotionBreakdown>) {
  return useQuery({
    queryKey: keys.emotions(hours, platform),
    queryFn: async () => (await emotionApi.breakdown(hours, platform)).data,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useEmotionTimeline(hours = 48, emotion?: string, opts?: Opts<any[]>) {
  return useQuery({
    queryKey: keys.emotionTimeline(hours, emotion),
    queryFn: async () => (await emotionApi.timeline(hours, emotion)).data.points,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

// ── Chronology ────────────────────────────────────────────────────────────────

export function useActivity(
  hours: number,
  granularity: "hour" | "day",
  platform?: string,
  opts?: Opts<ActivityTimeline>
) {
  return useQuery({
    queryKey: keys.activity(hours, granularity, platform),
    queryFn: async () => (await timelineApi.activity(hours, granularity, platform)).data,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useCoverage(opts?: Opts<CoverageRow[]>) {
  return useQuery({
    queryKey: keys.coverage,
    queryFn: async () => (await timelineApi.coverage()).data.items,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

export function useIngestionRuns(limit = 25, platform?: string, opts?: Opts<IngestionRun[]>) {
  return useQuery({
    queryKey: keys.runs(limit, platform),
    queryFn: async () => (await timelineApi.runs(limit, platform)).data.items,
    refetchInterval: FREQUENT,
    ...opts,
  });
}

// ── Demographics ──────────────────────────────────────────────────────────────

export function useDemographics(platform?: string, opts?: Opts<DemographicsOverview>) {
  return useQuery({
    queryKey: keys.demographics(platform),
    queryFn: async () => (await demographicsApi.overview(platform)).data,
    staleTime: SLOW,
    ...opts,
  });
}

export function useProfilingCoverage(opts?: Opts<ProfilingCoverage>) {
  return useQuery({
    queryKey: keys.profiling,
    queryFn: async () => (await demographicsApi.coverage()).data,
    staleTime: SLOW,
    ...opts,
  });
}

// ── Network & diffusion ───────────────────────────────────────────────────────

export function useNetwork(days = 7, opts?: Opts<NetworkGraph>) {
  return useQuery({
    queryKey: keys.network(days),
    queryFn: async () => (await networkApi.graph(days)).data,
    // The graph is expensive to build on the server; a longer stale window keeps
    // tab switching inside the page from triggering a rebuild.
    staleTime: 2 * 60_000,
    ...opts,
  });
}

export function useCascades(
  days = 7,
  topic?: string,
  opts?: Opts<{ items: Cascade[]; total: number; summary: SpreadSummary; window_days: number }>
) {
  return useQuery({
    queryKey: keys.cascades(days, topic),
    queryFn: async () => (await diffusionApi.cascades(days, topic)).data,
    staleTime: 2 * 60_000,
    ...opts,
  });
}

export function useSpread(
  days = 7,
  bucketHours = 3,
  topic?: string,
  opts?: Opts<DiffusionResult>
) {
  return useQuery({
    queryKey: keys.spread(days, bucketHours, topic),
    queryFn: async () => (await diffusionApi.spread(days, topic, bucketHours)).data,
    staleTime: 2 * 60_000,
    ...opts,
  });
}

// ── Local LLM ─────────────────────────────────────────────────────────────────

export function useOllama(opts?: Opts<OllamaStatus>) {
  return useQuery({
    queryKey: keys.ollama,
    queryFn: async () => (await ollamaApi.status()).data,
    refetchInterval: SLOW,
    ...opts,
  });
}

// ── Operator actions ──────────────────────────────────────────────────────────

/**
 * Run one ingestion + analysis cycle.
 *
 * Everything downstream of ingestion is invalidated rather than individually
 * refetched: the cycle touches posts, NLP, trends, profiles, segments and the
 * graph, so naming the few queries that "probably changed" would leave stale
 * panels on screen after the most significant action in the product.
 */
export function useTriggerIngestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => (await ingestApi.trigger()).data,
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useTriggerRedditHistorical() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => (await ingestApi.triggerRedditHistorical()).data,
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useRefreshDemographics() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (days: number = 30) => (await demographicsApi.refresh(days)).data,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["demographics"] });
      client.invalidateQueries({ queryKey: ["segments"] });
      client.invalidateQueries({ queryKey: ["personas"] });
    },
  });
}

export function useRecomputeDiffusion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { days: number; topic?: string }) =>
      (await diffusionApi.recompute(vars.days, vars.topic)).data,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["diffusion"] });
      client.invalidateQueries({ queryKey: ["network"] });
    },
  });
}

export function useRegeneratePersona() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (segmentId: number) => (await personaApi.regenerate(segmentId)).data,
    onSuccess: (_data, segmentId) => {
      client.invalidateQueries({ queryKey: keys.segment(segmentId) });
      client.invalidateQueries({ queryKey: ["personas"] });
    },
  });
}

export function useAnalyseText() {
  return useMutation({
    mutationFn: async (vars: { text: string; language?: string }) =>
      (await sentimentApi.analyze(vars.text, vars.language)).data,
  });
}

export function useRunSimulation() {
  return useMutation({
    mutationFn: async (vars: {
      policy_text: string;
      target_population?: string;
      question?: string;
      use_local_llm?: boolean;
    }) =>
      (
        await import("./api").then((m) =>
          m.simulationApi.run(
            vars.policy_text,
            vars.target_population,
            vars.question,
            vars.use_local_llm ?? false
          )
        )
      ).data,
  });
}

// ── Trend analysis ────────────────────────────────────────────────────────────

/**
 * The trend's brief — split into a fast half and a slow half.
 *
 * The analytic brief is a couple of database round trips and returns in ~200ms.
 * Asking the local model to phrase it costs ~12 seconds of CPU inference. Issued
 * as one request, the whole panel waits on the model and the page sits on a
 * skeleton long enough to read as broken.
 *
 * So the analysis is fetched without the LLM and renders immediately; the
 * narrative is a second, optional request that replaces the lede when it lands.
 * Both come from the same endpoint and the same evidence bundle, so the prose
 * cannot disagree with the numbers it appears above.
 */
export function useTrendBrief(id: number | null, hours = 72) {
  return useQuery({
    queryKey: ["trends", "brief", id ?? -1, hours],
    queryFn: async () =>
      (await import("./api")).trendAnalysisApi
        .brief(id!, hours, false)
        .then((r) => r.data),
    enabled: id != null,
    staleTime: 5 * 60_000,
  });
}

/**
 * The local model's phrasing of the brief above.
 *
 * Never polled and never retried: a failure here means Ollama is not running,
 * which the analytic brief already covers for. `isFetching` drives a "writing…"
 * state so the wait is legible rather than looking like a stall.
 */
export function useTrendNarrative(id: number | null, hours = 72, enabled = true) {
  return useQuery({
    queryKey: ["trends", "narrative", id ?? -1, hours],
    queryFn: async () =>
      (await import("./api")).trendAnalysisApi
        .brief(id!, hours, true)
        .then((r) => r.data),
    enabled: enabled && id != null,
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useTrendPosts(
  id: number | null,
  order: "engagement" | "recent" | "negative" = "engagement",
  limit = 12,
  hours = 72
) {
  return useQuery({
    queryKey: ["trends", "posts", id ?? -1, order, limit, hours],
    queryFn: async () =>
      (await import("./api")).trendAnalysisApi
        .posts(id!, order, limit, hours)
        .then((r) => r.data.items),
    enabled: id != null,
    staleTime: 60_000,
  });
}

// ── Live feed ─────────────────────────────────────────────────────────────────

/**
 * The stream of newest posts.
 *
 * Polls faster than anything else in the product (8s) because this panel exists
 * to be watched. It keeps its own accumulated list rather than replacing it on
 * every response, so arriving posts can animate in instead of the whole list
 * re-rendering — which is the difference between a feed that looks live and one
 * that just flickers.
 */
export function useLiveFeed(limit = 14, enabled = true) {
  const [items, setItems] = useState<LiveFeedItem[]>([]);
  const latestId = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ["dashboard", "live", limit],
    queryFn: async () => {
      const { liveApi } = await import("./api");
      const { data } = await liveApi.feed(limit, latestId.current ?? undefined);
      if (data.latest_id != null) latestId.current = data.latest_id;
      return data;
    },
    enabled,
    refetchInterval: 8_000,
    staleTime: 0,
  });

  useEffect(() => {
    const fresh = query.data?.items ?? [];
    if (!fresh.length) return;
    setItems((current) => {
      const seen = new Set(current.map((item) => item.post_id));
      const added = fresh.filter((item) => !seen.has(item.post_id));
      if (!added.length) return current;
      return [...added, ...current].slice(0, limit * 2);
    });
  }, [query.data, limit]);

  return { ...query, items };
}
