"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  RefreshCw,
  WifiOff,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The shared primitive layer.
 *
 * Every colour here is a theme token, never a literal, so light and dark are one
 * implementation rather than two. Loading and error states are separate
 * components on purpose: "no data yet" is a normal state an operator fixes by
 * ingesting, while "the request failed" is a fault they fix by looking at the
 * backend, and collapsing the two sends people to the wrong place.
 */

// ── Surfaces ──────────────────────────────────────────────────────────────────

export function Card({
  className,
  hover = false,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "bg-surface border border-bdr rounded-2xl shadow-card transition-colors",
        hover && "hover:border-bdr-strong",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon: Icon,
  hint,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 px-5 pt-4 pb-3", className)}>
      {Icon && (
        <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-brand" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[13.5px] font-semibold text-ink leading-tight tracking-[-0.01em]">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-ink-3 mt-0.5 leading-snug">{subtitle}</p>
        )}
      </div>
      {hint && (
        <span className="label flex-shrink-0 mt-1">
          {hint}
        </span>
      )}
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

// ── Loading / empty / error ───────────────────────────────────────────────────

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("skeleton rounded-xl", className)} style={style} />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {Array.from({ length: 28 }).map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1"
          // A flat block reads as a broken chart; varying the bars makes it
          // legible as "a chart is coming".
          style={{ height: `${28 + Math.abs(Math.sin(i / 2.2)) * 62}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-6",
        className
      )}
    >
      {Icon && (
        <div className="w-11 h-11 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-ink-3" />
        </div>
      )}
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="text-xs text-ink-3 mt-1.5 max-w-sm leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message = (error as any)?.message ?? "Something went wrong loading this view.";
  const offline = /cannot reach the api/i.test(String(message));

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-8 px-6 rounded-2xl border border-danger/25 bg-danger/[0.06]",
        className
      )}
    >
      {offline ? (
        <WifiOff className="w-7 h-7 text-danger mb-3" />
      ) : (
        <AlertTriangle className="w-7 h-7 text-danger mb-3" />
      )}
      <p className="text-sm font-medium text-ink">
        {offline ? "Backend unreachable" : "Could not load this view"}
      </p>
      <p className="text-xs text-ink-2 mt-1.5 max-w-md leading-relaxed">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="ghost" className="mt-4">
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function Button({
  variant = "ghost",
  className,
  loading,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
  loading?: boolean;
}) {
  const styles = {
    primary: "bg-brand text-white hover:opacity-90 border border-brand font-medium shadow-sm",
    ghost: "bg-surface border border-bdr text-ink-2 hover:text-ink hover:bg-surface-2",
    subtle: "bg-brand/10 border border-brand/25 text-brand hover:bg-brand/15",
    danger: "bg-danger/10 border border-danger/25 text-danger hover:bg-danger/15",
  }[variant];

  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        styles,
        className
      )}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex gap-0.5 bg-surface-2 border border-bdr rounded-xl p-0.5",
        className
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
              active
                ? "bg-surface text-brand shadow-sm"
                : "text-ink-3 hover:text-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Indicators ────────────────────────────────────────────────────────────────

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand" | "accent" | "success" | "danger" | "warn" | "info";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2 border-bdr",
    brand: "bg-brand/10 text-brand border-brand/25",
    accent: "bg-accent/10 text-accent border-accent/25",
    success: "bg-success/10 text-success border-success/25",
    danger: "bg-danger/10 text-danger border-danger/25",
    warn: "bg-warn/10 text-warn border-warn/25",
    info: "bg-info/10 text-info border-info/25",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border whitespace-nowrap",
        tones,
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * A period-over-period change.
 *
 * `invert` exists because direction and desirability are not the same thing: a
 * rise in negative sentiment is red, a rise in post volume is not. Colour is
 * never the only cue — the arrow carries the same information for anyone who
 * cannot distinguish the two hues.
 */
export function Delta({
  current,
  previous,
  invert = false,
  suffix = "",
  className,
}: {
  current: number;
  previous: number;
  invert?: boolean;
  suffix?: string;
  className?: string;
}) {
  if (!previous) {
    return (
      <span className={cn("text-[11px] text-ink-3 tabular-nums", className)}>
        no prior window
      </span>
    );
  }

  const change = ((current - previous) / Math.abs(previous)) * 100;
  const flat = Math.abs(change) < 1;
  const good = invert ? change < 0 : change > 0;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        flat ? "text-ink-3" : good ? "text-success" : "text-danger",
        className
      )}
      title={`${current.toLocaleString()} vs ${previous.toLocaleString()} in the previous window`}
    >
      <Icon className="w-3 h-3" />
      {flat ? "flat" : `${Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}%${suffix}`}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
  className,
  trackClassName,
}: {
  value: number;
  tone?: string;
  className?: string;
  trackClassName?: string;
}) {
  const named: Record<string, string> = {
    brand: "rgb(var(--brand))",
    accent: "rgb(var(--accent))",
    success: "rgb(var(--success))",
    danger: "rgb(var(--danger))",
    warn: "rgb(var(--warn))",
    info: "rgb(var(--info))",
  };
  const color = named[tone] ?? tone;

  return (
    <div
      className={cn("h-1.5 bg-surface-2 rounded-full overflow-hidden", trackClassName)}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-700 ease-out", className)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
      />
    </div>
  );
}

/** Positive / neutral / negative as one bar. */
export function SentimentBar({
  positive,
  neutral,
  negative,
  height = "h-2",
  className,
}: {
  positive: number;
  neutral: number;
  negative: number;
  height?: string;
  className?: string;
}) {
  const total = positive + neutral + negative || 1;
  const parts = [
    { key: "positive", value: positive / total, color: "rgb(var(--success))", label: "Positive" },
    { key: "neutral", value: neutral / total, color: "rgb(var(--ink-3))", label: "Neutral" },
    { key: "negative", value: negative / total, color: "rgb(var(--danger))", label: "Negative" },
  ];

  return (
    <div className={cn("flex rounded-full overflow-hidden gap-px", height, className)}>
      {parts.map((part) => (
        <div
          key={part.key}
          className="transition-all duration-700 ease-out first:rounded-l-full last:rounded-r-full"
          style={{ width: `${part.value * 100}%`, background: part.color }}
          title={`${part.label} ${(part.value * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

export function StatusDot({
  live,
  tone,
  className,
}: {
  live?: boolean;
  tone?: "success" | "danger" | "warn" | "idle" | "brand";
  className?: string;
}) {
  const colors = {
    success: "bg-success",
    danger: "bg-danger",
    warn: "bg-warn",
    brand: "bg-brand",
    idle: "bg-ink-3",
  }[tone ?? (live ? "success" : "idle")];

  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        colors,
        live && "animate-pulse-ring",
        className
      )}
    />
  );
}

/**
 * The epistemic label the platform attaches to every number.
 *
 * Observed / inferred / modeled is a product requirement, not decoration: a
 * reader has to be able to tell a counted value from a model's guess, and the
 * distinction only holds if it is rendered the same way everywhere.
 */
export function EpistemicBadge({
  kind,
  className,
}: {
  kind: "observed" | "inferred" | "modeled";
  className?: string;
}) {
  const tone = { observed: "success", inferred: "brand", modeled: "accent" }[kind] as
    | "success"
    | "brand"
    | "accent";

  const title = {
    observed: "Counted directly from ingested data.",
    inferred: "Derived by a model from public signals; probabilistic.",
    modeled: "Synthesised scenario output, not a prediction of behaviour.",
  }[kind];

  return (
    <Badge tone={tone} className={className}>
      <span title={title}>{kind}</span>
    </Badge>
  );
}

// ── Live-feel primitives ──────────────────────────────────────────────────────

/**
 * A number that counts to its new value instead of snapping.
 *
 * On a dashboard that refreshes in the background, a figure replacing itself
 * silently is easy to miss — the eye has nothing to catch. Animating the change
 * makes an update legible as an update. The tween is skipped on first mount
 * (nothing to animate from) and for very large jumps, where a spinning counter
 * is noise rather than information.
 */
export function AnimatedNumber({
  value,
  format = (n: number) => n.toLocaleString(),
  className,
  duration = 650,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = React.useState(value);
  const previous = React.useRef(value);
  const frame = React.useRef(0);
  const mounted = React.useRef(false);

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previous.current = value;
      setDisplay(value);
      return;
    }

    const from = previous.current;
    const to = value;
    previous.current = value;

    if (from === to) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic: fast at first, settling gently, so the final value is
      // readable before the animation technically ends.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return (
    <span className={cn("tabular-nums", className)}>{format(Math.round(display))}</span>
  );
}

/** "Live" chip whose dot pulses while a refresh is actually in flight. */
export function LivePill({
  active,
  label = "Live",
  className,
}: {
  active: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider transition-colors",
        active
          ? "bg-success/10 border-success/30 text-success"
          : "bg-surface-2 border-bdr text-ink-3",
        className
      )}
    >
      <StatusDot live={active} tone={active ? "success" : "idle"} />
      {label}
    </span>
  );
}

/**
 * Seconds until the next automatic refetch.
 *
 * A dashboard that claims to be live should be able to say when it will next
 * update; "Live" with no cadence is a decoration.
 */
export function RefreshCountdown({
  lastUpdated,
  intervalMs,
  className,
}: {
  lastUpdated?: number;
  intervalMs: number;
  className?: string;
}) {
  const [remaining, setRemaining] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => {
      const elapsed = Date.now() - lastUpdated;
      setRemaining(Math.max(0, Math.ceil((intervalMs - elapsed) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated, intervalMs]);

  if (remaining === null) return null;

  return (
    <span className={cn("text-[10px] text-ink-3 tabular-nums", className)}>
      next in {remaining}s
    </span>
  );
}
