"use client";

import { useState } from "react";
import { FlaskConical, AlertTriangle, ChevronDown, ChevronUp, Shield, Cpu, Zap, CheckCircle2, XCircle } from "lucide-react";
import { type SegmentSimulationResponse, type OllamaStatus } from "@/lib/api";
import { fmtPct, sentimentColor, confidenceColor, confidenceBadge } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useOllama, useRunSimulation } from "@/lib/queries";
import {
  useChartTheme,
} from "@/components/charts/theme";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EpistemicBadge,
  ErrorState,
  SentimentBar,
} from "@/components/ui";

const EXAMPLES = [
  "Proposed increase in fuel tax by 8%",
  "Mandatory digital KYC for all bank accounts",
  "New national education policy changes for Class 10 board exams",
  "Expansion of PM-KISAN direct benefit transfer",
];

function SegmentCard({ resp }: { resp: SegmentSimulationResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface-2 border border-transparent rounded-xl overflow-hidden">
      <button className="w-full flex items-center gap-4 p-4 hover:bg-surface-2 transition-colors" onClick={() => setOpen(!open)}>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-ink">{resp.segment_name}</p>
          <div className="mt-1.5">
            <SentimentBar {...resp.sentiment_distribution} />
          </div>
        </div>
        <div className="text-right flex-shrink-0 space-y-1">
          <div className={cn("text-xs font-bold uppercase", sentimentColor(resp.expected_sentiment))}>{resp.expected_sentiment}</div>
          <div className={cn("text-xs", confidenceColor(resp.confidence))}>{confidenceBadge(resp.confidence)} conf.</div>
          {/* How many of this segment's own posts the reading rests on. It was
              only visible after expanding the row, so two segments with the same
              "Low conf." badge — one grounded in 58 posts, one in 3 — looked
              identical. This number is the most honest thing on the page. */}
          <div className="text-[11px] text-ink-3 tabular-nums">
            {resp.evidence_count.toLocaleString()} {resp.evidence_count === 1 ? "post" : "posts"}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-ink-3 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-3 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-bdr pt-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Positive", v: resp.sentiment_distribution.positive, c: "text-success" },
              { label: "Neutral", v: resp.sentiment_distribution.neutral, c: "text-ink-2" },
              { label: "Negative", v: resp.sentiment_distribution.negative, c: "text-danger" },
            ].map(({ label, v, c }) => (
              <div key={label} className="bg-surface rounded-lg p-2.5 text-center">
                <p className={cn("text-sm font-bold tabular-nums", c)}>{fmtPct(v)}</p>
                <p className="text-[10px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-surface rounded-lg p-2.5">
              <p className="text-ink-3 mb-0.5">Reaction Intensity</p>
              <p className="text-sm font-bold text-ink tabular-nums">{fmtPct(resp.intensity)}</p>
            </div>
            <div className="bg-surface rounded-lg p-2.5">
              <p className="text-ink-3 mb-0.5">Support Ratio</p>
              <p className="text-sm font-bold text-ink tabular-nums">{fmtPct(resp.support_ratio)}</p>
            </div>
          </div>
          <div>
            <p className="label font-semibold mb-2">Likely Narratives</p>
            <div className="flex flex-wrap gap-1.5">
              {resp.likely_narratives.map((n) => (
                <span key={n} className="text-xs px-2 py-0.5 bg-surface border border-bdr rounded-full text-ink-2">{n}</span>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-ink-3">Evidence: {resp.evidence_count.toLocaleString()} posts</p>
        </div>
      )}
    </div>
  );
}

function LlmToggle({ enabled, onChange, status }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  status: OllamaStatus | null;
}) {
  const available = status?.available && status?.model_ready;
  const checking = status === null;
  return (
    <div className={cn(
      "flex items-center gap-3 p-3.5 rounded-xl border transition-colors",
      enabled && available
        ? "bg-success/8 border-success/30"
        : "bg-surface-2 border-bdr"
    )}>
      <Cpu className={cn("w-4 h-4 flex-shrink-0", enabled && available ? "text-success" : "text-ink-3")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-ink">Local LLM Mode</p>
          {checking ? (
            <span className="text-[10px] text-ink-3">checking…</span>
          ) : available ? (
            <span className="flex items-center gap-1 text-[10px] text-success font-medium">
              <CheckCircle2 className="w-3 h-3" /> {status?.configured_model} ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-ink-3">
              <XCircle className="w-3 h-3" /> Ollama not running
            </span>
          )}
        </div>
        <p className="text-[10px] text-ink-3 mt-0.5">
          {available
            ? "Enriches narratives and generates an executive brief via on-device LLM"
            : "Start Ollama locally and pull a model to enable"}
        </p>
      </div>
      <button
        onClick={() => available && onChange(!enabled)}
        disabled={!available}
        title={available ? (enabled ? "Disable local LLM" : "Enable local LLM") : "Ollama not available"}
        className={cn(
          "relative w-10 h-5 rounded-full transition-colors flex-shrink-0",
          enabled && available ? "bg-success" : "bg-surface border border-bdr",
          !available && "opacity-40 cursor-not-allowed"
        )}
      >
        <span className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
          enabled && available ? "translate-x-5" : "translate-x-0.5"
        )} />
      </button>
    </div>
  );
}

