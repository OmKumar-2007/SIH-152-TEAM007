"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, Languages } from "lucide-react";

import { cn, fmtPct } from "@/lib/utils";
import { useChartTheme } from "@/components/charts/theme";
import type { SentimentResult } from "@/lib/api";

/**
 * One analysed text, shown as a reading rather than as five numbers.
 *
 * The previous display was a row of equal tiles: polarity, emotion, intensity,
 * sarcasm, language. Every axis looked equally important and none of them
 * referred to each other — so the single most interesting output this model
 * produces, *"this is praise-shaped and it is sarcastic, so it counts as
 * opposition"*, arrived as `positive` in one box and `likely` in another, with
 * the reader left to join them up.
 *
 * Here the axes are ranked by what they contribute:
 *
 *   1. the resolved verdict, in a sentence, including the inversion if it fired
 *   2. polarity on a diverging meter, because "positive 0.82" and "negative
 *      0.82" are opposite readings that a 0→1 progress bar draws identically
 *   3. emotion and intensity, which qualify the verdict
 *   4. language, which is provenance, and is sized like provenance
 */

// ── Diverging polarity meter ──────────────────────────────────────────────────

export function PolarityMeter({
  sentiment,
  score,
  inverted = false,
  className,
}: {
  sentiment: string;
  score: number;
  /** True when sarcasm flips the surface reading; draws the resolved position too. */
  inverted?: boolean;
  className?: string;
}) {
  const theme = useChartTheme();

  // A 0→1 confidence plus a label is really a signed quantity. Recovering the
  // sign is what lets one axis show both directions without a second chart.
  const signed =
    sentiment === "positive" ? score : sentiment === "negative" ? -score : 0;
  const pos = ((signed + 1) / 2) * 100;
  const resolvedPos = ((-signed + 1) / 2) * 100;

  const color =
    sentiment === "positive"
      ? theme.sentiment.positive
      : sentiment === "negative"
      ? theme.sentiment.negative
      : theme.sentiment.neutral;

  return (
    <div className={className}>
      <div className="relative h-8">
        <div
          className="absolute inset-x-0 top-3 h-2 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${theme.sentiment.negative}55, ${theme.sentiment.neutral}33 50%, ${theme.sentiment.positive}55)`,
          }}
        />
        {/* Centre tick — without it there is no visible zero to read against. */}
        <div className="absolute left-1/2 top-2 h-4 w-px -translate-x-1/2 bg-bdr-strong" />

        {inverted && (
          <div
            className="absolute top-1.5 -translate-x-1/2 transition-[left] duration-500"
            style={{ left: `${resolvedPos}%` }}
            title="Where the sarcasm flag moves the reading"
          >
            <div className="w-5 h-5 rounded-full border-2 border-dashed border-warn bg-surface" />
          </div>
        )}

        <div
          className="absolute top-1 -translate-x-1/2 transition-[left] duration-500"
          style={{ left: `${pos}%` }}
        >
          <div
            className="w-6 h-6 rounded-full border-[3px] border-surface shadow-pop"
            style={{ background: color }}
          />
        </div>
      </div>

      <div className="flex justify-between label -mt-0.5">
        <span>Negative</span>
        <span>Neutral</span>
        <span>Positive</span>
      </div>
    </div>
  );
}

// ── Qualifier bar ─────────────────────────────────────────────────────────────

