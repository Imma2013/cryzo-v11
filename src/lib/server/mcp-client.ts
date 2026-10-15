import { decodeMcpTool } from "./mcp-schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { mcpCredentialHeaders, type McpCredential } from "./mcp-config";
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
  transport: "http" | "sse";
  authType: McpAuthType;
  enabled: boolean;
  projectEnabled?: boolean;
  defaultEnabledForNewProjects?: boolean;
  tools?: McpToolMeta[];
  catalogVersion?: string;
  toolCount?: number;
  updatedAt?: number;
  lastConnectedAt?: number;
  lastError?: string;
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
    normalized.startsWith("::ffff:") ||
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
  if (
    !resolved.length ||
    resolved.some((entry) => isPrivateAddress(entry.address))
  ) {
    throw new Error("Private or unresolved MCP hosts are not supported.");
  }
  return url;
}

function parseCredential(raw?: string | null) {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as McpCredential)
      : { access_token: raw };
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
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
    headers,
    body: form,
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
  } | null;
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
  if (server.authType === "none") return null;
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
      credential = row
        ? parseCredential(decryptProviderSecret(row as any))
        : null;
    }
  }

  if (!credential?.access_token) {
    throw new Error(
      `${server.name} requires ${
        server.authType === "oauth" ? "MCP OAuth" : "an API key"
      } before it can be used.`,
    );
  }
  return await refreshCredentialIfNeeded(identity, server, credential);
}

async function withMcpClient<T>(
  server: McpServerRecord,
  identity: McpIdentity,
  operation: (client: Client) => Promise<T>,
) {
  const endpoint = await assertPublicMcpUrl(server.url);
  const credential = await resolveCredential(identity, server);
  const headers = mcpCredentialHeaders(credential);
  // Apply authentication to SSE's initial GET as well as subsequent POSTs.
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const target = await assertPublicMcpUrl(url);
    if (target.origin !== endpoint.origin)
      throw new Error("MCP transport redirected to a different origin.");
    const requestHeaders = new Headers(init?.headers);
    for (const [name, value] of Object.entries(headers))
      requestHeaders.set(name, value);
    return fetch(input, {
      ...init,
      headers: requestHeaders,
      redirect: "error",
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(120_000),
      ]),
    });
  };
  const transport =
    server.transport === "sse"
      ? new SSEClientTransport(endpoint, {
          requestInit: { headers },
          fetch: guardedFetch,
          eventSourceInit: { fetch: guardedFetch },
        })
      : new StreamableHTTPClientTransport(endpoint, {
          requestInit: { headers },
          fetch: guardedFetch,
        });
  const client = new Client({ name: "Cryzo", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: 20_000 });
    return await operation(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function listRemoteMcpTools(
  server: McpServerRecord,
  authToken?: string,
  userId?: string,
) {
  return withMcpClient(server, { authToken, userId }, async (client) => {
    const tools: McpToolMeta[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, {
        timeout: 20_000,
      });
      for (const item of page.tools) {
        tools.push({
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          inputSchema: item.inputSchema,
          enabled: true,
        });
      }
      cursor = page.nextCursor;
      if (cursor && (seen.has(cursor) || tools.length >= 1000))
        throw new Error("MCP tool discovery exceeded its pagination limit.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return tools;
  });
}

export async function callRemoteMcpTool(
  server: McpServerRecord,
  identity: McpIdentity,
  toolName: string,
  args: unknown,
) {
  return withMcpClient(server, identity, (client) =>
    client.callTool(
      {
        name: toolName,
        arguments: (args ?? {}) as Record<string, unknown>,
      },
      undefined,
      { timeout: 120_000 },
    ),
  );
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
      await fetchMutation(
        (api as any).mcpServers.ensureProjectDefaultsForServer,
        {
          userId: identity.userId as any,
          conversationId: identity.conversationId as any,
          internalSecret,
        },
      );
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
    if (server.catalogVersion) {
      const stored = [];
      let cursor: string | null = null;
      do {
        const page: any = await fetchQuery(
          api.mcpCatalog.page,
          {
            serverId: server._id as any,
            cursor,
            ...(!identity.authToken
              ? { userId: identity.userId as any, internalSecret }
              : {}),
          },
          identity.authToken ? { token: identity.authToken } : {},
        );
        stored.push(...page.tools.map(decodeMcpTool));
        cursor = page.cursor;
      } while (cursor);
      remoteTools = stored.filter((item) => item.enabled !== false);
    }
    if (!remoteTools.length && !server.catalogVersion) {
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
