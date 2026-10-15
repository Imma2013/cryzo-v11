import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const authTypeValidator = v.union(
  v.literal("none"),
  v.literal("api_key"),
  v.literal("oauth"),
);
const toolValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  inputSchema: v.optional(v.any()),
  enabled: v.optional(v.boolean()),
});

function validateRemoteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConvexError("Enter a valid MCP server URL.");
  }
  if (url.protocol !== "https:")
    throw new ConvexError("MCP servers must use HTTPS.");
  if (url.username || url.password) {
    throw new Error("Credentials cannot be embedded in the MCP URL.");
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error("Private network MCP URLs are not supported.");
  url.hash = "";
  return url.toString();
}

async function ownedConversation(ctx: any, conversationId: any) {
  const userId = await getAuthUserId(ctx);
  const conversation = userId ? await ctx.db.get(conversationId) : null;
  if (!userId || !conversation || conversation.userId !== userId) {
    throw new Error("Conversation not found.");
  }
  return userId;
}

async function projectRows(ctx: any, userId: any, conversationId: any) {
  const servers = await ctx.db
    .query("mcpServers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  const bindings = await ctx.db
    .query("mcpProjectServers")
    .withIndex("by_user_conversation", (q: any) =>
      q.eq("userId", userId).eq("conversationId", conversationId),
    )
    .collect();
  const byServer = new Map<string, any>(
    bindings.map((row: any) => [String(row.serverId), row]),
  );
  return servers.map((server: any) => ({
    ...server,
    projectEnabled:
      byServer.get(String(server._id))?.enabled ??
      (server.enabled && (server.defaultEnabledForNewProjects ?? true)),
  }));
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const listForServer = query({
  args: {
    userId: v.id("users"),
    internalSecret: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      !process.env.CRYZO_INTERNAL_API_SECRET ||
      args.internalSecret !== process.env.CRYZO_INTERNAL_API_SECRET
    ) {
      throw new Error("Unauthorized");
    }
    return await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const listForProject = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await ownedConversation(ctx, args.conversationId);
    return await projectRows(ctx, userId, args.conversationId);
  },
});

export const listForProjectServer = query({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    internalSecret: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      !process.env.CRYZO_INTERNAL_API_SECRET ||
      args.internalSecret !== process.env.CRYZO_INTERNAL_API_SECRET
    ) {
      throw new Error("Unauthorized");
    }
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== args.userId) return [];
    return await projectRows(ctx, args.userId, args.conversationId);
  },
});

export const get = query({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const server = await ctx.db.get(args.serverId);
    if (!server || server.userId !== userId) return null;
    return server;
  },
});

export const setEnabled = mutation({
  args: {
    serverId: v.id("mcpServers"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const server = userId ? await ctx.db.get(args.serverId) : null;
    if (!userId || !server || server.userId !== userId) {
      throw new Error("MCP server not found.");
    }
    await ctx.db.patch(server._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    return args.enabled;
  },
});

export const setDefaultEnabled = mutation({
  args: {
    serverId: v.id("mcpServers"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const server = userId ? await ctx.db.get(args.serverId) : null;
    if (!userId || !server || server.userId !== userId) {
      throw new Error("MCP server not found.");
    }
    await ctx.db.patch(server._id, {
      defaultEnabledForNewProjects: args.enabled,
      updatedAt: Date.now(),
    });
    return args.enabled;
  },
});

export const ensureProjectDefaults = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await ownedConversation(ctx, args.conversationId);
    const servers = await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existing = await ctx.db
      .query("mcpProjectServers")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", userId).eq("conversationId", args.conversationId),
      )
      .collect();
    const known = new Set(existing.map((row) => String(row.serverId)));
    const now = Date.now();
    for (const server of servers) {
      if (known.has(String(server._id))) continue;
      await ctx.db.insert("mcpProjectServers", {
        userId,
        conversationId: args.conversationId,
        serverId: server._id,
        enabled:
          server.enabled && (server.defaultEnabledForNewProjects ?? true),
        createdAt: now,
        updatedAt: now,
      });
    }
    return true;
  },
});

export const ensureProjectDefaultsForServer = mutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    internalSecret: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      !process.env.CRYZO_INTERNAL_API_SECRET ||
      args.internalSecret !== process.env.CRYZO_INTERNAL_API_SECRET
    ) {
      throw new Error("Unauthorized");
    }
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== args.userId) return false;
    const servers = await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const existing = await ctx.db
      .query("mcpProjectServers")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", args.userId).eq("conversationId", args.conversationId),
      )
      .collect();
    const known = new Set(existing.map((row) => String(row.serverId)));
    const now = Date.now();
    for (const server of servers) {
      if (known.has(String(server._id))) continue;
      await ctx.db.insert("mcpProjectServers", {
        userId: args.userId,
        conversationId: args.conversationId,
        serverId: server._id,
        enabled:
          server.enabled && (server.defaultEnabledForNewProjects ?? true),
        createdAt: now,
        updatedAt: now,
      });
    }
    return true;
  },
});

