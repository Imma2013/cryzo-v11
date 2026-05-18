"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import {
  INITIAL_APP_CONNECTIONS,
  type AppConnection,
} from "@/lib/composio-apps";

type Toolkit = AppConnection;

const PENDING_TOOLKIT_KEY = "cryzo:pending-composio-toolkit";

export default function AppsPage() {
  const { userId, isLoading } = useAuth();
  const [toolkits, setToolkits] = useState<Toolkit[]>(INITIAL_APP_CONNECTIONS);
  const [checkedConnections, setCheckedConnections] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null);
  const [pendingToolkit, setPendingToolkit] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return toolkits;
    const q = search.toLowerCase();
    return toolkits.filter((t) => t.name.toLowerCase().includes(q));
  }, [toolkits, search]);

  const fetchConnections = useCallback(async (forceRefresh = false) => {
    if (!userId) return;

    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("userId", userId);
      if (forceRefresh) params.set("refresh", "1");
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/connections${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Connections request failed: ${res.status}`);
      const data = await res.json();
      const nextToolkits = data.toolkits ?? [];
      setToolkits(nextToolkits.length > 0 ? nextToolkits : INITIAL_APP_CONNECTIONS);
    } catch (error) {
      console.warn("Failed to refresh app connections", error);
      setToolkits((current) =>
        current.length > 0 ? current : INITIAL_APP_CONNECTIONS,
      );
    } finally {
      setCheckedConnections(true);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (
      pendingToolkit &&
      toolkits.some((toolkit) => toolkit.slug === pendingToolkit && toolkit.isConnected)
    ) {
      sessionStorage.removeItem(PENDING_TOOLKIT_KEY);
      setPendingToolkit(null);
      setBusyToolkit(null);
    }
  }, [pendingToolkit, toolkits]);

  useEffect(() => {
    if (isLoading || !userId) return;

    const storedPending = sessionStorage.getItem(PENDING_TOOLKIT_KEY);
    if (storedPending) {
      setPendingToolkit(storedPending);
      setBusyToolkit(storedPending);
    }

    void fetchConnections(Boolean(storedPending));
  }, [fetchConnections, isLoading, userId]);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (userId && document.visibilityState === "visible") {
        void fetchConnections(true);
      }
    };

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [fetchConnections, userId]);

  useEffect(() => {
    if (!pendingToolkit) return;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      void fetchConnections(true);

      if (attempts >= 6) {
        window.clearInterval(interval);
        sessionStorage.removeItem(PENDING_TOOLKIT_KEY);
        setPendingToolkit(null);
        setBusyToolkit(null);
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [fetchConnections, pendingToolkit]);

  async function connect(slug: string) {
    if (!userId) return;

    setBusyToolkit(slug);
    sessionStorage.setItem(PENDING_TOOLKIT_KEY, slug);
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit: slug, userId }),
    });
    if (!res.ok) {
      sessionStorage.removeItem(PENDING_TOOLKIT_KEY);
      setBusyToolkit(null);
      return;
    }

    const { redirectUrl } = await res.json();
    window.location.href = redirectUrl;
  }

  async function disconnect(connectedAccountId: string, slug: string) {
    if (!userId) return;

    setBusyToolkit(slug);
    await fetch("/api/connections/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectedAccountId, userId }),
    });
    sessionStorage.removeItem(PENDING_TOOLKIT_KEY);
    setPendingToolkit(null);
    await fetchConnections(true);
    setBusyToolkit(null);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-black p-6">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-2xl font-bold text-white">App Connections</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Connect your apps to give your agent access.
        </p>

        {toolkits.length > 0 && (
          <div className="relative mt-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-4 text-sm text-white placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="py-20 text-center text-sm text-zinc-500">
            {search ? "No apps match your search." : "No apps available."}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => {
              const isBusy = busyToolkit === t.slug;
              const isChecking = !checkedConnections || (isBusy && !t.isConnected);

              return (
              <div
                key={t.slug}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex items-center gap-3">
                  {t.logo ? (
                    <img
                      src={t.logo}
                      alt={t.name}
                      className="h-8 w-8 rounded"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-xs font-medium text-zinc-400">
                      {t.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p
                      className={`text-xs ${
                        t.isConnected ? "text-green-400" : "text-zinc-500"
                      }`}
                    >
                      {t.isConnected
                        ? "Connected"
                        : isChecking
                          ? "Checking..."
                          : "Not connected"}
                    </p>
                  </div>
                </div>
                {t.isConnected ? (
                  <button
                    onClick={() => disconnect(t.connectedAccountId!, t.slug)}
                    disabled={isBusy || !userId}
                    className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-red-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? "Disconnecting" : "Disconnect"}
                  </button>
                ) : (
                  <button
                    onClick={() => connect(t.slug)}
                    disabled={isBusy || !userId}
                    className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? "Checking" : "Connect"}
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
        {refreshing && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-600">
            <Loader2 size={12} className="animate-spin" />
            <span>Refreshing connection status...</span>
          </div>
        )}
      </div>
    </div>
  );
}
