import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    artifactId: v.string(),
    title: v.string(),
    actions: v.array(
      v.object({
        type: v.union(v.literal("file"), v.literal("shell"), v.literal("start")),
        filePath: v.optional(v.string()),
        content: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", {
      conversationId: args.conversationId,
      artifactId: args.artifactId,
      title: args.title,
      actions: args.actions,
      createdAt: Date.now(),
    });
  },
});

export const listByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});
