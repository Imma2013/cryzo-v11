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

export const list = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getOwnedConversation(ctx, args.conversationId);
    if (!conversation) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    parts: v.optional(v.any()),
    toolCalls: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireOwnedConversation(ctx, args.conversationId);

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      parts: args.parts,
      toolCalls: args.toolCalls,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
  },
});

export const saveAll = mutation({
  args: {
    conversationId: v.id("conversations"),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        parts: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireOwnedConversation(ctx, args.conversationId);

    const existing = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
    for (const msg of existing) {
      await ctx.db.delete(msg._id);
    }
    const now = Date.now();
    for (let i = 0; i < args.messages.length; i++) {
      const msg = args.messages[i];
      await ctx.db.insert("messages", {
        conversationId: args.conversationId,
        role: msg.role,
        content: msg.content,
        parts: msg.parts,
        createdAt: now + i,
      });
    }
    await ctx.db.patch(args.conversationId, { updatedAt: now });
  },
});
