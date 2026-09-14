"use client";

import * as React from "react";

import { useTheme } from "@/components/theme-provider";

/**
 * One chart vocabulary for the whole product, in both themes.
 *
 * Recharts needs concrete colour strings — it cannot consume a CSS variable for
 * a stroke or a gradient stop — so the tokens are duplicated here per theme and
 * selected by `useChartTheme()`. Series colours that carry meaning (sentiment,
 * emotion, platform) are tuned separately for each background: the dark values
 * are too dim to read on white, and the light values glare on near-black.
 */

type Mode = "light" | "dark";

const CHART_TOKENS: Record<Mode, { grid: string; tick: string; cursor: string }> = {
  light: {
    grid: "rgba(15, 23, 42, 0.08)",
    tick: "#8A98AB",
    cursor: "rgba(15, 23, 42, 0.04)",
  },
  dark: {
    grid: "rgba(230, 237, 243, 0.07)",
    tick: "#6B7A8F",
    cursor: "rgba(230, 237, 243, 0.05)",
  },
};

const SENTIMENT_BY_MODE: Record<Mode, Record<string, string>> = {
  light: { positive: "#16A34A", neutral: "#94A3B8", negative: "#E11D48" },
  dark: { positive: "#34D399", neutral: "#64748B", negative: "#FB7185" },
};

const EMOTION_BY_MODE: Record<Mode, Record<string, string>> = {
  light: {
    outrage: "#BE123C",
    anger: "#E11D48",
    fear: "#9333EA",
    anxiety: "#7C3AED",
    sadness: "#4F46E5",
    confusion: "#0284C7",
    neutral: "#94A3B8",
    sarcasm: "#A855F7",
    hope: "#0D9488",
    gratitude: "#059669",
    joy: "#16A34A",
    excitement: "#D97706",
  },
  dark: {
    outrage: "#FB7185",
    anger: "#F87171",
    fear: "#C084FC",
    anxiety: "#A78BFA",
    sadness: "#818CF8",
    confusion: "#38BDF8",
    neutral: "#64748B",
    sarcasm: "#D8B4FE",
    hope: "#2DD4BF",
    gratitude: "#4ADE80",
    joy: "#34D399",
    excitement: "#FBBF24",
  },
};

const CATEGORICAL_BY_MODE: Record<Mode, string[]> = {
  light: [
    "#2563EB",
    "#7C3AED",
    "#0D9488",
    "#D97706",
    "#DB2777",
    "#0284C7",
    "#16A34A",
    "#9333EA",
  ],
  dark: [
    "#588CFF",
    "#A78BFA",
    "#2DD4BF",
    "#FBBF24",
    "#F472B6",
    "#38BDF8",
    "#34D399",
    "#C084FC",
  ],
};

/** Brand colours stay fixed — a platform's identity does not change with theme. */
export const PLATFORM: Record<string, string> = {
  twitter: "#1D9BF0",
  telegram: "#2AABEE",
  instagram: "#E1306C",
  reddit: "#FF4500",
  youtube: "#FF0000",
  facebook: "#1877F2",
  news: "#94A3B8",
};

export function platformColor(name: string, fallback?: string | null): string {
  return PLATFORM[name] ?? fallback ?? "#8A98AB";
}

export function useChartTheme() {
  const { resolved } = useTheme();
  const mode: Mode = resolved === "light" ? "light" : "dark";

  return React.useMemo(() => {
    const tokens = CHART_TOKENS[mode];
    const sentiment = SENTIMENT_BY_MODE[mode];
    const emotion = EMOTION_BY_MODE[mode];
    const categorical = CATEGORICAL_BY_MODE[mode];

    return {
      mode,
      grid: tokens.grid,
      cursor: tokens.cursor,
      axis: { fill: tokens.tick, fontSize: 10 },
      sentiment,
      emotion,
      categorical,
      brand: mode === "light" ? "#2563EB" : "#588CFF",
      accent: mode === "light" ? "#7C3AED" : "#A78BFA",
      emotionColor: (name: string) => emotion[name] ?? tokens.tick,
      categoricalColor: (index: number) => categorical[index % categorical.length],
      sentimentColor: (name: string) => sentiment[name] ?? sentiment.neutral,
    };
  }, [mode]);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

/**
 * Recharts' default tooltip cannot express "no measurement".
 *
 * Series carry nulls for gaps, and the default renderer simply omits them, so a
 * reader cannot tell a missing hour from one the chart chose not to show. This
 * one labels it.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit = "",
  formatter,
  footer,
  hideRows = false,
}: {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  unit?: string;
  formatter?: (value: number, name: string) => string;
  footer?: (payload: any[]) => React.ReactNode;
  hideRows?: boolean;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-surface border border-bdr-strong rounded-xl px-3 py-2 shadow-pop text-xs min-w-[9.5rem] animate-fade-in">
      {label !== undefined && (
        <p className="text-ink-3 text-[10px] uppercase tracking-wider mb-1.5 font-medium">
          {label}
        </p>
      )}
      <div className={hideRows ? "hidden" : "space-y-1"}>
        {payload.map((entry, i) => {
          const value = entry.value;
          const missing = value === null || value === undefined;
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-[3px] flex-shrink-0"
                style={{ background: entry.color ?? entry.fill }}
              />
              <span className="text-ink-2 capitalize flex-1 truncate">{entry.name}</span>
              <span
                className={
                  missing ? "text-ink-3 italic" : "text-ink font-semibold tabular-nums"
                }
              >
                {missing
                  ? "no data"
                  : formatter
                  ? formatter(value, String(entry.name))
                  : `${typeof value === "number" ? value.toLocaleString() : value}${unit}`}
              </span>
            </div>
          );
        })}
      </div>
      {footer && (
        <div className={hideRows ? "" : "mt-2 pt-2 border-t border-bdr"}>{footer(payload)}</div>
      )}
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

/**
 * A series' recent shape, inline next to its number.
 *
 * Hand-rolled SVG rather than a Recharts instance: these appear a dozen at a
 * time inside tiles and table rows, and a ResponsiveContainer each would add a
 * resize observer per tile for a path that needs no axes, tooltip or legend.
 */
export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
  strokeWidth = 1.6,
  fill = true,
  className,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
}) {
  const theme = useChartTheme();
  const stroke = color ?? theme.brand;
  const gradientId = React.useId();

  if (!values.length) {
    return <div style={{ width, height }} className={className} />;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pad = strokeWidth;

  const points = values.map((value, i) => {
    const x = i * step;
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