function Qualifier({
  label,
  value,
  score,
  color,
}: {
  label: string;
  value: string;
  score?: number | null;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="label w-[4.5rem] flex-shrink-0">
        {label}
      </span>
      <span
        className="text-xs font-semibold capitalize w-[5.5rem] flex-shrink-0 truncate"
        style={{ color }}
      >
        {value}
      </span>
      {score != null ? (
        <>
          <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden min-w-[3rem]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(1, score)) * 100}%`, background: color }}
            />
          </div>
          <span className="text-[10px] text-ink-3 tabular-nums w-9 text-right flex-shrink-0">
            {fmtPct(score)}
          </span>
        </>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

// ── The verdict ───────────────────────────────────────────────────────────────

/** The sentence a reader should walk away with. */
function verdictLine(result: SentimentResult): { text: string; stance: string } {
  const surface = result.sentiment;

  if (result.sarcasm_flag) {
    return {
      stance: surface === "positive" ? "against" : "supportive",
      text:
        surface === "positive"
          ? "Reads as praise on the surface, but is flagged sarcastic — so it is recorded as opposition."
          : "Reads as criticism on the surface, but is flagged sarcastic — the literal polarity is not the intent.",
    };
  }

  if (surface === "positive") {
    return { stance: "supportive", text: "Straightforwardly positive, with no inversion detected." };
  }
  if (surface === "negative") {
    return { stance: "against", text: "Straightforwardly negative, with no inversion detected." };
  }
  return {
    stance: "neutral",
    text: "Neither clearly for nor against — informational or mixed in tone.",
  };
}

export function SentimentVerdict({
  result,
  className,
}: {
  result: SentimentResult;
  className?: string;
}) {
  const theme = useChartTheme();
  const verdict = verdictLine(result);
  const sarcastic = !!result.sarcasm_flag;

  const polarityColor =
    result.sentiment === "positive"
      ? theme.sentiment.positive
      : result.sentiment === "negative"
      ? theme.sentiment.negative
      : theme.sentiment.neutral;

  const stanceColor =
    verdict.stance === "supportive"
      ? theme.sentiment.positive
      : verdict.stance === "against"
      ? theme.sentiment.negative
      : theme.sentiment.neutral;

  return (
    <div className={cn("space-y-4 animate-fade-up", className)}>
      {/* 1 — the reading */}
      <div
        className={cn(
          "rounded-xl border px-4 py-3",
          sarcastic ? "bg-warn/[0.07] border-warn/30" : "bg-surface-2 border-bdr"
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {sarcastic && <AlertTriangle className="w-3.5 h-3.5 text-warn flex-shrink-0" />}
          <span className="label font-semibold">
            Recorded as
          </span>

          {sarcastic && (
            <>
              <span className="text-xs font-semibold capitalize line-through text-ink-3">
                {result.sentiment}
              </span>
              <ArrowRight className="w-3 h-3 text-warn flex-shrink-0" />
            </>
          )}

          <span
            className="text-sm font-bold uppercase tracking-wide"
            style={{ color: stanceColor }}
          >
            {verdict.stance}
          </span>
        </div>
        <p className="text-xs text-ink-2 leading-relaxed mt-1.5">{verdict.text}</p>
      </div>

      {/* 2 — polarity, signed */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="label font-semibold">
            Surface polarity
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: polarityColor }}>
            <span className="font-bold capitalize">{result.sentiment}</span>{" "}
            <span className="text-ink-3">{fmtPct(result.sentiment_score)} conf.</span>
          </span>
        </div>
        <PolarityMeter
          sentiment={result.sentiment}
          score={result.sentiment_score}
          inverted={sarcastic}
        />
        {sarcastic && (
          <p className="text-[10px] text-warn mt-1.5 flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-dashed border-warn flex-shrink-0" />
            Dashed marker is where the sarcasm flag moves the reading.
          </p>
        )}
      </div>

      {/* 3 — qualifiers */}
      <div className="space-y-2 pt-1">
        <Qualifier
          label="Emotion"
          value={result.emotion ?? "—"}
          score={result.emotion_score}
          color={theme.emotionColor(result.emotion ?? "neutral")}
        />
        <Qualifier
          label="Intensity"
          value={result.intensity != null ? result.intensity.toFixed(2) : "—"}
          score={result.intensity}
          color={theme.emotion.excitement}
        />
        <Qualifier
          label="Sarcasm"
          value={sarcastic ? "likely" : "not detected"}
          score={result.sarcasm_conf}
          color={sarcastic ? theme.emotion.sarcasm : theme.sentiment.neutral}
        />
      </div>

      {/* 4 — provenance */}
      <div className="flex items-center gap-2 pt-2 border-t border-bdr text-[10px] text-ink-3">
        <Languages className="w-3 h-3 flex-shrink-0" />
        <span className="uppercase tracking-wider font-semibold">
          {result.language}
        </span>
        <span className="text-bdr-strong">·</span>
        <span className="leading-relaxed">{result.epistemic_note}</span>
      </div>
    </div>
  );
}
