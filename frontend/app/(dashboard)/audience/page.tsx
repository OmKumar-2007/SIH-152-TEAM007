"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { PersonasView } from "@/components/audience/personas-view";
import { SegmentsView } from "@/components/audience/segments-view";
import { Skeleton } from "@/components/ui";

/**
 * Audience — personas and segments in one place.
 *
 * These were two sidebar entries answering one question. A reader looking for
 * "who is saying this" had to know that *Audience* meant the persona pipeline
 * and *Segments* meant the clustering table — a distinction about which backend
 * service produced the grouping, not about what the reader wanted to know.
 * Neither page was complete alone: personas carry behaviour and evolution,
 * segments carry topic mix, geography and rhythm.
 *
 * So they are one page with two views. The split survives as a tab, because the
 * two groupings genuinely are built differently and a reader comparing them
 * needs to know which one they are looking at — but it is no longer a navigation
 * decision made before you can see either.
 *
 * The active view lives in the query string, so a particular view stays
 * linkable and survives a refresh.
 */

const VIEWS = [
  {
    key: "personas",
    label: "Personas",
    icon: Users,
    hint: "Built by the persona pipeline from per-user behaviour — these evolve across refits",
  },
  {
    key: "segments",
    label: "Segments",
    icon: Layers,
    hint: "Behavioural clusters from the segmentation table — topic mix, geography and rhythm",
  },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

function AudienceTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const active: ViewKey = params.get("view") === "segments" ? "segments" : "personas";

  const select = useCallback(
    (key: ViewKey) => {
      // `replace`, not `push`: flipping a tab is not a navigation step someone
      // wants to walk back through with the browser's back button.
      router.replace(key === "personas" ? "/audience" : `/audience?view=${key}`, {
        scroll: false,
      });
    },
    [router]
  );

  const hint = VIEWS.find((v) => v.key === active)!.hint;

  return (
    <div className="p-5 lg:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2">
        <div
          className="inline-flex gap-0.5 bg-surface-2 border border-bdr rounded-xl p-0.5 self-start"
          role="tablist"
          aria-label="Audience view"
        >
          {VIEWS.map((view) => {
            const selected = view.key === active;
            return (
              <button
                key={view.key}
                role="tab"
                aria-selected={selected}
                onClick={() => select(view.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  selected
                    ? "bg-surface text-brand shadow-sm"
                    : "text-ink-3 hover:text-ink"
                )}
              >
                <view.icon className="w-3.5 h-3.5" />
                {view.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-3 leading-snug min-w-0">{hint}</p>
      </div>

      {active === "personas" ? <PersonasView /> : <SegmentsView />}
    </div>
  );
}

export default function AudiencePage() {
  // `useSearchParams` forces the subtree to be client-rendered; the boundary
  // keeps that from deopting the whole route into a blank first paint.
  return (
    <Suspense
      fallback={
        <div className="p-5 lg:p-6 space-y-5">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-[30rem]" />
        </div>
      }
    >
      <AudienceTabs />
    </Suspense>
  );
}
