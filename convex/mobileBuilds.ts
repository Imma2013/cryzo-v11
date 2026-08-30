import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listForConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) return [];
    return await ctx.db
      .query("mobileBuilds")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", userId).eq("conversationId", args.conversationId),
      )
      .order("desc")
      .collect();
  },
});

export const upsert = mutation({
  args: {
    conversationId: v.id("conversations"),
    platform: v.union(v.literal("ios"), v.literal("android")),
    expoProjectId: v.optional(v.string()),
    buildId: v.optional(v.string()),
    buildUrl: v.optional(v.string()),
    artifactUrl: v.optional(v.string()),
    status: v.string(),
    appName: v.string(),
    identifier: v.string(),
    webUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    const now = Date.now();
    const existing = args.buildId
      ? await ctx.db
          .query("mobileBuilds")
          .withIndex("by_build_id", (q) => q.eq("buildId", args.buildId))
          .first()
      : null;

    if (existing && existing.userId === userId) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("mobileBuilds", {
      userId,
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});
