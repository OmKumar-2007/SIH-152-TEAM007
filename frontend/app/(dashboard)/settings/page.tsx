"use client";

import { AlertTriangle, Database, Cpu, Shield, Server, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { type ModelStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIngestStats, useModelStatus, useOllama } from "@/lib/queries";
import { ErrorState, Skeleton } from "@/components/ui";

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-bdr rounded-xl overflow-hidden shadow-card">
      <div className="px-5 py-3.5 border-b border-bdr flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      <div className="divide-y divide-bdr">{children}</div>
    </div>
  );
}

function Row({ label, value, note, mono = false }: {
  label: string; value: React.ReactNode; note?: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div>
        <p className="text-sm text-ink">{label}</p>
        {note && <p className="text-xs text-ink-3 mt-0.5">{note}</p>}
      </div>
      <div className={cn("text-sm font-medium text-ink-2 text-right", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

function StatusDot({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) return <Loader2 className="w-3.5 h-3.5 text-ink-3 animate-spin" />;
  return ok
    ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
    : <XCircle className="w-3.5 h-3.5 text-danger" />;
}

function ModelRow({ model, loading }: { model: ModelStatus; loading: boolean }) {
  const labels: Record<string, string> = {
    "sentiment": "Sentiment (XLM-RoBERTa)",
    "emotion": "Emotion (DistilRoBERTa)",
    "irony": "Sarcasm (RoBERTa-irony)",
    "embedding": "Embeddings (MiniLM-L12)",
    "zero_shot": "Zero-shot (mDeBERTa-XNLI)",
  };
  return (
    <div className="flex items-center justify-between px-5 py-3 gap-4">
      <div>
        <p className="text-sm text-ink">{labels[model.name] ?? model.name}</p>
        {model.error && <p className="text-xs text-danger mt-0.5">{model.error}</p>}
        {!model.use_real_nlp && (
          <p className="text-xs text-ink-3 mt-0.5">Rule-based fallback active</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span>{model.loaded ? "loaded" : "idle"}</span>
        <StatusDot ok={model.loaded || !model.use_real_nlp} loading={loading} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const modelQuery = useModelStatus();
  const ollamaQuery = useOllama();
  const statsQuery = useIngestStats();

  const models: ModelStatus[] = modelQuery.data ?? [];
  const ollama = ollamaQuery.data ?? null;
  const stats = statsQuery.data ?? null;
  const loading = modelQuery.isLoading || ollamaQuery.isLoading || statsQuery.isLoading;

  // Every ModelStatus row carries the server's USE_REAL_NLP value, so the mode
  // is read from the backend rather than restated as a literal in the UI.
  const realNlp: boolean | null = models.length ? models[0].use_real_nlp : null;

  //: Mirrors INGEST_RETENTION_DAYS. Kept as one constant so the retention row
  //: and the TTL row below cannot drift apart on screen.
  const retentionDays = 30;

  return (
    <div className="p-5 lg:p-6 space-y-5 max-w-4xl animate-fade-up">
      {modelQuery.isError && (
        <ErrorState error={modelQuery.error} onRetry={() => modelQuery.refetch()} />
      )}

      {/* Data sources */}
      <Section title="Data Sources" icon={Database}>
        <Row
          label="Inference mode"
          value={realNlp === null ? "—" : realNlp ? "Transformer models" : "Rule-based fallback"}
          note={
            realNlp === false
              ? "Set USE_REAL_NLP=true to enable the transformer heads"
              : realNlp
                ? "USE_REAL_NLP=true — see NLP Models below for load state"
                : undefined
          }
        />
        <Row label="Ingestion interval" value="Every 120 seconds" note="Celery beat scheduler" />
        {/* Read from the API rather than restated as a literal: the hard-coded
            list still named a "News" connector that no longer exists, and would
            keep naming it after any future change to the registry. */}
        <Row
          label="Active platforms"
          value={
            stats
              ? stats.per_platform.map((p) => p.display_name).join(" · ")
              : "—"
          }
          note={stats ? `${stats.per_platform.length} connectors registered` : undefined}
        />
        <Row label="Total posts indexed"
          value={stats ? stats.total_posts.toLocaleString("en-IN") : "—"}
          note={stats ? `${Math.round(stats.nlp_coverage * 100)}% NLP-processed` : undefined}
        />
        <Row
          label="Raw post TTL"
          value={`${retentionDays} days`}
          note="Deleted by the pipeline on every run, and hourly by Celery beat in production (DPDP Act 2023)"
        />
      </Section>

      {/* NLP models */}
      <Section title="NLP Models" icon={Server}>
        {loading && models.length === 0 ? (
          <div className="px-5 py-4 flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading model status…
          </div>
        ) : models.length > 0 ? (
          models.map((m) => <ModelRow key={m.name} model={m} loading={loading} />)
        ) : (
          <>
            <Row label="Language detection" value="fasttext-langid" note="176 languages, ~0.2ms/call" />
            <Row label="Sentence embeddings" value="paraphrase-multilingual-MiniLM-L12-v2" note="384-dim, 50+ languages" />
            <Row label="Sentiment" value="twitter-xlm-roberta-base-sentiment" note="Multilingual, fine-tuned" />
            <Row label="Emotion" value="emotion-english-distilroberta-base" note="7 emotion classes" />
            <Row label="Sarcasm" value="twitter-roberta-base-irony" note="Binary irony detection" />
            <Row label="Topic modelling" value="BERTopic + HDBSCAN + UMAP" note="Online incremental fitting" />
          </>
        )}
      </Section>

      {/* Local LLM */}
      <Section title="Local LLM (Ollama)" icon={Cpu}>
        <div className="flex items-center justify-between px-5 py-3 gap-4">
          <div>
            <p className="text-sm text-ink">Ollama service</p>
            <p className="text-xs text-ink-3 mt-0.5">{ollama?.base_url ?? "http://localhost:11434"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", ollama?.available ? "text-success" : "text-ink-3")}>
              {ollama === null ? "checking…" : ollama.available ? "running" : "offline"}
            </span>
            <StatusDot ok={ollama?.available ?? false} loading={ollama === null && loading} />
          </div>
        </div>
        <Row
          label="Configured model"
          value={
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs">{ollama?.configured_model ?? "llama3.2:3b"}</span>
              {ollama && (
                <StatusDot ok={ollama.model_ready} />
              )}
            </span>
          }
          note={ollama?.model_ready ? "Model cached and ready" : "Run: make ollama → ollama pull llama3.2:3b"}
        />
        {ollama?.available_models && ollama.available_models.length > 0 && (
          <Row
            label="Available models"
            value={ollama.available_models.join(", ")}
            mono
          />
        )}
        <Row
          label="Capabilities"
          value="Persona generation · Narrative enrichment · Policy brief"
          note="All inference runs on-device — no external API calls"
        />
      </Section>

      {/* Privacy */}
      {/*
        Every row below states only what the code actually does.

        An earlier version asserted "daily rotating salt", "30-day TTL enforced"
        and "all API actions logged" — none of which were implemented. A
        compliance panel that overstates its controls is worse than one that
        admits a gap: it is the screen a reviewer checks the implementation
        against, so a green tick beside an unimplemented control is the most
        expensive kind of wrong. Partial controls are marked as partial.
      */}
      <Section title="Privacy & Compliance" icon={Shield}>
        <Row
          label="Author identifiers"
          value={<span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" />SHA-256 pseudonymised</span>}
          note="Salted one-way digest of platform + user id, truncated to 128 bits. No handle, display name or user id is stored."
        />
        <Row
          label="Salt rotation"
          value={<span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-warn" />Manual</span>}
          note="PSEUDONYM_SALT is static; no automatic rotation. Change it on a schedule to break cross-window linkage — and change it from the committed default, or the digests are dictionary-attackable."
        />
        <Row
          label="Author bio text"
          value={<span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-warn" />Retained</span>}
          note="Stored in raw_posts.metadata_.bio — the profiler infers age and profession from it. A bio is personal data and can be re-identifying; it is deleted with the post at end of retention."
        />
        <Row
          label="Policy query storage"
          value={<span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" />Hash only</span>}
          note="Raw policy text is never written to the database — audit_logs stores a SHA-256 fingerprint and no text column exists."
        />
        <Row
          label="Data retention"
          value={<span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" />{`${retentionDays}-day TTL`}</span>}
          note="expires_at is set on every post at ingest and enforced by the pipeline on each run; Celery beat also runs it hourly in production."
        />
        <Row
          label="Small-cohort suppression"
          value={<span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" />Enforced in service</span>}
          note="Demographic aggregates for cohorts below the minimum reportable group are withheld, so no API caller can narrow a filter until it identifies an individual."
        />
        <Row
          label="Audit logging"
          value={<span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" />State changes</span>}
          note="Every POST / PUT / PATCH / DELETE is logged with the user, the path and a salted IP digest. Request bodies and query strings are never recorded; reads are not logged."
        />
        <Row
          label="Compliance framework"
          value="DPDP Act 2023"
          note="Digital Personal Data Protection Act — controls above are the technical measures, not a legal assessment."
        />
      </Section>

      {/* Target production stack — static, and labelled as such: a local dev run
          uses SQLite with inline tasks, so presenting these as live status
          would be a false reading of the deployment. */}
      <Section title="Production Stack" icon={Server}>
        <Row label="Backend" value="FastAPI + SQLAlchemy 2.0 (async)" />
        <Row label="Database" value="PostgreSQL 15 + pgvector" note="SQLite in local dev mode" />
        <Row label="Task queue" value="Celery 5 + Redis 7" note="inline execution in local dev mode" />
        <Row label="Frontend" value="Next.js 14 App Router + TypeScript" />
        <Row label="NLP stack" value="sentence-transformers · BERTopic · HDBSCAN · UMAP" />
        <Row label="Local LLM" value="Ollama · llama3.2:3b" note="Runs fully offline" />
        <Row label="Platform version" value="1.0.0 (SIH 2026)" />
      </Section>
    </div>
  );
}
