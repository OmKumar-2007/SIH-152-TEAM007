"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clock,
  FlaskConical,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Network,
  PieChart,
  Settings,
  Share2,
  TrendingUp,
  Users,
} from "lucide-react";

import { cn, fmtNumber } from "@/lib/utils";
import { clearAuth, getStoredUser } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useConnectors, useDashboard } from "@/lib/queries";
import { StatusDot } from "@/components/ui";
import { NitiNetraMark, NitiNetraWordmark } from "@/components/brand/logo";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: string | null;
  /** Reads a live count off the overview payload, so navigation carries signal. */
  count?: (d: NonNullable<ReturnType<typeof useDashboard>["data"]>) => number | null;
};

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Monitor",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
      { href: "/timeline", icon: Clock, label: "Timeline" },
      {
        href: "/trends",
        icon: TrendingUp,
        label: "Trends",
        count: (d) => d.emerging_count || null,
      },
      { href: "/sentiment", icon: MessageSquare, label: "Sentiment" },
    ],
  },
  {
    label: "Audience",
    items: [
      { href: "/demographics", icon: PieChart, label: "Demographics" },
      {
        // Personas and segments are two views of one page now, so this is one
        // entry carrying the segment count rather than two competing ones.
        href: "/audience",
        icon: Users,
        label: "Audience",
        count: (d) => d.active_segments || null,
      },
    ],
  },
  {
    label: "Network",
    items: [
      { href: "/network", icon: Network, label: "Topology" },
      { href: "/diffusion", icon: Share2, label: "Diffusion" },
      { href: "/simulation", icon: FlaskConical, label: "Policy Sim", badge: "LLM" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: summary } = useDashboard();
  const { data: connectors } = useConnectors();

  // Read only after mount. `getStoredUser` reads sessionStorage, which does not
  // exist during server rendering, so calling it inline makes the server emit
  // markup without the user block while the client emits it with — a hydration
  // mismatch that React resolves by discarding and re-rendering the whole tree.
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      // Signing out locally must succeed even if the server call does not.
    }
    clearAuth();
    router.push("/login");
  }

  const healthy = connectors?.filter((c) => c.is_healthy).length ?? 0;
  const total = connectors?.length ?? 0;
  // The corpus is a deliberate mix: platforms with working credentials run live,
  // the rest contribute through their synthetic generator. "live" vs "mock" as a
  // single boolean could not say that — it reported the whole estate as "live"
  // the moment any one connector was, which is the least useful reading.
  const liveCount = connectors?.filter((c) => c.mode === "live").length ?? 0;
  const synthCount = connectors?.filter((c) => c.mode === "synthetic").length ?? 0;

  return (
    <>
    <aside className="fixed left-0 top-0 h-screen w-60 bg-surface border-r border-bdr hidden md:flex flex-col z-40">
      <div className="px-5 py-4 border-b border-bdr">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <NitiNetraMark size={40} className="text-[#1F3A5F] dark:text-ink" />
          <div className="min-w-0">
            <NitiNetraWordmark className="block text-[15px] text-[#1F3A5F] dark:text-ink group-hover:text-brand transition-colors" />
            <div className="label mt-1">Policy intelligence</div>
          </div>
        </Link>

        {/*
          Connector health, not a decorative "live" pill. The old badge read
          "Demo Mode Active" unconditionally — it could not tell an operator that
          a connector had fallen over, which is the one thing this slot is
          well placed to say.
        */}
        <div className="mt-3 px-2.5 py-2 bg-surface-2 rounded-lg">
          <div className="flex items-center gap-2">
            <StatusDot
              live={total > 0 && healthy === total}
              tone={total === 0 ? "idle" : healthy === total ? "success" : healthy ? "warn" : "danger"}
            />
            <span className="text-[11px] font-semibold text-ink-2">
              {total === 0 ? "Connectors unknown" : `${healthy} of ${total} connectors`}
            </span>
          </div>
          {total > 0 && (
            <p className="text-[10px] text-ink-3 mt-1 pl-4 tabular-nums">
              {liveCount} live · {synthCount} synthetic
            </p>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="label font-semibold px-2 pb-2">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const count = summary && item.count ? item.count(summary) : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                    active
                      ? "bg-brand/10 text-brand"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-4 h-4 flex-shrink-0",
                      active ? "text-brand" : "text-ink-3"
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-success/20 text-success border border-success/25">
                      {item.badge}
                    </span>
                  )}
                  {count != null && (
                    <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-brand/10 text-brand">
                      {fmtNumber(count)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-bdr space-y-1">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all",
            pathname === "/settings"
              ? "bg-brand/10 text-brand"
              : "text-ink-2 hover:bg-surface-2 hover:text-ink"
          )}
        >
          <Settings className="w-4 h-4 text-ink-3" />
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ink-2 hover:bg-danger/10 hover:text-danger transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
        {user && (
          <div className="mt-2 px-3 py-2 bg-surface-2 rounded-lg">
            <p className="text-xs font-medium text-ink truncate">{user.full_name}</p>
            <p className="text-[10px] text-ink-3 uppercase tracking-wide">{user.role}</p>
          </div>
        )}
      </div>
    </aside>

    <>
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <button
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setMobileMoreOpen(false)}
          />
          <div className="absolute inset-x-3 bottom-[4.5rem] rounded-2xl border border-bdr bg-surface p-3 shadow-pop">
            <p className="label px-2 pb-2">All pages</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                { href: "/timeline", icon: Clock, label: "Timeline" },
                { href: "/demographics", icon: PieChart, label: "Demographics" },
                { href: "/diffusion", icon: Share2, label: "Diffusion" },
                { href: "/simulation", icon: FlaskConical, label: "Policy simulation" },
                { href: "/settings", icon: Settings, label: "Settings" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMoreOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <item.icon className="h-4 w-4 text-ink-3" />
                  {item.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-danger hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 md:hidden h-16 bg-surface/95 backdrop-blur-xl border-t border-bdr px-2 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="h-full flex items-center justify-around gap-1">
          {[
          { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
          { href: "/trends", icon: TrendingUp, label: "Trends" },
          { href: "/sentiment", icon: MessageSquare, label: "Sentiment" },
          { href: "/audience", icon: Users, label: "Audience" },
          { href: "/network", icon: Network, label: "Network" },
        ].map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                "min-w-0 flex-1 flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[9px] font-medium transition-colors",
                active ? "bg-brand/10 text-brand" : "text-ink-3 hover:text-ink"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="truncate max-w-full">{item.label}</span>
            </Link>
          );
        })}
          <button
            type="button"
            aria-label="More pages"
            aria-expanded={mobileMoreOpen}
            onClick={() => setMobileMoreOpen((open) => !open)}
            className={cn(
              "min-w-0 flex-1 flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[9px] font-medium transition-colors",
              mobileMoreOpen ? "bg-brand/10 text-brand" : "text-ink-3 hover:text-ink"
            )}
          >
            <Layers className="w-4 h-4" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
    </>
  );
}
