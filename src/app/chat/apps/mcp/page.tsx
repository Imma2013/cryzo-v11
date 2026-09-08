"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
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
import type { FunctionReference } from "convex/server";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";

type McpServer = {
  _id: Id<"mcpServers">;
  _creationTime: number;
  userId: Id<"users">;
  name: string;
  url: string;
  transport: "http";
  authType: "none";
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

type SecretMeta = {
  providerId: string;
  baseUrl?: string;
  updatedAt: number;
};

const mcpApi = (api as unknown as {
  mcpServers: {
    list: FunctionReference<"query", "public", Record<string, never>, McpServer[]>;
    add: FunctionReference<"mutation", "public", { name: string; url: string }, Id<"mcpServers">>;
    remove: FunctionReference<"mutation", "public", { serverId: Id<"mcpServers"> }, null>;
    setEnabled: FunctionReference<"mutation", "public", { serverId: Id<"mcpServers">; enabled: boolean }, boolean>;
  };
}).mcpServers;

export default function McpConnectorsPage() {
  const authToken = useAuthToken();
  const servers = useQuery(mcpApi.list);
  const secretRows = useQuery((api as any).providerSecrets.list) as SecretMeta[] | undefined;
  const addServer = useMutation(mcpApi.add);
  const removeServer = useMutation(mcpApi.remove);
  const setEnabled = useMutation(mcpApi.setEnabled);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<"none" | "api_key">("none");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toolCounts, setToolCounts] = useState<Record<string, number>>({});

  const secured = useMemo(
    () => new Set((secretRows || []).filter((row) => row.providerId.startsWith("mcp:")).map((row) => row.providerId.slice(4))),
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
      body: JSON.stringify({ serverId, secret }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to save MCP API key.");
  }

  async function testServer(serverId: string) {
    if (!authToken) throw new Error("Your Cryzo session is still loading.");
    setTestingId(serverId);
    setError("");
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
      if (!response.ok) throw new Error(data.error || "MCP connection failed.");
      setToolCounts((current) => ({ ...current, [serverId]: Number(data.toolCount || 0) }));
      setNotice(`Connected. ${data.toolCount || 0} MCP tool${Number(data.toolCount) === 1 ? "" : "s"} discovered.`);
    } finally {
      setTestingId(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const serverId = await addServer({ name, url });
      if (authType === "api_key") {
        if (!apiKey.trim()) throw new Error("Enter the API key for this MCP server.");
        await saveSecret(String(serverId), apiKey.trim());
      }
      setName("");
      setUrl("");
      setApiKey("");
      setAuthType("none");
      await testServer(String(serverId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add MCP server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-black px-4 py-6 text-white sm:px-6">
      <div className="mx-auto w-full max-w-5xl pb-16">
        <Link href="/chat/apps" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft size={15} /> Back to Apps
        </Link>

        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">Apps</p>
          <h1 className="mt-2 text-3xl font-semibold">Connectors (MCP)</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Connect remote Model Context Protocol servers and let Cryzo use their tools while you build. Credentials are encrypted on the Cryzo server and never written into generated projects.
          </p>
        </header>

        <section className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-black">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="font-semibold">New MCP server</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Cryzo uses MCP Streamable HTTP. Legacy SSE can still be served by endpoints that return SSE frames to HTTP requests.
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm text-zinc-300">
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Stripe MCP" maxLength={80} required className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm" />
            </label>
            <label className="grid gap-2 text-sm text-zinc-300">
              URL
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://mcp.example.com/v1" type="url" required className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-zinc-300">
                Transport type
                <select className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none" defaultValue="http">
                  <option value="http">HTTP</option>
                  <option value="sse" disabled>SSE (legacy; use HTTP endpoint)</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-zinc-300">
                Authentication
                <select value={authType} onChange={(event) => setAuthType(event.target.value as "none" | "api_key")} className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none">
                  <option value="none">None</option>
                  <option value="api_key">API Key</option>
                  <option value="oauth" disabled>MCP OAuth (provider support required)</option>
                </select>
              </label>
            </div>
            {authType === "api_key" && (
              <label className="grid gap-2 text-sm text-zinc-300">
                API key / bearer token
                <div className="relative">
                  <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" placeholder="Paste the server credential" required className="w-full rounded-xl border border-zinc-800 bg-black py-3 pl-10 pr-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm" />
                </div>
                <span className="text-xs text-zinc-600">Sent as an Authorization bearer credential. Stored encrypted with CRYZO_SECRETS_KEY.</span>
              </label>
            )}
            <div className="rounded-xl border border-zinc-800 bg-black px-4 py-3">
              <p className="text-xs text-zinc-500">Automatically enable for projects</p>
              <p className="mt-1 text-sm text-zinc-300">New connectors are enabled by default. You can disable them from this page or the chat + menu.</p>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {notice && <p className="text-sm text-emerald-400">{notice}</p>}
            <button type="submit" disabled={saving} className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Add MCP server
            </button>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Your MCP servers</h2>
              <p className="mt-1 text-xs text-zinc-500">{servers?.length ?? 0} configured</p>
            </div>
          </div>
          {!servers ? (
            <Loader2 className="mt-6 animate-spin text-zinc-500" size={20} />
          ) : servers.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 px-5 py-12 text-center">
              <Server className="mx-auto text-zinc-600" size={24} />
              <p className="mt-3 text-sm text-zinc-400">No MCP servers configured yet.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {servers.map((server) => {
                const hasSecret = secured.has(String(server._id));
                return (
                  <article key={server._id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-black">
                        <Server size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">{server.name}</h3>
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 size={11} /> {server.enabled ? "Enabled" : "Disabled"}</span>
                          {hasSecret && <span className="text-[11px] text-zinc-500">API key</span>}
                          {toolCounts[String(server._id)] !== undefined && <span className="text-[11px] text-zinc-500">{toolCounts[String(server._id)]} tools</span>}
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">{server.url}</p>
                      </div>
                      <button type="button" onClick={() => void setEnabled({ serverId: server._id, enabled: !server.enabled })} className={`relative h-6 w-11 rounded-full transition ${server.enabled ? "bg-blue-600" : "bg-zinc-700"}`} aria-label={`${server.enabled ? "Disable" : "Enable"} ${server.name}`}>
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${server.enabled ? "left-6" : "left-1"}`} />
                      </button>
                      <button type="button" disabled={testingId === String(server._id)} onClick={() => void testServer(String(server._id)).catch((testError) => setError(testError instanceof Error ? testError.message : "MCP connection failed."))} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white disabled:opacity-40" aria-label={`Test ${server.name}`}>
                        <RefreshCw size={16} className={testingId === String(server._id) ? "animate-spin" : ""} />
                      </button>
                      <button type="button" onClick={() => void removeServer({ serverId: server._id })} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-red-400" aria-label={`Remove ${server.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
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