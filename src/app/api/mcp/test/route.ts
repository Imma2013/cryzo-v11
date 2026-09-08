import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import {
  assertPublicMcpUrl,
  listRemoteMcpTools,
  type McpServerRecord,
} from "@/lib/server/mcp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(req: Request) {
  try {
    const token = bearer(req);
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await req.json()) as { serverId?: string };
    const serverId = body.serverId?.trim();
    if (!serverId) return Response.json({ error: "Server is required." }, { status: 400 });

    const server = (await fetchQuery(
      (api as any).mcpServers.get,
      { serverId: serverId as any },
      { token },
    )) as McpServerRecord | null;
    if (!server) return Response.json({ error: "MCP server not found." }, { status: 404 });

    await assertPublicMcpUrl(server.url);
    const tools = await listRemoteMcpTools(server, token);
    return Response.json({
      ok: true,
      protocol: "MCP",
      transport: "Streamable HTTP",
      toolCount: tools.length,
      tools: tools.map((item) => ({ name: item.name, description: item.description })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP connection failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}