import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const tool = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  inputSchemaJson: v.string(),
  enabled: v.optional(v.boolean()),
});
async function own(
  ctx: QueryCtx | MutationCtx,
  serverId: Id<"mcpServers">,
  service?: { userId?: Id<"users">; internalSecret?: string },
) {
  const userId =
    service?.internalSecret &&
    process.env.CRYZO_INTERNAL_API_SECRET &&
    service.internalSecret === process.env.CRYZO_INTERNAL_API_SECRET
      ? service.userId
      : await getAuthUserId(ctx);
  const server = await ctx.db.get(serverId);
  if (!userId || !server || server.userId !== userId)
    throw new Error("MCP server not found.");
  return server;
}
export const stage = mutation({
  args: {
    serverId: v.id("mcpServers"),
    version: v.string(),
    tools: v.array(tool),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const server = await own(ctx, args.serverId);
    if (server.catalogVersion === args.version)
      throw new Error("Cannot modify the active catalog");
    if (args.tools.length > 20) throw new Error("Discovery batch is too large");
    let added = 0;
    for (const item of args.tools) {
      if (new TextEncoder().encode(JSON.stringify(item)).length > 800_000)
        throw new Error("MCP tool is too large.");
      JSON.parse(item.inputSchemaJson);
      const prior = await ctx.db
        .query("mcpTools")
        .withIndex("by_server_version_name", (q) =>
          q
            .eq("serverId", args.serverId)
            .eq("version", args.version)
            .eq("name", item.name),
        )
        .unique();
      if (!prior) {
        await ctx.db.insert("mcpTools", {
          serverId: args.serverId,
          version: args.version,
          ...item,
        });
        added++;
      }
    }
    const catalog = await ctx.db
      .query("mcpCatalogVersions")
      .withIndex("by_server_version", (q) =>
        q.eq("serverId", args.serverId).eq("version", args.version),
      )
      .unique();
    if (catalog)
      await ctx.db.patch(catalog._id, { count: catalog.count + added });
    else {
      await ctx.db.insert("mcpCatalogVersions", {
        serverId: args.serverId,
        version: args.version,
        count: added,
      });
      await ctx.scheduler.runAfter(3600000, internal.mcpCatalog.removeVersion, {
        serverId: args.serverId,
        version: args.version,
      });
    }
    return null;
  },
});
export const activate = mutation({
  args: {
    serverId: v.id("mcpServers"),
    version: v.string(),
    count: v.number(),
    expectedUpdatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const server = await own(ctx, args.serverId);
    if (
      args.expectedUpdatedAt !== undefined &&
      server.updatedAt !== args.expectedUpdatedAt
    )
      throw new Error(
        "Connection settings changed during verification. Retry verification.",
      );
    const catalog = await ctx.db
      .query("mcpCatalogVersions")
      .withIndex("by_server_version", (q) =>
        q.eq("serverId", args.serverId).eq("version", args.version),
      )
      .unique();
    const count = catalog?.count ?? 0;
    if (count !== args.count || count > 1000)
      throw new Error("Tool discovery was incomplete. Retry verification.");
    await ctx.db.patch(server._id, {
      catalogVersion: args.version,
      toolCount: count,
      tools: undefined,
      lastError: undefined,
      lastConnectedAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (server.catalogVersion && server.catalogVersion !== args.version)
      await ctx.scheduler.runAfter(0, internal.mcpCatalog.removeVersion, {
        serverId: server._id,
        version: server.catalogVersion,
      });
    return null;
  },
});
export const page = query({
  args: {
    serverId: v.id("mcpServers"),
    cursor: v.union(v.string(), v.null()),
    userId: v.optional(v.id("users")),
    internalSecret: v.optional(v.string()),
  },
  returns: v.object({
    tools: v.array(tool),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const server = await own(ctx, args.serverId, args);
    if (!server.catalogVersion) return { tools: [], cursor: null };
    const result = await ctx.db
      .query("mcpTools")
      .withIndex("by_server_version", (q) =>
        q.eq("serverId", server._id).eq("version", server.catalogVersion!),
      )
      .paginate({ cursor: args.cursor, numItems: 8 });
    return {
      tools: result.page.map(
        ({ name, description, inputSchemaJson, enabled }) => ({
          name,
          ...(description ? { description } : {}),
          inputSchemaJson,
          ...(enabled !== undefined ? { enabled } : {}),
        }),
      ),
      cursor: result.isDone ? null : result.continueCursor,
    };
  },
});
export const removeVersion = internalMutation({
  args: { serverId: v.id("mcpServers"), version: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const server = await ctx.db.get(args.serverId);
    if (server?.catalogVersion === args.version) return null;
    const rows = await ctx.db
      .query("mcpTools")
      .withIndex("by_server_version", (q) =>
        q.eq("serverId", args.serverId).eq("version", args.version),
      )
      .take(8);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 8)
      await ctx.scheduler.runAfter(0, internal.mcpCatalog.removeVersion, args);
    else {
      const catalog = await ctx.db
        .query("mcpCatalogVersions")
        .withIndex("by_server_version", (q) =>
          q.eq("serverId", args.serverId).eq("version", args.version),
        )
        .unique();
      if (catalog) await ctx.db.delete(catalog._id);
    }
    return null;
  },
});

export const removeServer = internalMutation({
  args: { serverId: v.id("mcpServers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.serverId)) return null;
    const tools = await ctx.db
      .query("mcpTools")
      .withIndex("by_server_version", (q) => q.eq("serverId", args.serverId))
      .take(8);
    for (const tool of tools) await ctx.db.delete(tool._id);
    if (tools.length === 8) {
      await ctx.scheduler.runAfter(0, internal.mcpCatalog.removeServer, args);
      return null;
    }
    const versions = await ctx.db
      .query("mcpCatalogVersions")
      .withIndex("by_server_version", (q) => q.eq("serverId", args.serverId))
      .take(50);
    for (const version of versions) await ctx.db.delete(version._id);
    if (versions.length === 50)
      await ctx.scheduler.runAfter(0, internal.mcpCatalog.removeServer, args);
    return null;
  },
});
