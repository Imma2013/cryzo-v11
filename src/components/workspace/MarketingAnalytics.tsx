"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { AccountAnalytics } from "@/lib/server/social-analytics";
import { useAuth } from "@/providers/AuthProvider";
import { SocialNetworkLogo, type SocialNetwork } from "@/components/SocialNetworkLogo";

type AnalyticsItem = AccountAnalytics & { channel: SocialNetwork };

function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function Sparkline({ points }: { points: Array<{ value: number }> }) {
  if (points.length < 2) return <div className="h-16" />;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 220;
  const height = 56;
  const coords = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / Math.max(1, max - min)) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" role="img" aria-label="Metric trend">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="text-white" />
    </svg>
  );
}

export default function MarketingAnalytics({
  unlocked,
  channel,
}: {
  unlocked: boolean;
  channel?: string | null;
}) {
  const { authToken } = useAuth();
  const [days, setDays] = useState(30);
  const [items, setItems] = useState<AnalyticsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const saveTarget = useMutation((api as any).social.setAnalyticsTarget);
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async (refresh = false) => {
    if (!authToken || !unlocked) return;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (channel) params.set("channel", channel);
      if (refresh) params.set("refresh", "1");
      const response = await fetch(`/api/social/analytics?${params}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Unable to load analytics.");
      if (version === requestVersion.current) setItems(Array.isArray(data.items) ? data.items : []);
    } catch (reason) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load analytics.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [authToken, unlocked, days, channel]);

  useEffect(() => {
    void load(false);
    return () => { activeRequest.current?.abort(); ++requestVersion.current; };
  }, [load]);

  const totalMetrics = useMemo(() => {
    const totals = new Map<string, { label: string; value: number }>();
    for (const item of items) {
      for (const metric of item.metrics) {
        if (metric.window !== "period" || metric.aggregation === "latest" || metric.aggregation === "weighted-average" || metric.unit !== "count") continue;
        const key = metric.key.toLowerCase();
        const current = totals.get(key);
        totals.set(key, { label: metric.label, value: (current?.value || 0) + metric.value });
      }
    }
    return [...totals.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 6);
  }, [items]);

  if (!unlocked) {
    return (
      <div className="flex h-full items-center justify-center bg-black p-6">
        <div className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-zinc-900"><BarChart3 size={22} /></div>
          <h2 className="mt-5 text-xl font-semibold text-white">Marketing analytics</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            Track reach, views, engagement, followers, watch time, and post performance across connected networks.
          </p>
          <a href="/chat/billing" className="mt-6 inline-flex rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200">
            Upgrade to Starter
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-black p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Analytics</h2>
            <p className="mt-1 text-xs text-zinc-400">UTC reporting periods. Provider data can be delayed; current and lifetime counters are labelled separately.</p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((value) => (
              <button key={value} onClick={() => setDays(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${days === value ? "bg-white text-black" : "border border-zinc-800 text-zinc-400"}`}>
                {value}D
              </button>
            ))}
            <button onClick={() => void load(true)} disabled={loading} className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white disabled:opacity-40" aria-label="Refresh analytics">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {error && items.length > 0 && <p role="alert" className="mt-4 text-sm text-red-300">{error} Showing the last loaded results.</p>}
        {totalMetrics.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {totalMetrics.map(([key, metric]) => (
              <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="truncate text-xs text-zinc-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{compact(metric.value)}</p>
              </div>
            ))}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-sm text-zinc-500"><Loader2 size={18} className="mr-2 animate-spin" />Loading provider analytics…</div>
        ) : error && !items.length ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
            <BarChart3 className="mx-auto text-zinc-700" size={28} />
            <p className="mt-3 text-sm text-zinc-400">Connect a social account to start collecting analytics.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <section key={item.accountId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-black"><SocialNetworkLogo channel={item.channel} size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-white">{item.accountName}</h3>
                    <p className="text-[11px] uppercase tracking-widest text-zinc-600">{item.channel}</p>
                  </div>
                  <TrendingUp size={16} className="text-zinc-600" />
                </div>

                <p className="mt-3 text-xs text-zinc-400">{item.status.replace(/_/g, " ")} · Last successful data: {item.metrics.length ? new Date(item.updatedAt).toLocaleString() : "Not yet available"}</p>
                {item.targets && <label className="mt-3 grid gap-2 text-xs text-zinc-300">Reporting Page / organization
                  <select value={item.targetId || ""} disabled={loading} onChange={event => {
                    const targetId = event.target.value;
                    void saveTarget({ connectedAccountId: item.accountId, targetId }).then(() => load(true)).catch(reason => setError(reason instanceof Error ? reason.message : "Could not select reporting target."));
                  }} className="rounded-lg border border-zinc-600 bg-black p-2 text-sm text-white">
                    <option value="">Choose a target</option>{item.targets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
                  </select>
                </label>}
                {["permission_required", "error", "rate_limited", "stale"].includes(item.status) && <a href="/chat/apps" className="mt-3 inline-block text-xs text-blue-300 underline">Manage connections</a>}
                {item.note && <p className="mt-4 rounded-xl border border-zinc-800 bg-black/40 p-3 text-xs leading-5 text-zinc-400">{item.note}</p>}

                {item.metrics.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {item.metrics.slice(0, 9).map((metric) => (
                      <div key={metric.key} className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                        <p className="truncate text-[10px] text-zinc-600">{metric.label}</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-100">{compact(metric.value)}{metric.unit === "seconds" ? " s" : metric.unit === "minutes" ? " min" : ""}</p><p className="mt-1 text-[10px] text-zinc-400">{metric.window === "snapshot" ? "Current" : metric.window === "lifetime" ? "Lifetime" : metric.aggregation === "weighted-average" ? "Period average" : "Selected period"}</p>
                      </div>
                    ))}
                  </div>
                )}

                {item.series[0]?.points?.length > 1 && (
                  <div className="mt-4 rounded-xl border border-zinc-800 bg-black/30 p-3 text-zinc-100">
                    <div className="flex items-center justify-between"><p className="text-xs text-zinc-500">{item.series[0].label}</p><p className="text-[10px] text-zinc-700">{days} days</p></div>
                    <Sparkline points={item.series[0].points} />
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
