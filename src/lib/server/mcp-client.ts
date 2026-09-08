import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fetchQuery } from "convex/nextjs";
import { jsonSchema, tool } from "ai";
import { api } from "../../../convex/_generated/api";
import {
  decryptProviderSecret,
  resolveAccountProviderSecret,
} from "@/lib/server/provider-secrets";

type McpTransport = "http" | "sse";
type McpAuthType = "none" | "api_key" | "oauth";

type McpToolMeta = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  enabled?: boolean;
};

export type McpServerRecord = {
  _id: string;
  name: string;
  url: string;
  transport: McpTransport;
  authType: McpAuthType;
  enabled: boolean;
  tools?: McpToolMeta[];
};

type McpCredential = {
  access_token?: string;
  token_type?: string;
  expires_at?: number;
};

type McpIdentity = {
  authToken?: string;
  userId?: string;
};

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

export async function assertPublicMcpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("MCP servers must use HTTPS.");
  if (url.username || url.password) throw new Error("Credentials cannot be embedded in the MCP URL.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Private network MCP URLs are not supported.");
  }
  const resolved = await lookup(host, { all: true, verbatim: true });
  if (!resolved.length || resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Private or unresolved MCP hosts are not supported.");
  }
  return url;
}

function parseCredential(raw?: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as McpCredential;
  } catch {
    return { access_token: raw } satisfies McpCredential;
  }
}

async function resolveCredential(identity: McpIdentity, server: McpServerRecord) {
  if (identity.authToken) {
    const stored = await resolveAccountProviderSecret(
      identity.authToken,
      `mcp:${server._id}`,
    );
    return parseCredential(stored?.apiKey);
  }

  const internalSecret = process.env.CRYZO_INTERNAL_API_SECRET?.trim();
  if (!identity.userId || !internalSecret) return null;
  const row = await fetchQuery(
    (api as any).providerSecrets.getForServer,
    {
      userId: identity.userId as any,
      providerId: `mcp:${server._id}`,
      internalSecret,
    },
  );
  return row ? parseCredential(decryptProviderSecret(row as any)) : null;
}

function authHeaders(credential: McpCredential | null) {
  const token = credential?.access_token?.trim();
  if (!token) return {};
  return { Authorization: `${credential?.token_type || "Bearer"} ${token}` };
}

function parseSseBody(text: string) {
  const frames = text.split(/\n\n+/);
  for (const frame of frames) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Ignore keepalives and non-JSON events.
    }
  }
  throw new Error("MCP server returned an unreadable SSE response.");
}

async function rpc(
  server: McpServerRecord,
  credential: McpCredential | null,
  payload: Record<string, unknown>,
  sessionId?: string | null,
) {
  await assertPublicMcpUrl(server.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(server.url, {
      method: "POST",
      signal: controller.signal,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...authHeaders(credential),
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify(payload),
    });
    const nextSessionId = response.headers.get("mcp-session-id") || sessionId || null;
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1200);
      throw new Error(`${server.name} MCP request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    if (response.status === 202 || response.status === 204) {
      return { data: null as any, sessionId: nextSessionId };
    }
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const data = contentType.includes("text/event-stream")
      ? parseSseBody(body)
      : JSON.parse(body || "null");
    if (data?.error) {
      throw new Error(data.error.message || `${server.name} returned an MCP error.`);
    }
    return { data, sessionId: nextSessionId };
  } finally {
    clearTimeout(timeout);
  }
}

async function initialize(server: McpServerRecord, credential: McpCredential | null) {
  const init = await rpc(server, credential, {
    jsonrpc: "2.0",
    id: `init-${Date.now()}`,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "Cryzo", version: "1.0.0" },
    },
  });
  await rpc(
    server,
    credential,
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    init.sessionId,
  );
  return init.sessionId;
}

export async function listRemoteMcpTools(
  server: McpServerRecord,
  authToken?: string,
  userId?: string,
) {
  const credential = await resolveCredential({ authToken, userId }, server);
  const sessionId = await initialize(server, credential);
  const response = await rpc(
    server,
    credential,
    { jsonrpc: "2.0", id: `tools-${Date.now()}`, method: "tools/list", params: {} },
    sessionId,
  );
  const tools = Array.isArray(response.data?.result?.tools)
    ? response.data.result.tools
    : [];
  return tools
    .filter((item: any) => typeof item?.name === "string" && item.name.trim())
    .map((item: any) => ({
      name: item.name.trim(),
      description:
        typeof item.description === "string" ? item.description : undefined,
      inputSchema:
        item.inputSchema && typeof item.inputSchema === "object"
          ? item.inputSchema
          : { type: "object", properties: {} },
      enabled: true,
    })) as McpToolMeta[];
}

export async function callRemoteMcpTool(
  server: McpServerRecord,
  identity: McpIdentity,
  toolName: string,
  args: unknown,
) {
  const credential = await resolveCredential(identity, server);
  const sessionId = await initialize(server, credential);
  const response = await rpc(
    server,
    credential,
    {
      jsonrpc: "2.0",
      id: `call-${Date.now()}`,
      method: "tools/call",
      params: { name: toolName, arguments: args ?? {} },
    },
    sessionId,
  );
  return response.data?.result ?? response.data;
}

function safeToolName(serverName: string, toolName: string) {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return `mcp_${clean(serverName).slice(0, 24)}_${clean(toolName).slice(0, 36)}`.slice(
    0,
    64,
  );
}

export async function buildProjectMcpTools(identity: McpIdentity) {
  const internalSecret = process.env.CRYZO_INTERNAL_API_SECRET?.trim();
  let servers: McpServerRecord[] = [];

  if (identity.authToken) {
    servers = (await fetchQuery(
      (api as any).mcpServers.list,
      {},
      { token: identity.authToken },
    )) as McpServerRecord[];
  } else if (identity.userId && internalSecret) {
    servers = (await fetchQuery((api as any).mcpServers.listForServer, {
      userId: identity.userId as any,
      internalSecret,
    })) as McpServerRecord[];
  }

  const tools: Record<string, any> = {};
  for (const server of servers.filter((item) => item.enabled)) {
    let remoteTools = (server.tools || []).filter((item) => item.enabled !== false);
    if (!remoteTools.length) {
      try {
        remoteTools = await listRemoteMcpTools(
          server,
          identity.authToken,
          identity.userId,
        );
      } catch (error) {
        console.warn(`[mcp:${server.name}] tool discovery failed`, error);
        continue;
      }
    }
    for (const remoteTool of remoteTools) {
      const exposedName = safeToolName(server.name, remoteTool.name);
      tools[exposedName] = tool({
        description: `${server.name}: ${remoteTool.description || remoteTool.name}`,
        inputSchema: jsonSchema(
          (remoteTool.inputSchema || {
            type: "object",
            properties: {},
          }) as any,
        ),
        execute: async (input) =>
          callRemoteMcpTool(server, identity, remoteTool.name, input),
      });
    }
  }
  return { tools, servers };
}
