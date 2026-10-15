"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import type { FunctionReference } from "convex/server";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";

type McpServer = {
  _id: Id<"mcpServers">;
  _creationTime: number;
  userId: Id<"users">;
  name: string;
  url: string;
  transport: "http" | "sse";
  authType: "none" | "api_key" | "oauth";
  defaultEnabledForNewProjects?: boolean;
  toolCount?: number;
  tools?: Array<{ name: string }>;
  lastConnectedAt?: number;
  lastError?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

type SecretMeta = {
  providerId: string;
  baseUrl?: string;
  updatedAt: number;
};

const mcpApi = (
  api as unknown as {
    mcpServers: {
      list: FunctionReference<
        "query",
        "public",
        Record<string, never>,
        McpServer[]
      >;
      add: FunctionReference<
        "mutation",
        "public",
        {
          serverId?: Id<"mcpServers">;
          transport?: "http" | "sse";
          name: string;
          url: string;
          authType?: "none" | "api_key" | "oauth";
          defaultEnabledForNewProjects?: boolean;
        },
        Id<"mcpServers">
      >;
      remove: FunctionReference<
        "mutation",
        "public",
        { serverId: Id<"mcpServers"> },
        null
      >;
      setEnabled: FunctionReference<
        "mutation",
        "public",
        { serverId: Id<"mcpServers">; enabled: boolean },
        boolean
      >;
      setDefaultEnabled: FunctionReference<
        "mutation",
        "public",
        { serverId: Id<"mcpServers">; enabled: boolean },
        boolean
      >;
    };
  }
).mcpServers;

export default function McpConnectorsPage() {
  const authToken = useAuthToken();
  const servers = useQuery(mcpApi.list);
  const secretRows = useQuery((api as any).providerSecrets.list) as
    | SecretMeta[]
    | undefined;
  const addServer = useMutation(mcpApi.add);
  const removeServer = useMutation(mcpApi.remove);
  const setEnabled = useMutation(mcpApi.setEnabled);
  const setDefaultEnabled = useMutation(mcpApi.setDefaultEnabled);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<"none" | "api_key" | "oauth">(
    "none",
  );
  const editingRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<Id<"mcpServers"> | null>(null);
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerPrefix, setHeaderPrefix] = useState("Bearer");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [defaultEnabled, setDefaultEnabledLocal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [notice, setNotice] = useState("");
  const [toolCounts, setToolCounts] = useState<Record<string, number>>({});
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const secured = useMemo(
    () =>
      new Set(
        (secretRows || [])
          .filter((row) => row.providerId.startsWith("mcp:"))
          .map((row) => row.providerId.slice(4)),
      ),
    [secretRows],
  );

  async function saveSecret(serverId: string, secret: string) {
    if (!authToken) throw new Error("Your Cryzo session is still loading.");
    const response = await fetch("/api/mcp/secret", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        serverId,
        secret,
        headerName,
        headerPrefix,
        ...(oauthClientId.trim()
          ? { oauthClientId: oauthClientId.trim(), oauthClientSecret }
          : {}),
      }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to save MCP API key.");
  }

  async function testServer(serverId: string) {
    if (!authToken) throw new Error("Your Cryzo session is still loading.");
    setTestingId(serverId);
    setError("");
    setErrorDetail("");
    setNotice("");
    try {
      const response = await fetch("/api/mcp/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ serverId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorDetail(data.detail || "");
        throw new Error(data.error || "MCP connection failed.");
      }
      setToolCounts((current) => ({
        ...current,
        [serverId]: Number(data.toolCount || 0),
      }));
      setNotice(
        `Connected. ${data.toolCount || 0} MCP tool${Number(data.toolCount) === 1 ? "" : "s"} discovered.`,
      );
    } finally {
      setTestingId(null);
    }
  }

  async function startOAuth(serverId: string) {
    if (!authToken) throw new Error("Your Cryzo session is still loading.");
    const response = await fetch("/api/mcp/oauth/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ serverId }),
    });
    const data = await response.json();
    if (!response.ok || !data.authorizationUrl)
      throw new Error(data.error || "Unable to start MCP OAuth.");
    window.location.assign(data.authorizationUrl);
  }

  useEffect(() => {
    if (!authToken) return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (!oauth) return;
    const serverId = params.get("serverId");
    const message = params.get("message");
    params.delete("oauth");
    params.delete("message");
    params.delete("serverId");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
    if (oauth === "connected" && serverId) {
      setNotice("MCP OAuth connected. Verifying tools…");
      void testServer(serverId).catch((failure) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "MCP OAuth verification failed.",
        ),
      );
    } else {
      setError(message || "MCP OAuth was not completed.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  function editServer(server: McpServer) {
    editingRef.current = server._id;
    void fetch(`/api/mcp/secret?serverId=${server._id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const config = await response.json();
        if (editingRef.current === server._id) {
          setHeaderName(config.headerName);
          setHeaderPrefix(config.headerPrefix);
          setOauthClientId(config.oauthClientId);
        }
      })
      .catch(() => {});
    setEditingId(server._id);
    setName(server.name);
    setUrl(server.url);
    setTransport(server.transport);
    setAuthType(server.authType);
    setDefaultEnabledLocal(server.defaultEnabledForNewProjects ?? true);
    setApiKey("");
    setOauthClientId("");
    setOauthClientSecret("");
    setError("");
    setNotice("");
    document
      .getElementById("mcp-editor")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setErrorDetail("");
    setNotice("");
    setSaving(true);
    try {
      const parsedUrl = new URL(url.trim());
      parsedUrl.hash = "";
      const normalizedUrl = parsedUrl.toString();
      const duplicate = servers?.find((server) => server.url === normalizedUrl);
      if (!editingId && duplicate) {
        editServer(duplicate);
        setNotice(
          "This server is already configured. Update its authentication below, then save.",
        );
        return;
      }
      const previous = servers?.find((server) => server._id === editingId);
      const needsKey =
        !previous ||
        previous.url !== normalizedUrl ||
        previous.authType !== authType ||
        previous.transport !== transport ||
        !secured.has(String(editingId));
      if (authType === "api_key" && needsKey && !apiKey.trim())
        throw new Error("Enter the API key for this MCP server.");
      const serverId = await addServer({
        ...(editingId ? { serverId: editingId } : {}),
        name,
        url,
        transport,
        authType,
        defaultEnabledForNewProjects: defaultEnabled,
      });
      const id = String(serverId);
      if (authType === "api_key") {
        await saveSecret(id, apiKey.trim());
        await testServer(id);
      } else if (authType === "oauth") {
        if (oauthClientId.trim()) await saveSecret(id, "");
        await startOAuth(id);
        return;
      } else {
        await testServer(id);
      }
      setEditingId(null);
      setName("");
      setUrl("");
      setApiKey("");
      setAuthType("none");
      setDefaultEnabledLocal(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add MCP server.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-black px-4 py-6 text-white sm:px-6">
      <div className="mx-auto w-full max-w-5xl pb-16">
        <Link
          href="/chat/apps"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={15} /> Back to Apps
        </Link>

        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Apps
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Connectors (MCP)</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Connect remote Model Context Protocol servers and let Cryzo use
            their tools while you build. Credentials are encrypted on the Cryzo
            server and never written into generated projects.
          </p>
        </header>

        <section
          id="mcp-editor"
          className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-black">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="font-semibold">
                {editingId ? "Edit MCP server" : "New MCP server"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Connect with Streamable HTTP or legacy SSE, then verify the
                available tools.
              </p>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="mt-5 grid min-w-0 gap-4 [&_input]:min-w-0 [&_select]:min-w-0 [&_label]:min-w-0"
          >
            <label className="grid gap-2 text-sm text-zinc-300">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Stripe MCP"
                maxLength={80}
                required
                className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
              />
            </label>
            <label className="grid gap-2 text-sm text-zinc-300">
              URL
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://mcp.example.com/v1"
                type="url"
                required
                className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-zinc-300">
                Transport type
                <select
                  className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none"
                  value={transport}
                  onChange={(event) =>
                    setTransport(event.target.value as "http" | "sse")
                  }
                >
                  <option value="http">HTTP</option>
                  <option value="sse">SSE (legacy)</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-zinc-300">
                Authentication
                <select
                  value={authType}
                  onChange={(event) =>
                    setAuthType(
                      event.target.value as "none" | "api_key" | "oauth",
                    )
                  }
                  className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="none">None</option>
                  <option value="api_key">API Key</option>
                  <option value="oauth">MCP OAuth</option>
                </select>
              </label>
            </div>
            {authType === "api_key" && (
              <label className="grid gap-2 text-sm text-zinc-300">
                API key / bearer token
                <div className="relative">
                  <KeyRound
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    type="password"
                    autoComplete="off"
                    placeholder={
                      editingId
                        ? "Leave blank to keep the saved credential"
                        : "Paste the server credential"
                    }
                    required={!editingId}
                    className="w-full rounded-xl border border-zinc-800 bg-black py-3 pl-10 pr-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                  />
                </div>
                <span className="grid gap-2 sm:grid-cols-2">
                  <span>
                    Header name
                    <input
                      aria-label="Authentication header name"
                      value={headerName}
                      onChange={(event) => {
                        setHeaderName(event.target.value);
                        setHeaderPrefix(
                          event.target.value.toLowerCase() === "authorization"
                            ? "Bearer"
                            : "",
                        );
                      }}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2"
                    />
                  </span>
                  <span>
                    Prefix (optional)
                    <input
                      aria-label="Authentication header prefix"
                      value={headerPrefix}
                      onChange={(event) => setHeaderPrefix(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2"
                    />
                  </span>
                </span>
                <span className="text-xs text-zinc-400">
                  Credentials are encrypted. Use Authorization + Bearer, or a
                  named header such as x-api-key with no prefix.
                </span>
              </label>
            )}
            {authType === "oauth" && (
              <div className="grid gap-3 rounded-xl border border-zinc-700 bg-black p-4">
                <p className="text-xs text-zinc-400">
                  Cryzo discovers OAuth automatically. If your provider requires
                  a registered app, enter its client ID and use this callback:{" "}
                  {origin}/api/mcp/oauth/callback
                </p>
                <label className="grid gap-1 text-sm">
                  Registered client ID (optional)
                  <input
                    value={oauthClientId}
                    onChange={(event) => setOauthClientId(event.target.value)}
                    className="rounded-lg border border-zinc-700 bg-black p-2"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Client secret (optional)
                  <input
                    type="password"
                    autoComplete="off"
                    value={oauthClientSecret}
                    onChange={(event) =>
                      setOauthClientSecret(event.target.value)
                    }
                    className="rounded-lg border border-zinc-700 bg-black p-2"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              onClick={() => setDefaultEnabledLocal((value) => !value)}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-4 py-3 text-left"
            >
              <span>
                <span className="block text-sm text-zinc-200">
                  Automatically enable for new projects
                </span>
                <span className="mt-1 block text-xs text-zinc-600">
                  Each project gets its own connector switch after creation.
                </span>
              </span>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full ${defaultEnabled ? "bg-blue-600" : "bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${defaultEnabled ? "left-6" : "left-1"}`}
                />
              </span>
            </button>
            {error && (
              <p role="alert" className="break-words text-sm text-red-300">
                {error}
              </p>
            )}
            {errorDetail && (
              <details className="break-all text-xs text-zinc-400">
                <summary>Technical details</summary>
                <p className="mt-2">{errorDetail}</p>
              </details>
            )}
            {notice && <p className="text-sm text-emerald-400">{notice}</p>}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )}
              {editingId ? "Save and connect" : "Add MCP server"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  editingRef.current = null;
                  setEditingId(null);
                  setName("");
                  setUrl("");
                  setApiKey("");
                  setOauthClientId("");
                  setOauthClientSecret("");
                  setAuthType("none");
                }}
                className="w-fit text-sm text-zinc-400"
              >
                Cancel editing
              </button>
            )}
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Your MCP servers</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {servers?.length ?? 0} configured
              </p>
            </div>
          </div>
          {!servers ? (
            <Loader2 className="mt-6 animate-spin text-zinc-500" size={20} />
          ) : servers.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 px-5 py-12 text-center">
              <Server className="mx-auto text-zinc-600" size={24} />
              <p className="mt-3 text-sm text-zinc-400">
                No MCP servers configured yet.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {servers.map((server) => {
                const hasSecret = secured.has(String(server._id));
                const connectionStatus =
                  testingId === String(server._id)
                    ? "Connecting"
                    : server.lastError
                      ? "Connection failed"
                      : server.lastConnectedAt
                        ? "Connected"
                        : server.authType !== "none"
                          ? "Authorization required"
                          : "Configured";
                return (
                  <article
                    key={server._id}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-black">
                        <Server size={18} />
                      </div>
                      <div className="min-w-0 basis-[calc(100%-4rem)] sm:basis-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">
                            {server.name}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] ${server.lastError ? "text-red-300" : server.lastConnectedAt ? "text-emerald-400" : "text-amber-300"}`}
                          >
                            <CheckCircle2 size={11} /> {connectionStatus}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {server.enabled ? "Enabled for tools" : "Disabled"}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {server.authType === "oauth"
                              ? "OAuth"
                              : server.authType === "api_key"
                                ? hasSecret
                                  ? "API key saved"
                                  : "API key needed"
                                : "No auth"}
                          </span>
                          {(toolCounts[String(server._id)] ??
                            server.toolCount ??
                            server.tools?.length) !== undefined && (
                            <span className="text-[11px] text-zinc-500">
                              {toolCounts[String(server._id)] ??
                                server.toolCount ??
                                server.tools?.length}{" "}
                              tools
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {server.url}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => editServer(server)}
                        className="rounded-lg px-2 py-1 text-xs text-blue-300"
                      >
                        Edit
                      </button>
                      {server.authType === "none" &&
                        /authorization is required/i.test(
                          server.lastError || "",
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              void addServer({
                                serverId: server._id,
                                name: server.name,
                                url: server.url,
                                transport: server.transport,
                                authType: "oauth",
                              })
                                .then((id) => startOAuth(String(id)))
                                .catch((reason) =>
                                  setError(
                                    reason instanceof Error
                                      ? reason.message
                                      : "Connection failed",
                                  ),
                                )
                            }
                            className="rounded-lg px-2 py-1 text-xs text-blue-300"
                          >
                            Connect
                          </button>
                        )}
                      {server.authType === "oauth" && (
                        <button
                          type="button"
                          onClick={() =>
                            void startOAuth(String(server._id)).catch(
                              (reason) =>
                                setError(
                                  reason instanceof Error
                                    ? reason.message
                                    : "Reconnect failed.",
                                ),
                            )
                          }
                          className="rounded-lg px-2 py-1 text-xs text-blue-300"
                        >
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void setEnabled({
                            serverId: server._id,
                            enabled: !server.enabled,
                          })
                        }
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${server.enabled ? "bg-blue-600" : "bg-zinc-700"}`}
                        aria-label={`${server.enabled ? "Disable" : "Enable"} ${server.name}`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${server.enabled ? "left-6" : "left-1"}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void setDefaultEnabled({
                            serverId: server._id,
                            enabled: !(
                              server.defaultEnabledForNewProjects ?? true
                            ),
                          })
                        }
                        className="rounded-lg px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-900 hover:text-white"
                        title="Default for new projects"
                      >
                        {(server.defaultEnabledForNewProjects ?? true)
                          ? "Default on"
                          : "Default off"}
                      </button>
                      <button
                        type="button"
                        disabled={testingId === String(server._id)}
                        onClick={() =>
                          void testServer(String(server._id)).catch(
                            (testError) =>
                              setError(
                                testError instanceof Error
                                  ? testError.message
                                  : "MCP connection failed.",
                              ),
                          )
                        }
                        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white disabled:opacity-40"
                        aria-label={`Test ${server.name}`}
                      >
                        <RefreshCw
                          size={16}
                          className={
                            testingId === String(server._id)
                              ? "animate-spin"
                              : ""
                          }
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void removeServer({ serverId: server._id })
                        }
                        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-red-400"
                        aria-label={`Remove ${server.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {server.lastError && (
                      <p role="alert" className="mt-3 text-xs text-red-300">
                        {server.lastError}
                      </p>
                    )}
                    {!!server.tools?.length && (
                      <details className="mt-3 text-xs text-zinc-400">
                        <summary>
                          Discovered tools ({server.tools.length})
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {server.tools.map((tool) => (
                            <li key={tool.name}>{tool.name}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
