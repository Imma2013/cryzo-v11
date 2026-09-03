import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

function validateRemoteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid MCP server URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("MCP servers must use HTTPS.");
  }
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

export const add = mutation({
  args: {
    name: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to add an MCP server.");

    const name = args.name.trim();
    if (!name || name.length > 80) throw new Error("Enter a server name.");
    const url = validateRemoteUrl(args.url.trim());
    const existing = await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existing.some((server) => server.url === url)) {
      throw new Error("This MCP server is already configured.");
    }

    const now = Date.now();
    return await ctx.db.insert("mcpServers", {
      userId,
      name,
      url,
      transport: "http",
      authType: "none",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const server = await ctx.db.get(args.serverId);
    if (!server || server.userId !== userId) throw new Error("MCP server not found.");
    await ctx.db.delete(server._id);
    return null;
  },
});
