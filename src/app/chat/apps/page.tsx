"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  Network,
  Rocket,
  Save,
  Search,
  Triangle,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import {
  INITIAL_APP_CONNECTIONS,
  type AppConnection,
} from "@/lib/composio-apps";
import {
  readDeveloperToken,
  readSupabaseProject,
  storeDeveloperToken,
  storeSupabaseProject,
  type DeveloperConnection,
  type SupabaseProjectSelection,
} from "@/lib/developer-connections";

type Toolkit = AppConnection;
type SupabaseProject = {
  id: string;
  name: string;
  region?: string;
  status?: string;
};

type DeveloperId = "github" | "vercel" | "netlify" | "supabase";

function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2.14c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.42-2.69 5.39-5.25 5.67.42.36.78 1.07.78 2.15v3.18c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

const PENDING_TOOLKIT_KEY = "cryzo:pending-composio-toolkit";
const DEVELOPER_APPS = [
  {
    id: "github",
    name: "GitHub",
    description: "Sync generated source code to repositories.",
    placeholder: "github_pat_... or ghp_...",
    tokenUrl: "https://github.com/settings/personal-access-tokens/new",
    tokenLabel: "Get access token",
    icon: GitHubMark,
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deploy projects to your own Vercel account.",
    placeholder: "Vercel access token",
    tokenUrl: "https://vercel.com/account/settings/tokens",
    tokenLabel: "Get access token",
    icon: Triangle,
  },
  {
    id: "netlify",
    name: "Netlify",
    description: "Build and deploy generated apps to your Netlify account.",
    placeholder: "Netlify access token",
    tokenUrl: "https://app.netlify.com/user/applications#personal-access-tokens",
    tokenLabel: "Get access token",
    icon: Rocket,
  },
] as const;

