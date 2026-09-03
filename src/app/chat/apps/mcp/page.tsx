"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Server, Trash2 } from "lucide-react";
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

const mcpApi = (api as unknown as {
  mcpServers: {
    list: FunctionReference<"query", "public", Record<string, never>, McpServer[]>;
    add: FunctionReference<"mutation", "public", { name: string; url: string }, Id<"mcpServers">>;
    remove: FunctionReference<"mutation", "public", { serverId: Id<"mcpServers"> }, null>;
  };
}).mcpServers;

export default function McpConnectorsPage() {
  const servers = useQuery(mcpApi.list);
  const addServer = useMutation(mcpApi.add);
  const removeServer = useMutation(mcpApi.remove);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await addServer({ name, url });
      setName("");
      setUrl("");
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
            Add any remote Model Context Protocol server with a secure HTTPS endpoint. Configured servers can be enabled for Cryzo projects as MCP tool execution rolls out.
          </p>
        </header>

        <section className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-black">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="font-semibold">Custom MCP server</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Remote HTTP transport with no authentication. OAuth and encrypted bearer credentials are next.</p>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-black px-4 py-3">
                <p className="text-xs text-zinc-500">Transport type</p>
                <p className="mt-1 text-sm font-medium">HTTP</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-black px-4 py-3">
                <p className="text-xs text-zinc-500">Authentication</p>
                <p className="mt-1 text-sm font-medium">None</p>
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
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
              {servers.map((server) => (
                <article key={server._id} className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-black">
                    <Server size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{server.name}</h3>
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 size={11} /> Configured</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500">{server.url}</p>
                  </div>
                  <button type="button" onClick={() => void removeServer({ serverId: server._id })} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-red-400" aria-label={`Remove ${server.name}`}>
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
