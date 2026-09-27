import axios from "axios";
import Cookies from "js-cookie";

// In production the browser uses the same origin and Next.js proxies /api to
// the private backend. Local development can still provide an explicit URL.
const BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export const api = axios.create({
  baseURL: `${BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
  // Network rebuilds and inline pipeline runs are genuinely slow; the default
  // of "wait forever" leaves a spinner on screen with no way out.
  timeout: 45_000,
});

export const API_BASE = BASE;

api.interceptors.request.use((config) => {
  const token = Cookies.get("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Turn an axios failure into something a component can render.
 *
 * Every page previously swallowed errors in a bare `.catch(() => {})`, so a
 * failing request and an empty dataset were indistinguishable on screen. Pages
 * now surface `ApiError.message`, which means the message has to be worth
 * reading — FastAPI's `detail` where there is one, the status where there is
 * not, and an explicit offline case, since "cannot reach the API" and "the API
 * said no" call for different user actions.
 */
export class ApiError extends Error {
  status?: number;
  detail?: unknown;

  constructor(message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function describe(error: any): ApiError {
  if (!error?.response) {
    return new ApiError(
      error?.code === "ECONNABORTED"
        ? "The request timed out. The API may be busy recomputing."
        : BASE
        ? "Cannot reach the API. Is the backend running on " + BASE + "?"
        : "Cannot reach the application API.",
      undefined,
      error?.message
    );
  }

  const { status, data } = error.response;
  const detail = data?.detail;
  const text =
    typeof detail === "string"
      ? detail
      : Array.isArray(detail)
      ? detail.map((d: any) => d?.msg ?? String(d)).join("; ")
      : status === 404
      ? "Not found."
      : status === 503
      ? "A dependency is unavailable."
      : `Request failed (${status}).`;

  return new ApiError(text, status, detail);
}

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove("access_token");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(describe(error));
  }
);

// ── Typed API calls ───────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; user: User }>("/auth/login", { email, password }),
  me: () => api.get<User>("/auth/me"),
  logout: () => api.post("/auth/logout"),
};

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary"),
};

export const segmentsApi = {
  list: (includeDormant = false) =>
    api.get<{ items: SegmentSummary[]; total: number }>(
      `/segments/?include_dormant=${includeDormant}`
    ),
  get: (id: number) => api.get<SegmentDetail>(`/segments/${id}`),
  timeline: (id: number) => api.get(`/segments/${id}/timeline`),
};

export const trendsApi = {
  // `unclassified_post_count` is returned by the endpoint and read by the Trends
  // page; it was simply missing from this type.
  list: (limit = 20) =>
    api.get<{ items: TrendSummary[]; total: number; unclassified_post_count?: number }>(
      `/trends/?limit=${limit}`
    ),
  emerging: () => api.get<{ items: TrendSummary[]; total: number }>("/trends/emerging"),
  get: (id: number) => api.get<TrendDetail>(`/trends/${id}`),
};

export const sentimentApi = {
  analyze: (text: string, language?: string) =>
    api.post<SentimentResult>("/sentiment/analyze", { text, language }),
  timeline: (platform?: string, hours = 24) =>
    api.get<{ points: TimePoint[] }>(`/sentiment/timeline?hours=${hours}${platform ? `&platform=${platform}` : ""}`),
};

export const simulationApi = {
  /**
   * Run a policy simulation.
   *
   * Gets its own timeout because the work is not comparable to a normal read:
   * with the local model enabled the engine writes narratives for every audience
   * segment, one generation each, which on CPU runs well past the client's
   * 45-second default. The request completing server-side while the client gave
   * up on it is the worst of both — the user sees a failure for work that
   * actually succeeded.
   */
  run: (policy_text: string, target_population?: string, question?: string, use_local_llm = false) =>
    api.post<SimulationResult>(
      "/simulation/run",
      { policy_text, target_population, question, use_local_llm },
      { timeout: use_local_llm ? 240_000 : 60_000 }
    ),
};

export const ollamaApi = {
  status: () => api.get<OllamaStatus>("/ollama/status"),
  warm: () => api.post<{ status: string; model: string }>("/ollama/warm"),
  test: (prompt?: string) => api.post<OllamaTestResult>("/ollama/test", { prompt }),
};

export const personaApi = {
  regenerate: (segmentId: number) => api.post<PersonaRegenerateResult>(`/segments/${segmentId}/regenerate-persona`),
  list: (includeDormant = false) => api.get<{ items: any[]; total: number }>(`/personas/?include_dormant=${includeDormant}`),
  get: (id: number, includeMembers = false) => api.get<any>(`/personas/${id}?include_members=${includeMembers}`),
  stats: () => api.get<any>("/personas/stats"),
  influentialPosts: (limit = 20) => api.get<{ items: any[]; total: number }>(`/personas/influential/posts?limit=${limit}`),
  queryByStance: (topic: string, stance: string, limit = 5) => api.get<any>(`/personas/query/by-stance?topic=${encodeURIComponent(topic)}&stance=${stance}&limit=${limit}`),
};

export const ingestApi = {
  status: () => api.get<ConnectorStatus[]>("/ingest/status"),
  stats: () => api.get<IngestionStats>("/ingest/stats"),
  trigger: () => api.post<{ status: string; task_id: string }>("/ingest/trigger"),
  modelStatus: () => api.get<ModelStatus[]>("/ingest/model-status"),
  running: () => api.get<IngestionState>("/ingest/running"),
  triggerRedditHistorical: () => api.post<{ status: string; message: string }>("/ingest/reddit/historical"),
  redditHistoricalStatus: () => api.get<RedditHistoricalState>("/ingest/reddit/historical/status"),
};

export interface RedditHistoricalState {
  status: "idle" | "running" | "success" | "failed";
  started_at: string | null;
  finished_at: string | null;
  last_refresh_at: string | null;
  next_refresh_at: string | null;
  source: string;
  mode: string;
  subreddits_total: number;
  subreddits_processed: number;
  subreddits_failed: number;
  posts_fetched: number;
  posts_inserted: number;
  duplicates: number;
  keyword_matches: number;
  errors: number;
  reason: string | null;
}

// ── Types (mirroring backend schemas) ────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "analyst" | "viewer";
  is_active: boolean;
  created_at: string;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

/**
 * One bucket of a sentiment series.
 *
 * Shares are nullable: an hour with nothing analysed is a gap, not a measured
 * zero, and charts must break the line rather than draw it collapsing to the
 * axis. `volume` says how much evidence the bucket rests on.
 */
export interface TimePoint {
  timestamp: string;
  positive: number | null;
  neutral: number | null;
  negative: number | null;
  volume: number;
}

export interface PlatformStat {
  platform: string;
  display_name: string;
  post_count: number;
  color?: string;
  posts_24h: number;
  unique_authors: number;
  share: number;
}

export interface TrendMover {
  id: number;
  name: string;
  trend_score: number;
  velocity: number;
  phase?: string | null;
  is_emerging: boolean;
  unique_users: number;
  platform_count: number;
  sentiment_shift?: number | null;
}

export interface DashboardSummary {
  total_posts: number;
  posts_24h: number;
  active_segments: number;
  trending_topics: number;
  emerging_count: number;
  overall_sentiment: SentimentBreakdown;
  platform_breakdown: PlatformStat[];
  sentiment_timeline: TimePoint[];
  demo_mode: boolean;

  // Trailing-window comparison, so every headline number can be read as a
  // change rather than a bare count.
  posts_prev_24h: number;
  authors_24h: number;
  authors_prev_24h: number;
  sentiment_prev_24h?: SentimentBreakdown | null;

  unique_authors: number;
  comments_24h: number;
  nlp_coverage: number;
  analysed_posts: number;
  sarcasm_rate: number;
  mean_intensity: number;
  languages_seen: number;
  top_emotions: Record<string, number>;
  stance_breakdown: Record<string, number>;
  top_movers: TrendMover[];
  /** Biggest conversations right now, by composite score. */
  trending_now: TrendMover[];
  /** Topics whose growth marks them out as new, by velocity. */
  emerging: TrendMover[];
  latest_post_ts?: string | null;
  generated_at?: string | null;
}

// ── Trend analysis ────────────────────────────────────────────────────────────

export interface TrendPost {
  post_id: number;
  content: string;
  author: string;
  language?: string | null;
  geo_hint?: string | null;
  post_ts: string;
  platform: string;
  platform_color?: string | null;
  engagement_score: number;
  engagement_raw: Record<string, number>;
  sentiment?: string | null;
  sentiment_score?: number | null;
  emotion?: string | null;
  stance?: string | null;
  sarcasm_flag: boolean;
  intensity?: number | null;
}

export interface TrendBrief {
  trend_id: number;
  name: string;
  /** "local-llm" when Ollama wrote the prose, "analytic" when the fallback did. */
  generated_by: "local-llm" | "analytic";
  narrative?: string | null;
  sections: {
    headline: string;
    distribution: string;
    sentiment: string;
    outlook: string;
    caveat: string;
    generated_by: string;
  };
  phase: string;
  phase_meaning: string;
  window_hours: number;
  metrics: {
    posts: number;
    authors: number;
    level: number;
    baseline: number;
    velocity: number;
    acceleration: number;
    bursting: boolean;
    z_score: number;
    mean_engagement: number;
    peak_volume: number;
    peak_ts?: string | null;
    trend_score: number;
    community_spread: number;
  };
  forecast: {
    available: boolean;
    reason?: string;
    values: Record<string, number>;
    confidence: number;
    r_squared?: number;
    direction?: string;
  };
  sentiment: {
    current: { positive: number; neutral: number; negative: number; sample: number };
    previous: { positive: number; neutral: number; negative: number; sample: number };
    shift: number;
  };
  emotions: Record<string, number>;
  stances: Record<string, number>;
  platforms: Array<{
    platform: string;
    display_name: string;
    color?: string | null;
    posts: number;
    share: number;
  }>;
  audience: Array<{ segment_id: number; label: string; posts: number; share: number }>;
  languages: Record<string, number>;
  concentration: { authors: number; top10_share: number; posts_per_author: number };
  keywords: ViralKeyword[];
  generated_at: string;
}

export interface LiveFeedItem {
  post_id: number;
  content: string;
  author: string;
  language?: string | null;
  post_ts: string;
  platform: string;
  platform_color?: string | null;
  engagement_score: number;
  sentiment?: string | null;
  emotion?: string | null;
  sarcasm_flag: boolean;
  is_comment: boolean;
}

export const trendAnalysisApi = {
  brief: (id: number, hours = 72, useLlm = true) =>
    api.get<TrendBrief>(`/trends/${id}/brief?hours=${hours}&use_llm=${useLlm}`),
  posts: (id: number, order: "engagement" | "recent" | "negative" = "engagement", limit = 12, hours = 72) =>
    api.get<{ trend_id: number; name: string; order: string; items: TrendPost[]; total: number }>(
      `/trends/${id}/posts?order=${order}&limit=${limit}&hours=${hours}`
    ),
};

export const liveApi = {
  feed: (limit = 12, sinceId?: number) =>
    api.get<{ items: LiveFeedItem[]; latest_id: number | null; generated_at: string }>(
      `/dashboard/live?limit=${limit}` + (sinceId != null ? `&since_id=${sinceId}` : "")
    ),
};

export interface SegmentSummary {
  id: number;
  name: string;
  description?: string;
  dominant_language?: string;
  size_estimate?: number;
  confidence: number;
  evidence_count: number;
  sentiment_profile?: SentimentBreakdown;
  updated_at: string;
}

export interface Persona {
  id: number;
  summary?: string;
  interests?: string[];
  reaction?: Record<string, number>;
  influence_score?: number;
  confidence: number;
  generated_at: string;
}

export interface SegmentDetail extends SegmentSummary {
  geo_distribution?: Record<string, number>;
  topic_prefs?: Record<string, number>;
  activity_profile?: Record<string, number>;
  persona?: Persona;
}

export interface TrendSummary {
  id: number;
  name: string;
  trend_score: number;
  velocity: number;
  acceleration: number;
  is_emerging: boolean;
  platform_count: number;
  platforms?: string[];
  unique_users: number;
  measured_at: string;
}

export interface TrendDetail extends TrendSummary {
  volume_decay: number;
  engagement: number;
  community_spread: number;
  sentiment_shift: number;
  baseline_7d: number;
}

export interface SentimentResult {
  text: string;
  language: string;
  sentiment: string;
  sentiment_score: number;
  emotion?: string;
  emotion_score?: number;
  intensity?: number;
  sarcasm_flag?: boolean;
  sarcasm_conf?: number;
  epistemic_note: string;
}

export interface SegmentSimulationResponse {
  segment_id: number;
  segment_name: string;
  expected_sentiment: string;
  sentiment_distribution: SentimentBreakdown;
  intensity: number;
  support_ratio: number;
  likely_narratives: string[];
  confidence: number;
  evidence_count: number;
}

export interface ConnectorStatus {
  platform: string;
  /**
   * `live` — genuine API data. `synthetic` — the connector's generator, used
   * when the live API is unconfigured or unauthorised. `unavailable` / `failed`
   * — neither was possible. `mock` is the retired spelling of `synthetic`,
   * retained so an older backend still type-checks against this client.
   */
  mode: "live" | "synthetic" | "unavailable" | "failed" | "mock";
  is_healthy: boolean;
  /** Pulled by the running backend process — resets to zero on restart. */
  posts_ingested_total: number;
  /** Held in the database for this platform, whoever ingested it. */
  posts_stored: number;
  latest_post_ts?: string | null;
  last_ingested_at?: string;
  error?: string;
}

export interface PlatformIngestionStat {
  platform: string;
  display_name: string;
  total_posts: number;
  nlp_processed: number;
  nlp_coverage: number;
  color?: string;
}

export interface IngestionStats {
  total_posts: number;
  nlp_processed: number;
  nlp_coverage: number;
  per_platform: PlatformIngestionStat[];
  generated_at: string;
}

export interface IngestionState {
  is_running: boolean;
  status: "idle" | "running" | "success" | "failed";
  last_started_at: string | null;
  last_completed_at: string | null;
  new_records: number;
  records_by_platform: Record<string, { status: string; new_records: number; reason?: string }>;
  error: string | null;
}

export interface NetworkNode {
  id: string;
  label: string;
  platform: string;
  post_count: number;
  topic_count: number;
  dominant_sentiment: string;
  community_id: number;
  pagerank: number;
  betweenness: number;
  is_bridge: boolean;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
}

export interface NetworkCommunity {
  id: number;
  name: string;
  size: number;
  dominant_platform: string;
  avg_pagerank: number;
  platform_breakdown: Record<string, number>;
}

export interface NetworkInfluencer {
  rank: number;
  label: string;
  platform: string;
  pagerank: number;
  post_count: number;
  community_id: number;
  dominant_sentiment: string;
}

export interface NetworkBridge {
  label: string;
  platform: string;
  betweenness: number;
  community_id: number;
  post_count: number;
}

export interface NetworkStats {
  node_count: number;
  edge_count: number;
  community_count: number;
  avg_degree: number;
  density: number;
  bridge_count: number;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  communities: NetworkCommunity[];
  influencers: NetworkInfluencer[];
  bridges: NetworkBridge[];
  stats: NetworkStats;
  generated_at: string;
  is_synthetic?: boolean;
}

export const networkApi = {
  graph: (days = 7) => api.get<NetworkGraph>(`/network/graph?days=${days}`),
  influencers: (days = 7, top = 10) => api.get<{ items: NetworkInfluencer[]; stats: NetworkStats }>(`/network/influencers?days=${days}&top=${top}`),
  communities: (days = 7) => api.get<{ items: NetworkCommunity[]; stats: NetworkStats }>(`/network/communities?days=${days}`),
  bridges: (days = 7) => api.get<{ items: NetworkBridge[]; stats: NetworkStats }>(`/network/bridges?days=${days}`),
};

export interface ModelStatus {
  name: string;
  loaded: boolean;
  error?: string;
  use_real_nlp: boolean;
}

export interface OllamaStatus {
  available: boolean;
  base_url: string;
  configured_model: string;
  model_ready: boolean;
  available_models: string[];
}

export interface OllamaTestResult {
  prompt: string;
  response: string;
  model: string;
}

export interface PersonaRegenerateResult {
  segment_id: number;
  persona_summary: string;
  generated_by: string;
}

export interface SimulationResult {
  id: string;
  policy_text: string;
  overall_sentiment: SentimentBreakdown;
  overall_confidence: number;
  analogues_used: string[];
  topics_detected: string[];
  segment_responses: SegmentSimulationResponse[];
  influential_communities: string[];
  potential_spread: string;
  llm_brief?: string;
  disclaimer: string;
  generated_at: string;
  mode: string;
}

// ── Component A: timeline & chronology ───────────────────────────────────────

export interface ActivityPoint {
  timestamp: string;
  total: number;
  by_platform: Record<string, { volume: number; authors: number }>;
}

export interface ActivityTimeline {
  granularity: "hour" | "day";
  hours: number;
  points: ActivityPoint[];
  platform_colors: Record<string, string | null>;
}

export interface CoverageRow {
  platform: string;
  display_name: string;
  earliest_post: string | null;
  latest_post: string | null;
  total_posts: number;
  unique_authors: number;
  languages: number;
  span_hours: number;
  freshness_minutes: number | null;
}

export interface IngestionRun {
  id: number;
  platform: string;
  mode: "mock" | "live";
  started_at: string;
  finished_at: string | null;
  posts_fetched: number;
  posts_inserted: number;
  duplicates_skipped: number;
  status: "ok" | "partial" | "failed";
  error: string | null;
  watermark_ts: string | null;
}

export const timelineApi = {
  activity: (hours = 48, granularity: "hour" | "day" = "hour", platform?: string) =>
    api.get<ActivityTimeline>(
      `/timeline/activity?hours=${hours}&granularity=${granularity}` +
        (platform ? `&platform=${platform}` : "")
    ),
  coverage: () =>
    api.get<{ items: CoverageRow[]; generated_at: string }>("/timeline/coverage"),
  runs: (limit = 50, platform?: string) =>
    api.get<{ items: IngestionRun[]; total: number }>(
      `/timeline/runs?limit=${limit}` + (platform ? `&platform=${platform}` : "")
    ),
  conversation: (authorHash: string, days = 7) =>
    api.get(`/timeline/conversation/${authorHash}?days=${days}`),
};

// ── Component B: multi-dimensional sentiment ─────────────────────────────────

export interface EmotionBreakdown {
  window_hours: number;
  analysed_posts: number;
  emotions: Record<string, number>;
  stance: Record<string, number>;
  sarcasm_rate: number;
  mean_intensity: number;
  generated_at: string;
  epistemic_note: string;
}

export interface EmotionTimelinePoint {
  timestamp: string;
  total: number;
  shares: Record<string, number>;
}

export const emotionApi = {
  breakdown: (hours = 24, platform?: string) =>
    api.get<EmotionBreakdown>(
      `/sentiment/emotions?hours=${hours}` + (platform ? `&platform=${platform}` : "")
    ),
  timeline: (hours = 48, emotion?: string) =>
    api.get<{ points: EmotionTimelinePoint[]; window_hours: number }>(
      `/sentiment/emotion-timeline?hours=${hours}` + (emotion ? `&emotion=${emotion}` : "")
    ),
};

// ── Component C: demographics ────────────────────────────────────────────────

export interface DemographicsOverview {
  cohort_size: number;
  suppressed: boolean;
  reason?: string;
  age_distribution: Record<string, number>;
  geo_distribution: Record<string, number>;
  language_distribution: Record<string, number>;
  profession_distribution: Record<string, number>;
  interest_distribution: Record<string, number>;
  platform_distribution: Record<string, number>;
  activity_by_hour: Record<string, number>;
  mean_confidence: number;
  coverage?: { age_known: number; geo_known: number; profession_known: number };
  generated_at?: string;
  epistemic_note?: string;
  segment_id?: number;
  segment_name?: string;
}

export interface ProfilingCoverage {
  profiled_authors: number;
  assigned_to_segment?: number;
  mean_confidence?: number;
  message?: string;
  fields: Record<string, { known: number; share: number }>;
  min_reportable_group?: number;
}

export const demographicsApi = {
  overview: (platform?: string) =>
    api.get<DemographicsOverview>(
      "/demographics/overview" + (platform ? `?platform=${platform}` : "")
    ),
  segment: (id: number) => api.get<DemographicsOverview>(`/demographics/segment/${id}`),
  coverage: () => api.get<ProfilingCoverage>("/demographics/coverage"),
  refresh: (days = 30) =>
    api.post<{ status: string; profiles_written: number; segments_updated: number }>(
      `/demographics/refresh?days=${days}`
    ),
};

// ── Component D: trend forecasting ───────────────────────────────────────────

export interface ViralKeyword {
  keyword: string;
  count: number;
  lift: number;
  is_hashtag: boolean;
  is_new: boolean;
  trend_id?: number;
  trend_name?: string;
}

export interface RisingTrend {
  id: number;
  name: string;
  phase: string | null;
  trend_score: number;
  velocity: number;
  acceleration: number;
  forecast_6h: number | null;
  forecast_24h: number | null;
  forecast_confidence: number | null;
  projected_growth: number;
  is_emerging: boolean;
  viral_keywords: ViralKeyword[];
  platforms: string[] | null;
}

export interface TrendHistoryPoint {
  bucket_ts: string;
  volume: number;
  unique_users: number;
  avg_sentiment: number | null;
}

export interface TrendHistory {
  trend_id: number;
  name: string;
  points: TrendHistoryPoint[];
  forecast: {
    available: boolean;
    reason?: string;
    values: Record<string, number>;
    confidence: number;
    r_squared?: number;
    direction?: string;
  };
  burst: { is_bursting: boolean; z_score: number };
  phase: string;
  viral_keywords: ViralKeyword[];
}

export const forecastApi = {
  rising: (limit = 10) =>
    api.get<{ items: RisingTrend[]; total: number }>(`/trends/rising?limit=${limit}`),
  keywords: (limit = 25) =>
    api.get<{ items: ViralKeyword[]; total: number }>(`/trends/keywords?limit=${limit}`),
  history: (trendId: number, hours = 48) =>
    api.get<TrendHistory>(`/trends/${trendId}/history?hours=${hours}`),
};

// ── Component E: diffusion ───────────────────────────────────────────────────

export interface Cascade {
  root_author: string;
  root_ts: string;
  size: number;
  depth: number;
  breadth: number;
  unique_authors: number;
  platforms: string[];
  cross_platform: boolean;
  duration_hours: number;
  velocity_per_hour: number;
  root_sentiment: string;
  sentiment_drift: number;
  shape: "broadcast" | "conversation" | "viral" | "mixed" | "isolated";
  topic: string | null;
}

export interface SpreadSummary {
  cascade_count: number;
  mean_depth: number;
  max_depth: number;
  cross_platform_share: number;
  shapes: Record<string, number>;
  mean_sentiment_drift: number;
  largest_cascade_size?: number;
}

export interface DiffusionHop {
  ts: string;
  from_segment_id: number;
  from_segment: string;
  to_segment_id: number;
  to_segment: string;
  volume: number;
  interaction_edges: number;
  sentiment_from: number;
  sentiment_to: number;
  sentiment_delta: number;
  confidence: number;
  dominant_sentiment: string;
}

export interface DiffusionTimelineBucket {
  bucket_ts: string;
  segments: Record<
    string,
    { segment_id: number; segment_name: string; volume: number; mean_sentiment: number }
  >;
}

export interface DiffusionResult {
  available: boolean;
  reason?: string;
  topic?: string | null;
  bucket_hours?: number;
  timeline: DiffusionTimelineBucket[];
  hops: DiffusionHop[];
  segments: Array<{ segment_id: number; segment_name: string }>;
  method?: string;
  generated_at?: string;
}

export const diffusionApi = {
  cascades: (days = 7, topic?: string, limit = 25) =>
    api.get<{
      items: Cascade[];
      total: number;
      summary: SpreadSummary;
      window_days: number;
    }>(
      `/diffusion/cascades?days=${days}&limit=${limit}` + (topic ? `&topic=${topic}` : "")
    ),
  spread: (days = 7, topic?: string, bucketHours = 3) =>
    api.get<DiffusionResult>(
      `/diffusion/spread?days=${days}&bucket_hours=${bucketHours}` +
        (topic ? `&topic=${topic}` : "")
    ),
  influenceTimeline: (authorHash: string, days = 14) =>
    api.get<{
      author_hash: string;
      points: Array<{ bucket_ts: string; replies: number; unique_responders: number }>;
      total_replies: number;
    }>(`/diffusion/influence-timeline/${authorHash}?days=${days}`),
  recompute: (days = 7, topic?: string) =>
    api.post<{ status: string; edges_materialised: number; diffusion_events: number }>(
      `/diffusion/recompute?days=${days}` + (topic ? `&topic=${topic}` : "")
    ),
};

// ── Endpoints the client could not previously reach ───────────────────────────
// The backend exposes these and nothing on the frontend called them, so the
// analysis they carry — a persona's history, how a group reacts to one topic,
// what a conversation actually looked like — was unreachable from the product.

export interface PersonaSummaryRow {
  persona_id: number;
  label: string;
  description?: string | null;
  status: string;
  member_count: number;
  evidence_count: number;
  confidence?: number | null;
  drift?: number | null;
  dominant_language?: string | null;
  top_topics: Record<string, number>;
  sentiment_profile: Record<string, number>;
  stance_profile: Record<string, number>;
  first_seen?: string | null;
  updated_at?: string | null;
}

export interface PersonaStats {
  posts_total: number;
  posts_analysed: number;
  posts_filtered_out: number;
  analysis_rate: number;
  comments: number;
  profiled_users: number;
  users_assigned_to_persona: number;
  active_personas: number;
  engagement_threshold: number;
  profile_cache?: Record<string, unknown>;
}

export interface PersonaHistoryPoint {
  ts: string;
  member_count: number;
  sentiment_profile?: Record<string, number> | null;
  stance_profile?: Record<string, number> | null;
  event?: string | null;
}

export interface InfluentialPost {
  post_id: number;
  content: string;
  engagement_score: number;
  engagement_raw?: Record<string, number> | null;
  post_ts: string;
  top_personas: Array<{
    persona_id: number;
    label: string;
    match_score: number;
    affinity?: string;
    explanation?: string;
  }>;
}

export const personaExtraApi = {
  history: (personaId: number, days = 30) =>
    api.get<{ persona_id: number; points: PersonaHistoryPoint[] }>(
      `/personas/${personaId}/history?days=${days}`
    ),
  document: (personaId: number) =>
    api.get<{ persona_id: number; document: string }>(`/personas/${personaId}/document`),
  reaction: (personaId: number, topic: string) =>
    api.get<Record<string, unknown>>(
      `/personas/${personaId}/reaction/${encodeURIComponent(topic)}`
    ),
  similar: (text: string, limit = 5) =>
    api.post<{ text: string; items: any[] }>("/personas/query/similar", { text, limit }),
  postMatches: (postId: number) =>
    api.get<{ post_id: number; content: string; matches: any[] }>(
      `/personas/post/${postId}/matches`
    ),
  rebuild: () => api.post<Record<string, unknown>>("/personas/rebuild"),
};

export interface ConversationEntry {
  id: number;
  author_hash: string;
  is_root_author: boolean;
  parent_hash?: string | null;
  content: string;
  language?: string | null;
  post_ts: string;
  platform?: string | null;
  sentiment?: string | null;
  emotion?: string | null;
  stance?: string | null;
  sarcasm_flag?: boolean | null;
}

export const conversationApi = {
  get: (authorHash: string, days = 7) =>
    api.get<{
      author_hash: string;
      count: number;
      window_days: number;
      items: ConversationEntry[];
    }>(`/timeline/conversation/${authorHash}?days=${days}`),
};

export const ollamaExtraApi = {
  warm: () => api.post<{ status: string; model: string }>("/ollama/warm"),
  test: (prompt?: string) => api.post<OllamaTestResult>("/ollama/test", { prompt }),
};

export const segmentsExtraApi = {
  triggerSegmentation: () =>
    api.post<{ status: string; task_id: string }>("/segments/trigger-segmentation"),
};

export const demographicsExtraApi = {
  segment: (id: number) => api.get<DemographicsOverview>(`/demographics/segment/${id}`),
};
