"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Briefcase,
  Clock,
  Globe2,
  Info,
  Languages,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useDemographics, useProfilingCoverage, useRefreshDemographics } from "@/lib/queries";
import { cn, fmtNumber, fmtPct } from "@/lib/utils";
import {
  ChartTooltip,
  useChartTheme,
} from "@/components/charts/theme";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ChartSkeleton,
  EmptyState,
  EpistemicBadge,
  ErrorState,
  ProgressBar,
  Skeleton,
} from "@/components/ui";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  ur: "Urdu",
};

function toRows(dist: Record<string, number> | undefined, names?: Record<string, string>) {
  return Object.entries(dist ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      key,
      name: names?.[key] ?? key.replace(/_/g, " "),
      value,
      pct: Math.round(value * 1000) / 10,
    }));
}

/**
 * Audience demographics.
 *
 * The coverage panel is first, above every distribution, and that ordering is the
 * point: a profession breakdown built from 30% of the audience and one built from
 * 80% look identical on a chart, and reading the first as if it were the second is
 * the most likely way to misuse this page.
 */
export default function DemographicsPage() {
  const theme = useChartTheme();
  const overview = useDemographics();
  const coverage = useProfilingCoverage();
  const refresh = useRefreshDemographics();

  const data = overview.data;

  const ages = useMemo(() => toRows(data?.age_distribution), [data]);
  const geo = useMemo(() => toRows(data?.geo_distribution), [data]);
  const languages = useMemo(
    () => toRows(data?.language_distribution, LANGUAGE_NAMES),
    [data]
  );
  const professions = useMemo(() => toRows(data?.profession_distribution), [data]);
  const interests = useMemo(() => toRows(data?.interest_distribution), [data]);
  const platforms = useMemo(() => toRows(data?.platform_distribution), [data]);

  const hours = useMemo(() => {
    const dist = data?.activity_by_hour ?? {};
    return Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, "0")}`,
      share: Math.round((dist[String(hour)] ?? 0) * 1000) / 10,
    }));
  }, [data]);

  if (overview.isError) {
    return (
      <div className="p-6">
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      </div>
    );
  }

  if (overview.isLoading) {
    return (
      <div className="p-5 lg:p-6 space-y-5">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-32" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (data?.suppressed) {
    return (
      <div className="p-6">
        <Card className="border-warn/30">
          <CardBody className="pt-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-warn flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-ink mb-1">Breakdown withheld</h3>
                <p className="text-sm text-ink-2">{data.reason}</p>
                <p className="text-xs text-ink-3 mt-2">
                  Cohort size {data.cohort_size}, below the minimum reportable group of{" "}
                  {coverage.data?.min_reportable_group ?? 5}. Ingest more data, then rebuild
                  profiles.
                </p>
                <Button
                  variant="subtle"
                  className="mt-4"
                  loading={refresh.isPending}
                  onClick={() =>
                    refresh.mutate(30, {
                      onSuccess: (r: any) =>
                        toast.success(`Rebuilt ${r.profiles_written} profiles`),
                      onError: (e: any) => toast.error(e?.message ?? "Rebuild failed"),
                    })
                  }
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Rebuild profiles
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-6 space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 flex-1">
          <Kpi
            icon={Users}
            label="Authors profiled"
            value={fmtNumber(data?.cohort_size ?? 0)}
            sub={`${fmtNumber(coverage.data?.assigned_to_segment ?? 0)} in a segment`}
          />
          <Kpi
            icon={Info}
            label="Mean confidence"
            value={fmtPct(data?.mean_confidence ?? 0)}
            sub="across all inferred fields"
            tone={(data?.mean_confidence ?? 0) < 0.5 ? "warn" : undefined}
          />
          <Kpi
            icon={Languages}
            label="Languages"
            value={String(languages.length)}
            sub={languages[0] ? `${languages[0].name} leads at ${languages[0].pct}%` : undefined}
          />
          <Kpi
            icon={Globe2}
            label="Regions"
            value={String(geo.length)}
            sub={geo[0] ? `${geo[0].name} leads at ${geo[0].pct}%` : undefined}
          />
        </div>

        <Button
          variant="subtle"
          loading={refresh.isPending}
          onClick={() =>
            refresh.mutate(30, {
              onSuccess: (r: any) =>
                toast.success(
                  `Rebuilt ${r.profiles_written} profiles, updated ${r.segments_updated} segments`
                ),
              onError: (e: any) => toast.error(e?.message ?? "Rebuild failed"),
            })
          }
        >
          {refresh.isPending ? null : <RefreshCw className="w-3.5 h-3.5" />}
          {refresh.isPending ? "Rebuilding…" : "Rebuild profiles"}
        </Button>
      </div>

      {/* Coverage first — every chart below has to be read against it. */}
      {data?.coverage && (
        <Card className="border-bdr-strong">
          <CardHeader
            icon={ShieldCheck}
            title="Inference coverage"
            subtitle="What share of the cohort each inference was actually made for"
            actions={<EpistemicBadge kind="inferred" />}
          />
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <CoverageBar label="Age bracket known" share={data.coverage.age_known} />
              <CoverageBar label="Geography known" share={data.coverage.geo_known} />
              <CoverageBar label="Profession known" share={data.coverage.profession_known} />
            </div>
            {data.epistemic_note && (
              <p className="text-xs text-ink-3 mt-4 leading-relaxed">{data.epistemic_note}</p>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader icon={Users} title="Age brackets" hint="inferred" />
          <CardBody>
            {!ages.length ? (
              <EmptyState icon={Users} title="No age signal found" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ages} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="name" tick={theme.axis} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={theme.axis}
                    tickLine={false}
                    axisLine={false}
                    unit="%"
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(230,236,245,0.04)" }}
                    content={<ChartTooltip formatter={(v) => `${v}%`} />}
                  />
                  <Bar dataKey="pct" name="share" radius={[3, 3, 0, 0]}>
                    {ages.map((_, i) => (
                      <Cell key={i} fill={theme.categoricalColor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Globe2} title="Geographic distribution" hint="inferred" />
          <CardBody>
            {!geo.length ? (
              <EmptyState icon={Globe2} title="No geographic signal found" />
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie
                      data={geo}
                      dataKey="pct"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={84}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {geo.map((_, i) => (
                        <Cell key={i} fill={theme.categoricalColor(i)} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 min-w-0">
                  {geo.map((row, i) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: theme.categoricalColor(i) }}
                      />
                      <span className="text-xs text-ink-2 flex-1 truncate">{row.name}</span>
                      <span className="text-xs font-semibold text-ink tabular-nums">
                        {row.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Languages} title="Languages" hint="from post text" />
          <CardBody>
            <DistributionList rows={languages} empty="No language data" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Briefcase} title="Professional background" hint="inferred" />
          <CardBody>
            <DistributionList rows={professions} empty="No profession signal yet" />
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={Clock}
            title="Activity rhythm"
            subtitle="Share of posts by hour of day (IST) — when this audience is actually reachable"
          />
          <CardBody>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={hours} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="hour" tick={theme.axis} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={theme.axis} tickLine={false} axisLine={false} unit="%" width={40} />
                <Tooltip
                  cursor={{ fill: "rgba(230,236,245,0.04)" }}
                  content={<ChartTooltip formatter={(v) => `${v}% of posts`} />}
                />
                <Bar dataKey="share" name="share" radius={[2, 2, 0, 0]}>
                  {hours.map((row, i) => (
                    <Cell
                      key={i}
                      // Night hours are tinted differently so the diurnal shape
                      // is legible without reading the axis.
                      fill={i >= 6 && i < 22 ? "#4C9AFF" : "#2E4468"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Sparkles} title="Top interests" hint="inferred" />
          <CardBody>
            {!interests.length ? (
              <EmptyState icon={Sparkles} title="No interests inferred yet" />
            ) : (
              <div className="space-y-1.5">
                {interests.slice(0, 9).map((row, i) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between px-3 py-2 bg-surface-2 rounded-lg"
                  >
                    <span className="text-xs text-ink-2 capitalize truncate">{row.name}</span>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: theme.categoricalColor(i) }}
                    >
                      {row.pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {platforms.length > 0 && (
        <Card>
          <CardHeader
            icon={Globe2}
            title="Platform reach of the profiled cohort"
            subtitle="Which source each profiled author was primarily seen on"
          />
          <CardBody>
            <DistributionList rows={platforms} empty="" columns={2} />
          </CardBody>
        </Card>
      )}

      <p className="text-xs text-ink-3 flex items-start gap-2 leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        Authors are pseudonymous throughout — no handle, display name or user id is
        stored. Cohorts smaller than {coverage.data?.min_reportable_group ?? 5} are
        suppressed entirely rather than returned, so an aggregate cannot be narrowed
        until it identifies an individual.
      </p>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-2 text-ink-3 mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-widest font-semibold truncate">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-xl font-bold tabular-nums",
          tone === "warn" ? "text-warn" : "text-ink"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-ink-3 mt-0.5 truncate">{sub}</p>}
    </Card>
  );
}

function CoverageBar({ label, share }: { label: string; share: number }) {
  const pct = Math.round(share * 100);
  const tone = pct >= 60 ? "success" : pct >= 30 ? "warn" : "danger";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-ink-2">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-ink font-semibold tabular-nums">{pct}%</span>
          <Badge tone={tone as any}>
            {pct >= 60 ? "solid" : pct >= 30 ? "partial" : "thin"}
          </Badge>
        </span>
      </div>
      <ProgressBar value={share} tone={tone} />
    </div>
  );
}

function DistributionList({
  rows,
  empty,
  columns = 1,
}: {
  rows: { key: string; name: string; pct: number }[];
  empty: string;
  columns?: number;
}) {
  const theme = useChartTheme();
  if (!rows.length) {
    return empty ? <p className="text-sm text-ink-3">{empty}</p> : null;
  }
  return (
    <div
      className={cn(
        "gap-x-6 gap-y-2",
        columns > 1 ? "grid grid-cols-1 sm:grid-cols-2" : "space-y-2"
      )}
    >
      {rows.slice(0, columns > 1 ? 12 : 9).map((row, i) => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="text-xs text-ink-2 w-24 truncate capitalize">{row.name}</span>
          <div className="flex-1">
            <ProgressBar value={row.pct / 100} tone={theme.categoricalColor(i)} />
          </div>
          <span className="text-xs text-ink font-medium tabular-nums w-11 text-right">
            {row.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}