export const setProjectEnabled = mutation({
  args: {
    conversationId: v.id("conversations"),
    serverId: v.id("mcpServers"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await ownedConversation(ctx, args.conversationId);
    const server = await ctx.db.get(args.serverId);
    if (!server || server.userId !== userId) {
      throw new Error("MCP server not found.");
    }
    const existing = await ctx.db
      .query("mcpProjectServers")
      .withIndex("by_project_server", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("serverId", args.serverId),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("mcpProjectServers", {
        userId,
        conversationId: args.conversationId,
        serverId: args.serverId,
        enabled: args.enabled,
        createdAt: now,
        updatedAt: now,
      });
    }
    return args.enabled;
  },
});

export const add = mutation({
  args: {
    serverId: v.optional(v.id("mcpServers")),
    name: v.string(),
    url: v.string(),
    transport: v.optional(v.union(v.literal("http"), v.literal("sse"))),
    authType: v.optional(authTypeValidator),
    defaultEnabledForNewProjects: v.optional(v.boolean()),
  },
  returns: v.id("mcpServers"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to add an MCP server.");
    const name = args.name.trim();
    if (!name || name.length > 80)
      throw new ConvexError("Enter a server name (up to 80 characters).");
    const url = validateRemoteUrl(args.url.trim());
    const rows = await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(101);
    const existing = args.serverId
      ? await ctx.db.get(args.serverId)
      : rows.find((row) => row.url === url);
    if (args.serverId && (!existing || existing.userId !== userId))
      throw new ConvexError("MCP server not found.");
    if (rows.some((row) => row.url === url && existing?._id !== row._id))
      throw new ConvexError(
        "That URL belongs to another configured server. Edit that server instead.",
      );
    const now = Date.now();
    const value = {
      name,
      url,
      transport: args.transport ?? ("http" as const),
      authType: args.authType ?? ("none" as const),
      defaultEnabledForNewProjects: args.defaultEnabledForNewProjects ?? true,
      updatedAt: now,
    };
    if (existing) {
      const changed =
        existing.url !== url ||
        existing.authType !== value.authType ||
        existing.transport !== value.transport;
      if (changed) {
        const secret = await ctx.db
          .query("providerSecrets")
          .withIndex("by_user_provider", (q) =>
            q.eq("userId", userId).eq("providerId", "mcp:" + existing._id),
          )
          .unique();
        if (secret) await ctx.db.delete(secret._id);
      }
      await ctx.db.patch(existing._id, {
        ...value,
        ...(changed
          ? {
              tools: [],
              catalogVersion: undefined,
              toolCount: undefined,
              lastConnectedAt: undefined,
              lastError: undefined,
            }
          : {}),
      });
      if (changed && existing.catalogVersion)
        await ctx.scheduler.runAfter(0, internal.mcpCatalog.removeVersion, {
          serverId: existing._id,
          version: existing.catalogVersion,
        });
      return existing._id;
    }
    if (rows.length >= 100)
      throw new ConvexError("A maximum of 100 MCP servers can be configured.");
    return await ctx.db.insert("mcpServers", {
      ...value,
      userId,
      enabled: true,
      createdAt: now,
    });
  },
});

export const updateHealth = mutation({
  args: {
    serverId: v.id("mcpServers"),
    tools: v.optional(v.array(toolValidator)),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const server = userId ? await ctx.db.get(args.serverId) : null;
    if (!userId || !server || server.userId !== userId) {
      throw new Error("MCP server not found.");
    }
    await ctx.db.patch(server._id, {
      ...(args.tools ? { tools: args.tools } : {}),
      ...(args.error ? {} : { lastConnectedAt: Date.now() }),
      lastError: args.error?.slice(0, 500),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const remove = mutation({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const server = userId ? await ctx.db.get(args.serverId) : null;
    if (!userId || !server || server.userId !== userId) {
      throw new Error("MCP server not found.");
    }

    const secret = await ctx.db
      .query("providerSecrets")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("providerId", `mcp:${server._id}`),
      )
      .unique();
    if (secret) await ctx.db.delete(secret._id);

    const bindings = await ctx.db
      .query("mcpProjectServers")
      .withIndex("by_server", (q) => q.eq("serverId", server._id))
      .collect();
    for (const binding of bindings) await ctx.db.delete(binding._id);

    await ctx.db.delete(server._id);
    await ctx.scheduler.runAfter(0, internal.mcpCatalog.removeServer, {
      serverId: server._id,
    });
    return null;
  },
});
