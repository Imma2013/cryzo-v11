"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  CheckCircle2,
  Database,
  Loader2,
  Save,
  Server,
  Smartphone,
  X,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import {
  readDeveloperToken,
  readSupabaseProject,
  storeDeveloperToken,
  storeSupabaseProject,
  type DeveloperConnection,
  type SupabaseProjectSelection,
} from "@/lib/developer-connections";

type Toolkit = {
  slug: string;
  name: string;
  logo?: string;
  logoUrl?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

type SupabaseProject = {
  id: string;
  name: string;
  region?: string;
  status?: string;
};

type DeveloperDrafts = Record<"github" | "vercel" | "supabase" | "expo", string>;

function developerDrafts(): DeveloperDrafts {
  return {
    github: readDeveloperToken("github"),
    vercel: readDeveloperToken("vercel"),
    supabase: readDeveloperToken("supabase"),
    expo: readDeveloperToken("expo"),
  };
}

export function ConnectionsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { userId } = useAuth();
  const authToken = useAuthToken();
  const pathname = usePathname();
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedLogoSlugs, setFailedLogoSlugs] = useState<Set<string>>(
    () => new Set(),
  );
  const [developerTokens, setDeveloperTokens] = useState<DeveloperDrafts>(() =>
    developerDrafts(),
  );
  const [savedConnection, setSavedConnection] = useState<string | null>(null);
  const [supabaseProjects, setSupabaseProjects] = useState<SupabaseProject[]>([]);
  const [selectedSupabase, setSelectedSupabase] = useState<SupabaseProjectSelection | null>(
    () => readSupabaseProject(),
  );
  const [supabaseStatus, setSupabaseStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  const fetchToolkits = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/connections?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setToolkits(Array.isArray(data.toolkits) ? data.toolkits : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setDeveloperTokens(developerDrafts());
    setSelectedSupabase(readSupabaseProject());
    void fetchToolkits();
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const connect = async (slug: string) => {
    if (!userId) return;
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit: slug, userId }),
    });
    const data = await res.json();
    if (data.redirectUrl) window.location.href = data.redirectUrl;
  };

  const disconnect = async (connectedAccountId: string) => {
    if (!userId) return;
    await fetch("/api/connections/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectedAccountId, userId }),
    });
    await fetchToolkits();
  };

  const markLogoFailed = (slug: string) => {
    setFailedLogoSlugs((current) => new Set(current).add(slug));
  };

  const saveDeveloperConnection = (connection: DeveloperConnection) => {
    const value = developerTokens[connection as keyof DeveloperDrafts] ?? "";
    storeDeveloperToken(connection, value);
    setSavedConnection(connection);
    window.setTimeout(() => setSavedConnection(null), 1600);
  };

  const verifySupabase = async () => {
    const token = developerTokens.supabase.trim();
    if (!token) return;
    setSupabaseStatus({ type: "loading", message: "Loading Supabase projects..." });
    const response = await fetch("/api/developer/supabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSupabaseStatus({
        type: "error",
        message: data.error || "Supabase connection failed",
      });
      return;
    }

    storeDeveloperToken("supabase", token);
    const projects = Array.isArray(data.projects) ? data.projects : [];
    setSupabaseProjects(projects);
    setSupabaseStatus({
      type: "success",
      message: `Connected · ${projects.length} project${projects.length === 1 ? "" : "s"}`,
    });
  };

  const selectSupabaseProject = async (projectRef: string) => {
    const token = developerTokens.supabase.trim() || readDeveloperToken("supabase");
    if (!token || !projectRef) return;
    setSupabaseStatus({ type: "loading", message: "Connecting project..." });

    const response = await fetch("/api/developer/supabase/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, projectRef }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSupabaseStatus({ type: "error", message: data.error || "Unable to select project" });
      return;
    }

    const project = data.project as SupabaseProjectSelection;
    storeDeveloperToken("supabase", token);
    storeSupabaseProject(project);
    setSelectedSupabase(project);

    const conversationId = pathname.match(/^\/chat\/([^/]+)$/)?.[1];
    if (conversationId && authToken) {
      const runtimeResponse = await fetch("/api/developer/supabase/runtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ conversationId, project }),
      });
      if (!runtimeResponse.ok) {
        const runtimeData = await runtimeResponse.json();
        setSupabaseStatus({
          type: "error",
          message: runtimeData.error || "Project selected, but preview configuration failed",
        });
        return;
      }
    }

    setSupabaseStatus({ type: "success", message: `Using ${project.name}` });
  };

  const developerCards = useMemo(
    () => [
      {
        id: "github" as const,
        name: "GitHub",
        description: "Sync generated source code to repositories.",
        placeholder: "github_pat_... or ghp_...",
        icon: Server,
      },
      {
        id: "vercel" as const,
        name: "Vercel",
        description: "Deploy to your own Vercel account with your access token.",
        placeholder: "Vercel access token",
        icon: Server,
      },
      {
        id: "expo" as const,
        name: "Expo / EAS",
        description: "Build iOS and Android store files from Cryzo's mobile wrapper.",
        placeholder: "Expo access token",
        icon: Smartphone,
      },
    ],
    [],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Connections</h2>
            <p className="mt-1 text-sm text-zinc-400">
              App integrations power agent actions. Developer connections power code, hosting, backends, and store builds.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
            aria-label="Close connections"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <section>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">Developer Connections</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Access-token based developer services. These stay separate from normal agent app integrations.
              </p>
            </div>

            <div className="space-y-3">
              {developerCards.map((connection) => {
                const Icon = connection.icon;
                const isSaved = savedConnection === connection.id;
                return (
                  <div key={connection.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-200">
                        <Icon size={19} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white">{connection.name}</div>
                        <div className="mt-0.5 text-xs leading-5 text-zinc-500">{connection.description}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="password"
                        value={developerTokens[connection.id]}
                        onChange={(event) =>
                          setDeveloperTokens((current) => ({
                            ...current,
                            [connection.id]: event.target.value,
                          }))
                        }
                        placeholder={connection.placeholder}
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => saveDeveloperConnection(connection.id)}
                        disabled={!developerTokens[connection.id].trim()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-40"
                      >
                        {isSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-200">
                    <Database size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">Supabase</div>
                    <div className="mt-0.5 text-xs leading-5 text-zinc-500">
                      Select a real Supabase project for auth, data, migrations, and production environment variables.
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    type="password"
                    value={developerTokens.supabase}
                    onChange={(event) =>
                      setDeveloperTokens((current) => ({ ...current, supabase: event.target.value }))
                    }
                    placeholder="sbp_..."
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void verifySupabase()}
                    disabled={!developerTokens.supabase.trim() || supabaseStatus.type === "loading"}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-40"
                  >
                    {supabaseStatus.type === "loading" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Database size={14} />
                    )}
                    Load projects
                  </button>
                </div>

                {(supabaseProjects.length > 0 || selectedSupabase) && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-xs font-medium text-zinc-400">Project</label>
                    <select
                      value={selectedSupabase?.ref || ""}
                      onChange={(event) => void selectSupabaseProject(event.target.value)}
                      className="h-10 w-full rounded-lg border border-zinc-800 bg-black px-3 text-base text-white outline-none sm:text-sm"
                    >
                      <option value="">Select a project</option>
                      {selectedSupabase && !supabaseProjects.some((project) => project.id === selectedSupabase.ref) && (
                        <option value={selectedSupabase.ref}>{selectedSupabase.name}</option>
                      )}
                      {supabaseProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}{project.region ? ` · ${project.region}` : ""}
                        </option>
                      ))}
                    </select>
                    {selectedSupabase && (
                      <p className="mt-2 text-xs text-zinc-500">
                        Runtime env: {selectedSupabase.url} · public key only
                      </p>
                    )}
                  </div>
                )}

                {supabaseStatus.message && (
                  <p className={`mt-2 text-xs ${supabaseStatus.type === "error" ? "text-red-400" : "text-green-400"}`}>
                    {supabaseStatus.message}
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="my-6 border-t border-zinc-800" />

          <section>
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-white">App Connections</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Connect services Cryzo can act on for you through Composio.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-zinc-500" size={24} />
              </div>
            ) : (
              <div className="grid gap-1">
                {toolkits.map((t) => {
                  const logo = t.logoUrl || t.logo;
                  const showLogo = logo && !failedLogoSlugs.has(t.slug);
                  return (
                    <div key={t.slug} className="flex items-center gap-4 border-b border-zinc-900 py-3 last:border-b-0">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded bg-zinc-900">
                        {showLogo ? (
                          <img
                            src={logo}
                            alt={t.name}
                            className="h-6 w-6 object-contain"
                            onError={() => markLogoFailed(t.slug)}
                          />
                        ) : (
                          <span className="text-xs text-zinc-500">{t.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{t.name}</p>
                        <p className={`text-xs ${t.isConnected ? "text-green-400" : "text-zinc-500"}`}>
                          {t.isConnected ? "Connected" : "Not connected"}
                        </p>
                      </div>
                      {t.isConnected ? (
                        <button
                          type="button"
                          onClick={() => void disconnect(t.connectedAccountId!)}
                          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-red-800 hover:text-red-400"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void connect(t.slug)}
                          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-zinc-200"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