export default function AppsPage() {
  const { userId, isLoading } = useAuth();
  const authToken = useAuthToken();
  const [toolkits, setToolkits] = useState<Toolkit[]>(INITIAL_APP_CONNECTIONS);
  const [checkedConnections, setCheckedConnections] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null);
  const [pendingToolkit, setPendingToolkit] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [developerTokens, setDeveloperTokens] = useState<Record<DeveloperId, string>>({
    github: "",
    vercel: "",
    netlify: "",
    supabase: "",
  });
  const [savedDeveloper, setSavedDeveloper] = useState<string | null>(null);
  const [supabaseProjects, setSupabaseProjects] = useState<SupabaseProject[]>([]);
  const [selectedSupabase, setSelectedSupabase] = useState<SupabaseProjectSelection | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  const filtered = useMemo(() => {
    if (!search.trim()) return toolkits;
    const q = search.toLowerCase();
    return toolkits.filter((toolkit) => toolkit.name.toLowerCase().includes(q));
  }, [toolkits, search]);

  const fetchConnections = useCallback(async (forceRefresh = false) => {
    if (!userId || !authToken) return;

    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (forceRefresh) params.set("refresh", "1");
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/connections${query}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${authToken}` },
      });
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
  }, [authToken, userId]);

  useEffect(() => {
    setDeveloperTokens({
      github: readDeveloperToken("github"),
      vercel: readDeveloperToken("vercel"),
      netlify: readDeveloperToken("netlify"),
      supabase: readDeveloperToken("supabase"),
    });
    setSelectedSupabase(readSupabaseProject());

    const id = window.location.hash.replace(/^#/, "");
    if (id) {
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, []);

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
    if (!userId || !authToken) return;

    setBusyToolkit(slug);
    sessionStorage.setItem(PENDING_TOOLKIT_KEY, slug);
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ toolkit: slug }),
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
    if (!userId || !authToken) return;

    setBusyToolkit(slug);
    await fetch("/api/connections/disconnect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ connectedAccountId }),
    });
    sessionStorage.removeItem(PENDING_TOOLKIT_KEY);
    setPendingToolkit(null);
    await fetchConnections(true);
    setBusyToolkit(null);
  }

  function saveDeveloper(connection: DeveloperConnection) {
    storeDeveloperToken(connection, developerTokens[connection as DeveloperId] || "");
    setSavedDeveloper(connection);
    window.setTimeout(() => setSavedDeveloper(null), 1800);
  }

  async function verifySupabase() {
    const token = developerTokens.supabase.trim();
    if (!token) return;
    setSupabaseStatus({ type: "loading", message: "Loading Supabase projects..." });
    try {
      const response = await fetch("/api/developer/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Supabase connection failed");
      storeDeveloperToken("supabase", token);
      const projects = Array.isArray(data.projects) ? data.projects : [];
      setSupabaseProjects(projects);
      setSupabaseStatus({
        type: "success",
        message: `Connected · ${projects.length} project${projects.length === 1 ? "" : "s"}`,
      });
    } catch (error) {
      setSupabaseStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Supabase connection failed",
      });
    }
  }

  async function selectSupabaseProject(projectRef: string) {
    const token = developerTokens.supabase.trim() || readDeveloperToken("supabase");
    if (!token || !projectRef) return;
    setSupabaseStatus({ type: "loading", message: "Connecting project..." });
    try {
      const response = await fetch("/api/developer/supabase/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, projectRef }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to select project");
      const project = data.project as SupabaseProjectSelection;
      storeDeveloperToken("supabase", token);
      storeSupabaseProject(project);
      setSelectedSupabase(project);
      setSupabaseStatus({ type: "success", message: `Using ${project.name}` });
    } catch (error) {
      setSupabaseStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to select project",
      });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-black px-4 py-5 sm:p-6">
      <div className="mx-auto w-full max-w-5xl pb-12">
        <h1 className="text-2xl font-bold text-white">Apps</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Connect developer infrastructure and apps your Cryzo agent can use.
        </p>

        <section className="mt-7">
          <a href="/chat/apps/mcp" className="group flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-600">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-black text-zinc-200">
              <Network size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-white">Connectors (MCP)</h2>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">New</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Connect any remote MCP server with a custom URL.</p>
            </div>
            <span className="text-sm text-zinc-500 transition group-hover:text-white">Open</span>
          </a>
        </section>

        <section className="mt-7">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-white">Developer Apps</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Access-token services for source control, hosting, and your app backend.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {DEVELOPER_APPS.map((app) => {
              const Icon = app.icon;
              const value = developerTokens[app.id];
              const connected = Boolean(readDeveloperToken(app.id));
              const justSaved = savedDeveloper === app.id;
              return (
                <div
                  id={app.id}
                  key={app.id}
                  className="scroll-mt-24 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-200">
                      <Icon size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">{app.name}</p>
                        {connected && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-green-400">
                            <CheckCircle2 size={12} /> Connected
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                        {app.description}
                      </p>
                      <a
                        href={app.tokenUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-white"
                      >
                        {app.tokenLabel} <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      value={value}
                      onChange={(event) => {
                        setDeveloperTokens((current) => ({
                          ...current,
                          [app.id]: event.target.value,
                        }));
                        if (savedDeveloper === app.id) setSavedDeveloper(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && value.trim()) {
                          event.preventDefault();
                          saveDeveloper(app.id);
                        }
                      }}
                      placeholder={
                        connected && !value ? "Saved on this device" : app.placeholder
                      }
                      autoComplete="off"
                      className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => saveDeveloper(app.id)}
                      disabled={!value.trim()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-40"
                    >
                      {justSaved || connected ? <CheckCircle2 size={14} /> : <Save size={14} />}
                      {justSaved ? "Saved" : "Save"}
                    </button>
                  </div>
                  {justSaved && (
                    <p className="mt-2 text-xs text-green-400">
                      Saved on this device. Cryzo will use this token for {app.name} actions.
                    </p>
                  )}
                </div>
              );
            })}

            <div
              id="supabase"
              className="scroll-mt-24 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-200">
                  <Database size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-white">Supabase</p>
                    {selectedSupabase && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-green-400">
                        <CheckCircle2 size={12} /> Connected
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                    Select a Supabase project for auth, data, migrations and production environment variables.
                  </p>
                  <a
                    href="https://supabase.com/dashboard/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-white"
                  >
                    Get access token <ExternalLink size={11} />
                  </a>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  value={developerTokens.supabase}
                  onChange={(event) => {
                    setDeveloperTokens((current) => ({
                      ...current,
                      supabase: event.target.value,
                    }));
                    if (supabaseStatus.type !== "idle") {
                      setSupabaseStatus({ type: "idle" });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && developerTokens.supabase.trim()) {
                      event.preventDefault();
                      void verifySupabase();
                    }
                  }}
                  placeholder="sbp_..."
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => void verifySupabase()}
                  disabled={
                    !developerTokens.supabase.trim() ||
                    supabaseStatus.type === "loading"
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-40"
                >
                  {supabaseStatus.type === "loading" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : supabaseStatus.type === "success" ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <Database size={14} />
                  )}
                  {supabaseStatus.type === "success" ? "Connected" : "Projects"}
                </button>
              </div>

              {(supabaseProjects.length > 0 || selectedSupabase) && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Project
                  </label>
                  <select
                    value={selectedSupabase?.ref || ""}
                    onChange={(event) => void selectSupabaseProject(event.target.value)}
                    className="h-10 w-full rounded-lg border border-zinc-800 bg-black px-3 text-base text-white outline-none sm:text-sm"
                  >
                    <option value="">Select a project</option>
                    {selectedSupabase &&
                      !supabaseProjects.some(
                        (project) => project.id === selectedSupabase.ref,
                      ) && (
                        <option value={selectedSupabase.ref}>
                          {selectedSupabase.name}
                        </option>
                      )}
                    {supabaseProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                        {project.region ? ` · ${project.region}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedSupabase && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Selected: {selectedSupabase.name} · public app key only goes into generated apps.
                    </p>
                  )}
                </div>
              )}

              {supabaseStatus.message && (
                <p
                  className={`mt-2 text-xs ${
                    supabaseStatus.type === "error"
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {supabaseStatus.message}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="my-8 border-t border-zinc-900" />

        <section>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-white">Apps</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Composio-powered services Cryzo can act on when you ask.
            </p>
          </div>

          {toolkits.length > 0 && (
            <div className="relative mt-4">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search apps..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-4 text-base text-white placeholder-zinc-500 focus:border-zinc-600 focus:outline-none sm:text-sm"
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="py-20 text-center text-sm text-zinc-500">
              {search ? "No apps match your search." : "No apps available."}
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((toolkit) => {
                const isBusy = busyToolkit === toolkit.slug;
                const isChecking =
                  !checkedConnections || (isBusy && !toolkit.isConnected);

                return (
                  <div
                    key={toolkit.slug}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {toolkit.logo ? (
                        <img
                          src={toolkit.logo}
                          alt={toolkit.name}
                          className="h-8 w-8 rounded"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-800 text-xs font-medium text-zinc-400">
                          {toolkit.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {toolkit.name}
                        </p>
                        <p
                          className={`text-xs ${
                            toolkit.isConnected
                              ? "text-green-400"
                              : "text-zinc-500"
                          }`}
                        >
                          {toolkit.isConnected
                            ? "Connected"
                            : isChecking
                              ? "Checking..."
                              : "Not connected"}
                        </p>
                      </div>
                    </div>
                    {toolkit.requiresAuth === false ? (
                      <span className="ml-2 rounded border border-emerald-800/60 px-3 py-1.5 text-xs text-emerald-400">
                        Ready
                      </span>
                    ) : toolkit.isConnected ? (
                      <button
                        onClick={() =>
                          disconnect(toolkit.connectedAccountId!, toolkit.slug)
                        }
                        disabled={isBusy || !userId}
                        className="ml-2 rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-red-800 hover:text-red-400 disabled:opacity-60"
                      >
                        {isBusy ? "Disconnecting" : "Disconnect"}
                      </button>
                    ) : (
                      <button
                        onClick={() => connect(toolkit.slug)}
                        disabled={isBusy || !userId}
                        className="ml-2 rounded bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-60"
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
        </section>

        {!authToken && <div className="sr-only">Loading session</div>}
      </div>
    </div>
  );
}
