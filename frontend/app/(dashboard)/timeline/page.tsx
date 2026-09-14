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
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Radio,
  Users,
  XCircle,
} from "lucide-react";

import { useActivity, useCoverage, useIngestionRuns } from "@/lib/queries";
import { cn, fmtNumber } from "@/lib/utils";
import type { CoverageRow, IngestionRun } from "@/lib/api";
import {
  ChartTooltip,
  platformColor,
  useChartTheme,
} from "@/components/charts/theme";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  Segmented,
  Skeleton,
  StatusDot,
} from "@/components/ui";

const WINDOWS = [
  { value: "24h", label: "24h", hours: 24, granularity: "hour" as const },
  { value: "48h", label: "48h", hours: 48, granularity: "hour" as const },
  { value: "7d", label: "7d", hours: 168, granularity: "hour" as const },
  { value: "30d", label: "30d", hours: 720, granularity: "day" as const },
];

const STATUS = {
  ok: { icon: CheckCircle2, tone: "text-success", badge: "success" as const },
  partial: { icon: AlertTriangle, tone: "text-warn", badge: "warn" as const },
  failed: { icon: XCircle, tone: "text-danger", badge: "danger" as const },
};

export default function TimelinePage() {
  const theme = useChartTheme();
  const [windowKey, setWindowKey] = useState("48h");
  const window = WINDOWS.find((w) => w.value === windowKey)!;

  const activity = useActivity(window.hours, window.granularity);
  const coverage = useCoverage();
  const runs = useIngestionRuns(40);

  const { chart, platforms } = useMemo(() => {
    const points = activity.data?.points ?? [];
    const names = Array.from(
      new Set(points.flatMap((p) => Object.keys(p.by_platform)))
    );
    return {
      platforms: names,
      chart: points.map((point) => {
        const row: Record<string, number | string> = {
          time:
            window.granularity === "day"
              ? new Date(point.timestamp).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })
              : new Date(point.timestamp).toLocaleString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  ...(window.hours > 48 ? { month: "short", day: "numeric" } : {}),
                }),
          total: point.total,
        };
        for (const name of names) {
          row[name] = point.by_platform[name]?.volume ?? 0;
        }
        return row;
      }),
    };
  }, [activity.data, window]);

  const totals = useMemo(() => {
    const rows = coverage.data ?? [];
    return {
      posts: rows.reduce((sum, r) => sum + r.total_posts, 0),
      authors: rows.reduce((sum, r) => sum + r.unique_authors, 0),
      platforms: rows.length,
      span: Math.max(0, ...rows.map((r) => r.span_hours)),
    };
  }, [coverage.data]);

  const runStats = useMemo(() => {
    const rows = runs.data ?? [];
    const failed = rows.filter((r) => r.status === "failed").length;
    const partial = rows.filter((r) => r.status === "partial").length;
    const inserted = rows.reduce((sum, r) => sum + r.posts_inserted, 0);
    const fetched = rows.reduce((sum, r) => sum + r.posts_fetched, 0);
    return {
      failed,
      partial,
      inserted,
      dedupeRate: fetched ? 1 - inserted / fetched : 0,
      total: rows.length,
    };
  }, [runs.data]);

  return (
    <div className="p-5 lg:p-6 space-y-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          <Kpi
            icon={Database}
            label="Posts in record"
            value={coverage.isLoading ? null : fmtNumber(totals.posts)}
          />
          <Kpi
            icon={Users}
            label="Distinct authors"
            value={coverage.isLoading ? null : fmtNumber(totals.authors)}
          />
          <Kpi
            icon={Activity}
            label="Platforms covered"
            value={coverage.isLoading ? null : String(totals.platforms)}
          />
          <Kpi
            icon={Clock}
            label="Record spans"
            value={
              coverage.isLoading
                ? null
                : totals.span >= 48
                ? `${(totals.span / 24).toFixed(1)} days`
                : `${Math.round(totals.span)} hours`
            }
          />
        </div>
        <Segmented
          value={windowKey}
          onChange={setWindowKey}
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
        />
      </div>

      <Card>
        <CardHeader
          icon={Activity}
          title="Conversation volume by platform"
          subtitle="Stacked, so platform mix and total volume are readable in one pass"
          hint={window.granularity === "day" ? "daily buckets" : "hourly buckets"}
        />
        <CardBody>
          {activity.isError ? (
            <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
          ) : activity.isLoading ? (
            <ChartSkeleton height={300} />
          ) : chart.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No posts in this window"
              hint="Widen the window, or run an ingestion cycle from the overview."
            />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chart} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={theme.axis}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.max(1, Math.floor(chart.length / 10))}
                  />
                  <YAxis tick={theme.axis} tickLine={false} axisLine={false} width={46} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        footer={(payload) => (
                          <p className="text-[10px] text-ink-3 tabular-nums">
                            {payload
                              .reduce((sum, entry) => sum + (entry.value ?? 0), 0)
                              .toLocaleString()}{" "}
                            posts in this bucket
                          </p>
                        )}
                      />
                    }
                  />
                  {platforms.map((name) => {
                    const color = platformColor(
                      name,
                      activity.data?.platform_colors?.[name] ?? undefined
                    );
                    return (
                      <Area
                        key={name}
                        type="monotone"
                        dataKey={name}
                        name={name}
                        stackId="1"
                        stroke={color}
                        fill={color}
                        fillOpacity={0.32}
                        strokeWidth={1.25}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2">
                {platforms.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 text-[10px] text-ink-3"
                  >
                    <span
                      className="w-2 h-2 rounded-sm"
                      style={{
                        background: platformColor(
                          name,
                          activity.data?.platform_colors?.[name] ?? undefined
                        ),
                      }}
                    />
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            icon={Clock}
            title="Historical coverage"
            subtitle="What period each source can actually be analysed over"
          />
          <CardBody>
            {coverage.isError ? (
              <ErrorState error={coverage.error} onRetry={() => coverage.refetch()} />
            ) : coverage.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : !coverage.data?.length ? (
              <EmptyState icon={Clock} title="Nothing ingested yet" />
            ) : (
              <div className="space-y-2">
                {coverage.data.map((row) => (
                  <CoverageRowView key={row.platform} row={row} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={Database}
            title="Ingestion audit trail"
            subtitle={
              runs.data?.length
                ? `${runStats.total} recent cycles · ${runStats.failed} failed, ${runStats.partial} partial · ${Math.round(runStats.dedupeRate * 100)}% deduplicated`
                : "Why the timeline has the shape it has"
            }
            actions={
              runStats.failed > 0 ? (
                <Badge tone="danger">{runStats.failed} failed</Badge>
              ) : runStats.partial > 0 ? (
                <Badge tone="warn">{runStats.partial} partial</Badge>
              ) : undefined
            }
          />
          <CardBody>
            {runs.isError ? (
              <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
            ) : runs.isLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : !runs.data?.length ? (
              <EmptyState
                icon={Database}
                title="No ingestion runs recorded"
                hint="Each cycle writes a row here, so gaps in the chart above can be explained rather than guessed at."
              />
            ) : (
              <div className="space-y-1 max-h-[22rem] overflow-y-auto pr-1">
                {runs.data.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-2 text-ink-3 mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-widest font-semibold truncate">
          {label}
        </span>
      </div>
      {value === null ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <p className="text-xl font-bold text-ink tabular-nums">{value}</p>
      )}
    </Card>
  );
}

function CoverageRowView({ row }: { row: CoverageRow }) {
  const minutes = row.freshness_minutes;
  const tone =
    minutes == null ? "idle" : minutes < 30 ? "success" : minutes < 180 ? "warn" : "danger";
  const label =
    minutes == null
      ? "—"
      : minutes < 90
      ? `${Math.round(minutes)}m behind`
      : `${(minutes / 60).toFixed(1)}h behind`;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 rounded-lg">
      <span
        className="w-1 h-9 rounded-full flex-shrink-0"
        style={{ background: platformColor(row.platform) }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink truncate">{row.display_name}</span>
          <StatusDot tone={tone as any} />
        </div>
        <p className="text-[10px] text-ink-3 tabular-nums">
          {fmtNumber(row.total_posts)} posts · {fmtNumber(row.unique_authors)} authors ·{" "}
          {row.languages} language{row.languages === 1 ? "" : "s"}
        </p>
        {row.earliest_post && row.latest_post && (
          <p className="text-[10px] text-ink-3">
            {new Date(row.earliest_post).toLocaleDateString()} →{" "}
            {new Date(row.latest_post).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p
          className={cn(
            "text-[11px] font-medium",
            tone === "success"
              ? "text-success"
              : tone === "warn"
              ? "text-warn"
              : tone === "danger"
              ? "text-danger"
              : "text-ink-3"
          )}
        >
          {label}
        </p>
        <p className="text-[10px] text-ink-3 tabular-nums">
          {row.span_hours >= 48
            ? `${(row.span_hours / 24).toFixed(1)}d span`
            : `${Math.round(row.span_hours)}h span`}
        </p>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: IngestionRun }) {
  const status = STATUS[run.status] ?? STATUS.ok;
  const StatusIcon = status.icon;
  const duration =
    run.finished_at && run.started_at
      ? (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg border",
        run.status === "failed"
          ? "bg-danger/5 border-danger/20"
          : run.status === "partial"
          ? "bg-warn/5 border-warn/20"
          : "bg-bg border-bdr"
      )}
    >
      <StatusIcon className={cn("w-3.5 h-3.5 flex-shrink-0", status.tone)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink capitalize">{run.platform}</span>
          <Badge tone={run.mode === "live" ? "success" : "neutral"}>{run.mode}</Badge>
        </div>
        <p className="text-[10px] text-ink-3 tabular-nums">
          +{fmtNumber(run.posts_inserted)} new of {fmtNumber(run.posts_fetched)} fetched ·{" "}
          {fmtNumber(run.duplicates_skipped)} duplicate
          {duration != null && ` · ${duration.toFixed(0)}s`}
        </p>
        {run.error && (
          <p className="text-[10px] text-danger mt-0.5 line-clamp-1" title={run.error}>
            {run.error}
          </p>
        )}
      </div>
      <span className="text-[10px] text-ink-3 flex-shrink-0 tabular-nums">
        {new Date(run.started_at).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}
