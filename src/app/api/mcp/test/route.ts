import { randomUUID } from "node:crypto";
import { encodeMcpTool, mcpConnectionError } from "@/lib/server/mcp-schema";
import { fetchMutation, fetchQuery } from "convex/nextjs";
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
  const token = bearer(req);
  let serverId = "";

  try {
    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as { serverId?: string };
    serverId = body.serverId?.trim() || "";
    if (!serverId) {
      return Response.json({ error: "Server is required." }, { status: 400 });
    }

    const server = (await fetchQuery(
      (api as any).mcpServers.get,
      { serverId: serverId as any },
      { token },
    )) as McpServerRecord | null;
    if (!server) {
      return Response.json({ error: "MCP server not found." }, { status: 404 });
    }

    await assertPublicMcpUrl(server.url);
    const tools = await listRemoteMcpTools(server, token);
    const version = randomUUID();
    // One tool per record; stage all pages before switching the active catalog.
    let batch: ReturnType<typeof encodeMcpTool>[] = [];
    let bytes = 0;
    const stage = async () => {
      if (batch.length)
        await fetchMutation(
          api.mcpCatalog.stage,
          { serverId: serverId as any, version, tools: batch },
          { token },
        );
      batch = [];
      bytes = 0;
    };
    for (const tool of tools) {
      const encoded = encodeMcpTool(tool),
        size = new TextEncoder().encode(JSON.stringify(encoded)).length;
      if (batch.length >= 20 || bytes + size > 2_000_000) await stage();
      batch.push(encoded);
      bytes += size;
    }
    await stage();
    await fetchMutation(
      api.mcpCatalog.activate,
      {
        serverId: serverId as any,
        version,
        count: tools.length,
        expectedUpdatedAt: server.updatedAt,
      },
      { token },
    );

    return Response.json({
      ok: true,
      protocol: "MCP",
      transport: server.transport === "sse" ? "SSE" : "Streamable HTTP",
      authType: server.authType,
      toolCount: tools.length,
      tools: tools.map((item) => ({
        name: item.name,
        description: item.description,
      })),
    });
  } catch (error) {
    const failure = mcpConnectionError(error);
    const message = failure.message;
    if (token && serverId) {
      await fetchMutation(
        (api as any).mcpServers.updateHealth,
        {
          serverId: serverId as any,
          error: message,
        },
        { token },
      ).catch(() => {});
    }
    return Response.json(
      {
        error: message,
        detail: failure.detail,
        authorizationRequired: failure.authorizationRequired,
      },
      { status: 400 },
    );
  }
}
