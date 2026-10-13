import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { jsonSchema, tool } from "ai";
import { api } from "../../../convex/_generated/api";
import {
  decryptProviderSecret,
  encryptProviderSecret,
  resolveAccountProviderSecret,
} from "@/lib/server/provider-secrets";

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
  transport: "http";
  authType: McpAuthType;
  enabled: boolean;
  projectEnabled?: boolean;
  defaultEnabledForNewProjects?: boolean;
  tools?: McpToolMeta[];
  lastConnectedAt?: number;
  lastError?: string;
};

type McpCredential = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
  token_endpoint?: string;
  client_id?: string;
  client_secret?: string;
  token_endpoint_auth_method?: string;
  resource?: string;
};

type McpIdentity = {
  authToken?: string;
  userId?: string;
  conversationId?: string;
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
  if (url.username || url.password) {
    throw new Error("Credentials cannot be embedded in the MCP URL.");
  }
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

async function persistCredential(
  identity: McpIdentity,
  serverId: string,
  credential: McpCredential,
) {
  const encrypted = encryptProviderSecret(JSON.stringify(credential));
  if (identity.authToken) {
    await fetchMutation(
      (api as any).providerSecrets.upsert,
      {
        providerId: `mcp:${serverId}`,
        ...encrypted,
      },
      { token: identity.authToken },
    );
    return;
  }

  const internalSecret = process.env.CRYZO_INTERNAL_API_SECRET?.trim();
  if (identity.userId && internalSecret) {
    await fetchMutation((api as any).providerSecrets.upsertForServer, {
      userId: identity.userId as any,
      providerId: `mcp:${serverId}`,
      ...encrypted,
      internalSecret,
    });
  }
}

async function refreshCredentialIfNeeded(
  identity: McpIdentity,
  server: McpServerRecord,
  credential: McpCredential | null,
) {
  if (
    !credential?.refresh_token ||
    !credential.token_endpoint ||
    !credential.expires_at ||
    credential.expires_at > Date.now() + 30_000
  ) {
    return credential;
  }

  await assertPublicMcpUrl(credential.token_endpoint);
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credential.refresh_token,
  });
  if (credential.client_id) form.set("client_id", credential.client_id);
  if (credential.resource) form.set("resource", credential.resource);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (credential.client_secret) {
    if (
      credential.token_endpoint_auth_method === "client_secret_basic" &&
      credential.client_id
    ) {
      headers.Authorization = `Basic ${Buffer.from(
        `${credential.client_id}:${credential.client_secret}`,
      ).toString("base64")}`;
    } else if (credential.token_endpoint_auth_method !== "none") {
      form.set("client_secret", credential.client_secret);
    }
  }

  const response = await fetch(credential.token_endpoint, {
    method: "POST",
    redirect: "error",
    headers,
    body: form,
  });
  const body = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        expires_in?: number;
      }
    | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(
      `${server.name} MCP OAuth session expired and could not be refreshed.`,
    );
  }

  const updated: McpCredential = {
    ...credential,
    access_token: body.access_token,
    refresh_token: body.refresh_token || credential.refresh_token,
    token_type: body.token_type || credential.token_type || "Bearer",
    expires_at:
      typeof body.expires_in === "number"
        ? Date.now() + Math.max(0, body.expires_in - 30) * 1000
        : credential.expires_at,
  };
  await persistCredential(identity, server._id, updated);
  return updated;
}

async function resolveCredential(
  identity: McpIdentity,
  server: McpServerRecord,
) {
  let credential: McpCredential | null = null;

  if (identity.authToken) {
    const stored = await resolveAccountProviderSecret(
      identity.authToken,
      `mcp:${server._id}`,
    );
    credential = parseCredential(stored?.apiKey);
  } else {
    const internalSecret = process.env.CRYZO_INTERNAL_API_SECRET?.trim();
    if (identity.userId && internalSecret) {
      const row = await fetchQuery((api as any).providerSecrets.getForServer, {
        userId: identity.userId as any,
        providerId: `mcp:${server._id}`,
        internalSecret,
      });
      credential = row ? parseCredential(decryptProviderSecret(row as any)) : null;
    }
  }

  if (server.authType !== "none" && !credential?.access_token) {
    throw new Error(
      `${server.name} requires ${
        server.authType === "oauth" ? "MCP OAuth" : "an API key"
      } before it can be used.`,
    );
  }
  return await refreshCredentialIfNeeded(identity, server, credential);
}

