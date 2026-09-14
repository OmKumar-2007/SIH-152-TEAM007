"use client";

import { useEffect, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  Database,
  FlaskConical,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Users,
} from "lucide-react";

import { cn, fmtNumber } from "@/lib/utils";
import { useDashboard } from "@/lib/queries";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Badge, Button, LivePill } from "@/components/ui";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Overview",
    subtitle: "What changed in public discourse in the last 24 hours",
  },
  "/timeline": {
    title: "Timeline",
    subtitle: "The time-stamped record every other view is aligned against",
  },
  "/trends": {
    title: "Trends",
    subtitle: "Lifecycle, drivers, forecast and the posts behind each topic",
  },
  "/sentiment": {
    title: "Sentiment",
    subtitle: "Polarity, the full emotion taxonomy, stance and sarcasm",
  },
  "/demographics": {
    title: "Demographics",
    subtitle: "Aggregate, anonymised profile inferred from public signals",
  },
  "/audience": {
    title: "Audience",
    subtitle: "Persona groups, how they react and how they change",
  },
  "/segments": {
    title: "Segments",
    subtitle: "Behavioural clusters and their generated personas",
  },
  "/network": {
    title: "Topology",
    subtitle: "Influence propagation, communities and bridge actors",
  },
  "/diffusion": {
    title: "Diffusion",
    subtitle: "Cascades and segment-to-segment narrative travel",
  },
  "/simulation": {
    title: "Policy simulation",
    subtitle: "Projected reaction by segment, with its own disclaimer",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Model state, local LLM and privacy posture",
  },
};

/**
 * Page chrome: what this screen is, how fresh it is, whether data is moving.
 *
 * The live signal reads `useIsFetching` rather than a decorative timer, so it is
 * reporting a fact — something is actually in flight — instead of implying one.
 */
export function Topbar() {
  const pathname = usePathname();
  const client = useQueryClient();
  const fetching = useIsFetching();
  const { data, dataUpdatedAt, isError } = useDashboard();

  const meta = TITLES[pathname] ?? {
    title: "SIH Intelligence",
    subtitle: "Public discourse analytics",
  };

  const [ago, setAgo] = useState("");
  useEffect(() => {
    function tick() {
      if (!dataUpdatedAt) return setAgo("");
      const seconds = Math.round((Date.now() - dataUpdatedAt) / 1000);
      setAgo(
        seconds < 10
          ? "just now"
          : seconds < 60
          ? `${seconds}s ago`
          : `${Math.round(seconds / 60)}m ago`
      );
    }
    tick();
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [dataUpdatedAt]);

  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-bdr">
      {/* A thin sweep while a background refetch is in flight — the page-level
          counterpart to the live pill, visible without reading anything. */}
      {fetching > 0 && <span className="refetch-bar" />}

      <div className="flex items-center gap-4 px-5 lg:px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold text-ink truncate tracking-tight">
              {meta.title}
            </h1>
            {data?.demo_mode && (
              <Badge tone="warn">
                <FlaskConical className="w-2.5 h-2.5" />
                Synthetic
              </Badge>
            )}
            <LivePill active={fetching > 0} />
          </div>
          <p className="text-xs text-ink-3 truncate">{meta.subtitle}</p>
        </div>

        {data && (
          <div className="hidden lg:flex items-center gap-5 text-xs border-l border-bdr pl-5">
            <Stat
              icon={Database}
              label="corpus"
              value={`${fmtNumber(data.total_posts)} posts`}
              sub={`${Math.round(data.nlp_coverage * 100)}% analysed`}
            />
            <Stat
              icon={Users}
              label="voices"
              value={fmtNumber(data.unique_authors)}
              sub={`${data.languages_seen} languages`}
            />
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="hidden sm:flex items-center gap-1.5 text-[11px] text-ink-3"
            title={
              isError
                ? "The last refresh failed"
                : "Time since the overview last updated"
            }
          >
            {isError ? (
              <AlertTriangle className="w-3 h-3 text-danger" />
            ) : (
              <Clock className="w-3 h-3" />
            )}
            <span className="tabular-nums">{ago || "—"}</span>
          </div>

          <ThemeToggle />

          <Button
            onClick={() => client.invalidateQueries()}
            loading={fetching > 0}
            title="Refresh every view on this page"
          >
            {fetching > 0 ? null : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * Light / dark / system.
 *
 * Three states rather than two: "system" is a real preference, and collapsing it
 * into a binary means someone who wants the app to follow their OS has to keep
 * changing it by hand twice a day.
 */
function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const options: { value: Theme; label: string; icon: React.ElementType }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  const Current = theme === "system" ? Monitor : resolved === "dark" ? Moon : Sun;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        title={`Theme: ${theme}`}
        aria-label="Change theme"
        className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg border border-bdr bg-surface text-ink-2 hover:text-ink hover:bg-surface-2 transition-all active:scale-95"
      >
        <Current className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-36 bg-surface border border-bdr rounded-xl shadow-pop p-1 z-50 animate-fade-in">
          {options.map((option) => {
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                onMouseDown={(e) => {
                  // Fires before the button's blur, so the menu does not close
                  // out from under the click.
                  e.preventDefault();
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
                  active
                    ? "bg-brand/10 text-brand font-medium"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                )}
              >
                <option.icon className="w-3.5 h-3.5" />
                {option.label}
                {active && <Check className="w-3 h-3 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
      <div className="leading-tight">
        <p className="text-[9px] text-ink-3 uppercase tracking-wider">{label}</p>
        <p className="text-[11px] font-semibold text-ink tabular-nums">{value}</p>
        {sub && <p className="text-[9px] text-ink-3 tabular-nums">{sub}</p>}
      </div>
    </div>
  );
}

export { TITLES };