export default function SimulationPage() {
  const [policyText, setPolicyText] = useState("");
  const [useLocalLlm, setUseLocalLlm] = useState(false);

  const ollama = useOllama();
  const simulation = useRunSimulation();
  const result = simulation.data;
  const loading = simulation.isPending;

  // A failed status check is itself an answer — Ollama is not reachable — so it
  // resolves to an unavailable status rather than leaving the toggle in limbo.
  const ollamaStatus: OllamaStatus | null = ollama.isLoading
    ? null
    : ollama.data ?? {
        available: false,
        base_url: "",
        configured_model: "",
        model_ready: false,
        available_models: [],
      };

  function handleRun() {
    if (!policyText.trim()) return;
    simulation.mutate({ policy_text: policyText, use_local_llm: useLocalLlm });
  }

  return (
    <div className="p-5 lg:p-6 space-y-5 max-w-5xl animate-fade-up">

      {/* Privacy notice */}
      <div className="flex items-start gap-3 bg-surface border border-bdr rounded-xl p-4">
        <Shield className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
        <div className="text-xs text-ink-2 space-y-1">
          <p className="font-semibold text-ink">Privacy-preserving analysis</p>
          <p>Policy queries are hashed before audit logging — raw text is never stored on the server. Enable <span className="text-success font-semibold">Local LLM Mode</span> above to run narrative enrichment entirely on-device via Ollama.</p>
        </div>
      </div>

      {/* Input */}
      <div className="bg-surface border border-bdr rounded-xl p-5 space-y-4">
        <div>
          <label className="block label font-semibold mb-2">
            Policy or event to simulate
          </label>
          <textarea
            value={policyText}
            onChange={(e) => setPolicyText(e.target.value)}
            rows={3}
            placeholder="Describe the policy, announcement, or event to simulate public response for…"
            className="w-full bg-surface-2 border border-transparent rounded-lg px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-brand/60 transition-colors resize-none"
          />
        </div>

        <div>
          <p className="text-xs text-ink-3 mb-2">Example queries:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setPolicyText(ex)}
                className="text-xs px-3 py-1.5 bg-surface-2 border border-bdr rounded-full text-ink-2 hover:text-ink hover:border-accent/40 transition-colors">
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Local LLM toggle */}
        <LlmToggle
          enabled={useLocalLlm}
          onChange={setUseLocalLlm}
          status={ollamaStatus}
        />

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={handleRun}
            loading={loading}
            disabled={!policyText.trim()}
            className="px-5 py-2.5 text-sm"
          >
            {loading ? null : <FlaskConical className="w-4 h-4" />}
            {loading
              ? (useLocalLlm ? "Analysing with LLM…" : "Analysing…")
              : "Run simulation"}
          </Button>
          {useLocalLlm && (
            <div className="flex items-center gap-1.5 text-xs text-success">
              <Cpu className="w-3.5 h-3.5" />
              <span className="font-medium">Local LLM enrichment on</span>
            </div>
          )}
        </div>
      </div>

      {simulation.isError && (
        <ErrorState error={simulation.error} onRetry={handleRun} />
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Mode badge */}
          <div className="flex items-center gap-2">
            {result.mode === "local-llm" ? (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 bg-success/12 text-success border border-success/25 rounded-full">
                <Cpu className="w-3 h-3" /> Local LLM enriched
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 bg-accent/10 text-accent border border-accent/25 rounded-full">
                <Zap className="w-3 h-3" /> Pattern-based analysis
              </span>
            )}
            <span className="text-[10px] text-ink-3">ID: {result.id}</span>
          </div>

          {/* LLM executive brief */}
          {result.llm_brief && (
            <div className="bg-surface border border-success/30 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-4 h-4 text-success" />
                <h2 className="text-sm font-semibold text-ink">AI Executive Intelligence Brief</h2>
                <span className="text-[10px] text-success font-medium ml-auto">Generated by local LLM</span>
              </div>
              <p className="text-sm text-ink-2 leading-relaxed">{result.llm_brief}</p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-3 bg-accent/8 border border-accent/25 rounded-xl p-4">
            <AlertTriangle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <p className="text-xs text-ink-2 leading-relaxed">{result.disclaimer}</p>
          </div>

          {/* Detected topics */}
          {result.topics_detected && result.topics_detected.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label font-semibold">Topics detected:</span>
              {result.topics_detected.map((t) => (
                <span key={t} className="text-[11px] px-2.5 py-0.5 bg-accent/10 text-accent rounded-full font-medium">{t}</span>
              ))}
            </div>
          )}

          {/* Overall */}
          <div className="bg-surface border border-bdr rounded-xl p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink mb-4 tracking-[-0.01em]">Overall predicted response</h2>
            <SentimentBar {...result.overall_sentiment} height="h-2.5" />
            <div className="flex gap-5 mt-2 text-xs">
              {["positive", "neutral", "negative"].map((k) => (
                <span key={k} className="text-ink-2">
                  <span className="font-bold text-ink">{fmtPct((result.overall_sentiment as any)[k])}</span> {k}
                </span>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <div className="bg-surface-2 border border-transparent rounded-lg p-3">
                <p className="text-ink-3 mb-1">Overall confidence</p>
                <p className={cn("text-base font-bold tabular-nums", confidenceColor(result.overall_confidence))}>{fmtPct(result.overall_confidence)}</p>
              </div>
              <div className="bg-surface-2 border border-transparent rounded-lg p-3">
                <p className="text-ink-3 mb-1">Expected spread</p>
                <p className="text-base font-bold text-ink capitalize">{result.potential_spread}</p>
              </div>
              <div className="bg-surface-2 border border-transparent rounded-lg p-3">
                <p className="text-ink-3 mb-1">Historical analogues</p>
                <p className="text-base font-bold text-ink">{result.analogues_used.length}</p>
              </div>
            </div>
          </div>

          {/* Segment responses */}
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink mb-3 tracking-[-0.01em]">How each segment is likely to react</h2>
            <div className="space-y-2">
              {result.segment_responses.map((r) => (
                <SegmentCard key={r.segment_id} resp={r} />
              ))}
            </div>
          </div>

          {/* Influential communities */}
          <div className="bg-surface border border-bdr rounded-xl p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink mb-3 tracking-[-0.01em]">Communities most likely to amplify it</h2>
            <div className="flex flex-wrap gap-2">
              {result.influential_communities.map((c) => (
                <span key={c} className="px-3 py-1.5 text-xs font-medium bg-surface-2 border border-bdr rounded-full text-ink-2 capitalize">{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
