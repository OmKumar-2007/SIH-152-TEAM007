"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  GitFork,
  Network as NetworkIcon,
  RefreshCw,
  Share2,
  Users,
} from "lucide-react";

import { useNetwork } from "@/lib/queries";
import { cn, fmtNumber, sentimentColor } from "@/lib/utils";
import type {
  NetworkBridge,
  NetworkCommunity,
  NetworkGraph,
  NetworkInfluencer,
  NetworkNode,
} from "@/lib/api";
import {
  platformColor,
  useChartTheme,
} from "@/components/charts/theme";
import {
  ForceGraph,
  communityColor,
  sentimentFill,
  type ColorBy,
} from "@/components/charts/force-graph";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  EpistemicBadge,
  ErrorState,
  Segmented,
  Skeleton,
} from "@/components/ui";

/**
 * The graph itself now lives in `components/charts/force-graph.tsx`.
 *
 * The layout that used to sit here integrated a Fruchterman-Reingold force
 * into a velocity with no cap on the resulting displacement, so with 120 nodes
 * every node overshot the canvas and was caught by the position clamp. The
 * graph rendered as a handful of piles in the corners. See that file for what
 * replaced it.
 */

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "graph" | "influencers" | "communities" | "bridges";

export default function NetworkPage() {
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<Tab>("graph");
  const [colorBy, setColorBy] = useState<ColorBy>("community");
  const [highlight, setHighlight] = useState<string | null>(null);

  const network = useNetwork(days);
  const graph = network.data;
  const stats = graph?.stats;

  const focusOn = useCallback((label: string, nodeId?: string) => {
    setTab("graph");
    setHighlight(nodeId ?? label);
  }, []);

  return (
    <div className="p-5 lg:p-6 space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 flex-1 min-w-[20rem]">
          {[
            { label: "Nodes", value: stats ? fmtNumber(stats.node_count) : null },
            { label: "Edges", value: stats ? fmtNumber(stats.edge_count) : null },
            { label: "Communities", value: stats ? String(stats.community_count) : null },
            { label: "Avg degree", value: stats ? stats.avg_degree.toFixed(1) : null },
            { label: "Density", value: stats ? stats.density.toFixed(4) : null },
            { label: "Bridges", value: stats ? String(stats.bridge_count) : null },
          ].map((chip) => (
            <Card key={chip.label} className="px-3 py-2 text-center">
              {chip.value === null ? (
                <Skeleton className="h-6 w-full" />
              ) : (
                <p className="text-base font-bold tabular-nums text-ink">{chip.value}</p>
              )}
              <p className="label mt-0.5">
                {chip.label}
              </p>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: 1, label: "24h" },
              { value: 3, label: "3d" },
              { value: 7, label: "7d" },
              { value: 14, label: "14d" },
              { value: 30, label: "30d" },
            ]}
          />
          <Button
            onClick={() => network.refetch()}
            loading={network.isFetching}
            title="Rebuild the graph"
          >
            {network.isFetching ? null : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "graph", label: "Graph" },
            { value: "influencers", label: "Influencers" },
            { value: "communities", label: "Communities" },
            { value: "bridges", label: "Bridges" },
          ]}
        />
        {tab === "graph" && (
          <>
            <span className="label">Colour by</span>
            <Segmented
              value={colorBy}
              onChange={setColorBy}
              options={[
                { value: "community", label: "Community" },
                { value: "platform", label: "Platform" },
                { value: "sentiment", label: "Sentiment" },
              ]}
            />
            {highlight && (
              <Button onClick={() => setHighlight(null)} variant="subtle">
                Clear focus
              </Button>
            )}
          </>
        )}
        <div className="ml-auto">
          <EpistemicBadge kind="inferred" />
        </div>
      </div>

      {network.isError ? (
        <ErrorState error={network.error} onRetry={() => network.refetch()} />
      ) : network.isLoading || !graph ? (
        <Skeleton className="h-[32rem]" />
      ) : (
        <>
          {tab === "graph" && (
            <Card>
              <CardHeader
                icon={NetworkIcon}
                title="Interaction graph"
                subtitle="Authors who engaged the same topic within a two-hour window; node size combines post count and PageRank"
                actions={
                  graph.is_synthetic ? <Badge tone="warn">synthetic fallback</Badge> : undefined
                }
              />
              <CardBody>
                {graph.is_synthetic && (
                  <div className="flex items-center gap-2 text-xs text-warn bg-warn/8 border border-warn/25 rounded-lg px-3 py-2 mb-3">
                    <Share2 className="w-3.5 h-3.5 flex-shrink-0" />
                    Too few linked authors in this window to build a real graph — showing a
                    synthetic demo topology. Widen the window or run an ingestion cycle.
                  </div>
                )}

                <ForceGraph graph={graph} colorBy={colorBy} highlight={highlight} />

                <div className="flex flex-wrap gap-3 mt-3">
                  {colorBy === "community" &&
                    graph.communities.slice(0, 8).map((c) => (
                      <Legend key={c.id} color={communityColor(c.id)} label={c.name} />
                    ))}
                  {colorBy === "platform" &&
                    Array.from(new Set(graph.nodes.map((n) => n.platform))).map((p) => (
                      <Legend key={p} color={platformColor(p)} label={p} />
                    ))}
                  {colorBy === "sentiment" &&
                    (["positive", "neutral", "negative"] as const).map((s) => (
                      <Legend key={s} color={sentimentFill(s)} label={s} />
                    ))}
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-warn">
                    <span className="w-2.5 h-2.5 rounded-full border border-warn" />
                    bridge actor (dashed ring)
                  </span>
                </div>

                <p className="text-[11px] text-ink-3 mt-3 leading-relaxed">
                  Hover or click a node to isolate its neighbourhood. Edges are co-topic
                  proximity, not observed interaction — two authors posting on the same topic
                  within the window are linked whether or not either saw the other.
                </p>
              </CardBody>
            </Card>
          )}

          {tab === "influencers" && (
            <Card>
              <CardHeader
                icon={Activity}
                title="Most influential authors"
                subtitle="Ranked by PageRank over the co-topic graph — reach through the network, not raw post count"
              />
              <CardBody>
                {!graph.influencers.length ? (
                  <EmptyState icon={Activity} title="No influence ranking available" />
                ) : (
                  <DataTable
                    headers={["#", "Author", "Platform", "PageRank", "Posts", "Community", "Mood"]}
                    rows={graph.influencers.map((inf: NetworkInfluencer) => [
                      <span key="r" className="font-bold text-ink-3">#{inf.rank}</span>,
                      <button
                        key="a"
                        onClick={() => focusOn(inf.label)}
                        className="font-mono font-semibold text-ink hover:text-accent transition-colors"
                        title="Show this author in the graph"
                      >
                        {inf.label}
                      </button>,
                      <PlatformPill key="p" platform={inf.platform} />,
                      <span key="pr" className="tabular-nums text-ink">
                        {inf.pagerank.toFixed(4)}
                      </span>,
                      <span key="c" className="tabular-nums text-ink-2">
                        {fmtNumber(inf.post_count)}
                      </span>,
                      <CommunityPill key="cm" id={inf.community_id} />,
                      <span
                        key="s"
                        className={cn("capitalize font-semibold", sentimentColor(inf.dominant_sentiment))}
                      >
                        {inf.dominant_sentiment}
                      </span>,
                    ])}
                  />
                )}
              </CardBody>
            </Card>
          )}

          {tab === "communities" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {graph.communities.map((community: NetworkCommunity) => {
                const total = Object.values(community.platform_breakdown).reduce(
                  (sum, n) => sum + n,
                  0
                );
                return (
                  <Card key={community.id} className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: communityColor(community.id) }}
                      />
                      <p className="text-sm font-semibold text-ink truncate">{community.name}</p>
                      <span className="ml-auto text-xs font-bold tabular-nums text-ink flex-shrink-0">
                        {community.size} nodes
                      </span>
                    </div>

                    {/* A stacked bar rather than a row of pills: platform *mix* is
                        the interesting property of a community, and a proportion
                        is far easier to compare across cards than a count. */}
                    <div className="flex h-2 rounded-full overflow-hidden gap-px">
                      {Object.entries(community.platform_breakdown).map(([platform, count]) => (
                        <div
                          key={platform}
                          style={{
                            width: `${(count / (total || 1)) * 100}%`,
                            background: platformColor(platform),
                          }}
                          title={`${platform}: ${count}`}
                        />
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(community.platform_breakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([platform, count]) => (
                          <span
                            key={platform}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-transparent bg-surface-2 text-ink-2"
                          >
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                              style={{ background: platformColor(platform) }}
                            />
                            {platform} {count}
                          </span>
                        ))}
                    </div>

                    <p className="text-[11px] text-ink-3">
                      Mean PageRank{" "}
                      <span className="text-ink font-semibold tabular-nums">
                        {community.avg_pagerank.toFixed(4)}
                      </span>{" "}
                      · dominant source{" "}
                      <span className="text-ink-2">{community.dominant_platform}</span>
                    </p>
                  </Card>
                );
              })}
              {!graph.communities.length && (
                <Card className="md:col-span-2">
                  <CardBody className="pt-5">
                    <EmptyState icon={Users} title="No communities detected" />
                  </CardBody>
                </Card>
              )}
            </div>
          )}

          {tab === "bridges" && (
            <Card>
              <CardHeader
                icon={GitFork}
                title="Bridge actors"
                subtitle="High betweenness — they sit on the shortest paths between communities, so a narrative crossing them is about to reach a new audience"
              />
              <CardBody>
                {!graph.bridges.length ? (
                  <EmptyState
                    icon={GitFork}
                    title="No clear bridge actors in this window"
                    hint="Either the communities are well connected already, or the window is too narrow for cross-community paths to form."
                  />
                ) : (
                  <DataTable
                    headers={["Author", "Platform", "Betweenness", "Posts", "Community"]}
                    rows={graph.bridges.map((bridge: NetworkBridge, i) => [
                      <button
                        key={`a-${i}`}
                        onClick={() => focusOn(bridge.label)}
                        className="font-mono font-semibold text-warn hover:underline"
                      >
                        {bridge.label}
                      </button>,
                      <PlatformPill key={`p-${i}`} platform={bridge.platform} />,
                      <span key={`b-${i}`} className="tabular-nums text-ink">
                        {bridge.betweenness.toFixed(4)}
                      </span>,
                      <span key={`c-${i}`} className="tabular-nums text-ink-2">
                        {fmtNumber(bridge.post_count)}
                      </span>,
                      <CommunityPill key={`cm-${i}`} id={bridge.community_id} />,
                    ])}
                  />
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-3 capitalize">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

function PlatformPill({ platform }: { platform: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-[#0B1220]"
      style={{ background: platformColor(platform) }}
    >
      {platform}
    </span>
  );
}

function CommunityPill({ id }: { id: number }) {
  const color = communityColor(id);
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ background: `${color}26`, color }}
    >
      C{id + 1}
    </span>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs min-w-[38rem]">
        <thead>
          <tr className="border-b border-bdr text-ink-3 uppercase tracking-widest">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2.5 text-left font-semibold text-[10px]">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-bdr/60 hover:bg-surface-2/60 transition-colors"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
