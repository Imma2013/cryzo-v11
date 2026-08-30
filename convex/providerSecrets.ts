import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const get = query({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("providerSecrets")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("providerId", args.providerId),
      )
      .unique();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("providerSecrets")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    return rows.map((row) => ({
      providerId: row.providerId,
      baseUrl: row.baseUrl,
      updatedAt: row.updatedAt,
    }));
  },
});

export const upsert = mutation({
  args: {
    providerId: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    tag: v.string(),
    baseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const existing = await ctx.db
      .query("providerSecrets")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("providerId", args.providerId),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ciphertext: args.ciphertext,
        iv: args.iv,
        tag: args.tag,
        baseUrl: args.baseUrl,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("providerSecrets", {
      userId,
      providerId: args.providerId,
      ciphertext: args.ciphertext,
      iv: args.iv,
      tag: args.tag,
      baseUrl: args.baseUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const existing = await ctx.db
      .query("providerSecrets")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("providerId", args.providerId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
