import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

async function requireConversation(ctx: any, conversationId: any) {
  const authUserId = await getAuthUserId(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (!authUserId || !conversation || conversation.userId !== authUserId) {
    throw new Error("Conversation not found");
  }
  return conversation;
}

export const getByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await requireConversation(ctx, args.conversationId);
    return await ctx.db
      .query("appBackends")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", conversation.userId).eq("conversationId", args.conversationId),
      )
      .unique();
  },
});

export const upsert = mutation({
  args: {
    conversationId: v.id("conversations"),
    provider: v.literal("convex"),
    projectId: v.number(),
    projectName: v.string(),
    deploymentName: v.string(),
    deploymentUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await requireConversation(ctx, args.conversationId);
    const existing = await ctx.db
      .query("appBackends")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", conversation.userId).eq("conversationId", args.conversationId),
      )
      .unique();
    const now = Date.now();
    const value = {
      userId: conversation.userId,
      conversationId: args.conversationId,
      provider: args.provider,
      projectId: args.projectId,
      projectName: args.projectName,
      deploymentName: args.deploymentName,
      deploymentUrl: args.deploymentUrl,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("appBackends", { ...value, createdAt: now });
  },
});
