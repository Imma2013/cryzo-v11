import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function getOwnedConversation(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const authUserId = await getAuthUserId(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (!authUserId || !conversation || conversation.userId !== authUserId) {
    return null;
  }
  return conversation;
}

async function requireOwnedConversation(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  const conversation = await getOwnedConversation(ctx, conversationId);
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

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
    await requireOwnedConversation(ctx, args.conversationId);

    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .filter((q) => q.eq(q.field("artifactId"), args.artifactId))
      .first();

    if (existing) return existing._id;

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
    const conversation = await getOwnedConversation(ctx, args.conversationId);
    if (!conversation) return [];

    return await ctx.db
      .query("artifacts")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});
