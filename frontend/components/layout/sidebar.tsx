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
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import { cn, fmtNumber } from "@/lib/utils";
import { clearAuth, getStoredUser } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useConnectors, useDashboard } from "@/lib/queries";
import { StatusDot } from "@/components/ui";

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
      { href: "/audience", icon: Users, label: "Audience" },
      {
        href: "/segments",
        icon: Layers,
        label: "Segments",
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
  const live = connectors?.some((c) => c.mode === "live") ?? false;

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-surface border-r border-bdr flex flex-col z-40">
      <div className="px-5 py-4 border-b border-bdr">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-brand" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink leading-tight group-hover:text-brand transition-colors">
              SIH Intelligence
            </div>
            <div className="text-[10px] text-ink-3 uppercase tracking-widest">
              Analytics Platform
            </div>
          </div>
        </Link>

        {/*
          Connector health, not a decorative "live" pill. The old badge read
          "Demo Mode Active" unconditionally — it could not tell an operator that
          a connector had fallen over, which is the one thing this slot is
          well placed to say.
        */}
        <div className="mt-3 flex items-center gap-2 px-2.5 py-1.5 bg-surface-2 rounded-lg">
          <StatusDot
            live={total > 0 && healthy === total}
            tone={total === 0 ? "idle" : healthy === total ? "success" : healthy ? "warn" : "danger"}
          />
          <span className="text-[10px] font-semibold text-ink-2 uppercase tracking-wider">
            {total === 0
              ? "Connectors unknown"
              : `${healthy}/${total} connectors ${live ? "live" : "mock"}`}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="text-[10px] font-bold text-ink-3 uppercase tracking-widest px-2 pb-2">
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
  );
}