function authHeaders(credential: McpCredential | null): Record<string, string> {
  const token = credential?.access_token?.trim();
  if (!token) return {};
  return {
    Authorization: `${credential?.token_type || "Bearer"} ${token}`,
  };
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
  const timeout = setTimeout(() => controller.abort(), 20_000);
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
    const nextSessionId =
      response.headers.get("mcp-session-id") || sessionId || null;
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1200);
      throw new Error(
        `${server.name} MCP request failed (${response.status})${
          detail ? `: ${detail}` : ""
        }`,
      );
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
      throw new Error(
        data.error.message || `${server.name} returned an MCP error.`,
      );
    }
    return { data, sessionId: nextSessionId };
  } finally {
    clearTimeout(timeout);
  }
}

async function initialize(
  server: McpServerRecord,
  credential: McpCredential | null,
) {
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
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
    init.sessionId,
  );
  return init.sessionId;
}

export async function listRemoteMcpTools(
  server: McpServerRecord,
  authToken?: string,
  userId?: string,
) {
  const identity = { authToken, userId };
  const credential = await resolveCredential(identity, server);
  const sessionId = await initialize(server, credential);
  const response = await rpc(
    server,
    credential,
    {
      jsonrpc: "2.0",
      id: `tools-${Date.now()}`,
      method: "tools/list",
      params: {},
    },
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
      params: {
        name: toolName,
        arguments: args ?? {},
      },
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
  return `mcp_${clean(serverName).slice(0, 24)}_${clean(toolName).slice(
    0,
    36,
  )}`.slice(0, 64);
}

export async function buildProjectMcpTools(identity: McpIdentity) {
  const internalSecret = process.env.CRYZO_INTERNAL_API_SECRET?.trim();
  let servers: McpServerRecord[] = [];

  if (identity.authToken) {
    if (identity.conversationId) {
      await fetchMutation(
        (api as any).mcpServers.ensureProjectDefaults,
        { conversationId: identity.conversationId as any },
        { token: identity.authToken },
      );
      servers = (await fetchQuery(
        (api as any).mcpServers.listForProject,
        { conversationId: identity.conversationId as any },
        { token: identity.authToken },
      )) as McpServerRecord[];
    } else {
      servers = (await fetchQuery(
        (api as any).mcpServers.list,
        {},
        { token: identity.authToken },
      )) as McpServerRecord[];
    }
  } else if (identity.userId && internalSecret) {
    if (identity.conversationId) {
      await fetchMutation((api as any).mcpServers.ensureProjectDefaultsForServer, {
        userId: identity.userId as any,
        conversationId: identity.conversationId as any,
        internalSecret,
      });
      servers = (await fetchQuery(
        (api as any).mcpServers.listForProjectServer,
        {
          userId: identity.userId as any,
          conversationId: identity.conversationId as any,
          internalSecret,
        },
      )) as McpServerRecord[];
    } else {
      servers = (await fetchQuery((api as any).mcpServers.listForServer, {
        userId: identity.userId as any,
        internalSecret,
      })) as McpServerRecord[];
    }
  }

  const tools: Record<string, any> = {};
  for (const server of servers.filter(
    (item) => item.projectEnabled ?? item.enabled,
  )) {
    let remoteTools = (server.tools || []).filter(
      (item) => item.enabled !== false,
    );
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
        description: `${server.name}: ${
          remoteTool.description || remoteTool.name
        }`,
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
