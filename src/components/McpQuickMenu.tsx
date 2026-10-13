"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Cable, ChevronRight, Loader2 } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";

type McpServer = { _id: Id<"mcpServers">; name: string; url: string; enabled: boolean; projectEnabled?: boolean };

export function McpQuickMenu({ conversationId }: { conversationId?: string }) {
  const projectServers = useQuery((api as any).mcpServers.listForProject, conversationId ? { conversationId: conversationId as any } : "skip") as McpServer[] | undefined;
  const globalServers = useQuery((api as any).mcpServers.list, conversationId ? "skip" : {}) as McpServer[] | undefined;
  const setEnabled = useMutation((api as any).mcpServers.setEnabled);
  const setProjectEnabled = useMutation((api as any).mcpServers.setProjectEnabled);
  const servers = conversationId ? projectServers : globalServers;
  const toggle = (server: McpServer) => {
    const enabled = conversationId ? server.projectEnabled ?? server.enabled : server.enabled;
    return conversationId ? setProjectEnabled({ conversationId: conversationId as any, serverId: server._id, enabled: !enabled }) : setEnabled({ serverId: server._id, enabled: !enabled });
  };
  return <div className="border-t border-zinc-800 pt-1.5">
    <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600"><Cable size={12}/> MCP connectors</div>
    {!servers ? <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500"><Loader2 size={13} className="animate-spin"/> Loading connectors…</div>
      : servers.length === 0 ? <Link href="/chat/apps/mcp" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900">Add an MCP server <ChevronRight size={14}/></Link>
      : <div className="space-y-0.5">{servers.slice(0,6).map(server => { const enabled = conversationId ? server.projectEnabled ?? server.enabled : server.enabled; return <button key={server._id} type="button" onClick={() => void toggle(server)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-900"><span className="min-w-0 flex-1"><span className="block truncate text-sm text-zinc-200">{server.name}</span><span className="block truncate text-[10px] text-zinc-600">{conversationId ? "This project" : "Global default"} · {server.url}</span></span><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${enabled ? "bg-blue-600" : "bg-zinc-700"}`}><span className={`absolute top-1 h-3 w-3 rounded-full bg-white transition ${enabled ? "left-5" : "left-1"}`}/></span></button>; })}<Link href="/chat/apps/mcp" className="mt-1 flex items-center justify-between rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300">Manage connectors <ChevronRight size={13}/></Link></div>}
  </div>;
}
