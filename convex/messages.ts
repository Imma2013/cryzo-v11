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
        q.eq("conversationId", args.conversationId),
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
        clientMessageId: v.optional(v.string()),
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        parts: v.optional(v.any()),
        partsJson: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireOwnedConversation(ctx, args.conversationId);

    // Older open tabs still submit the original ID-less history snapshot.
    // Preserve that protocol until a modern client/server job has adopted IDs.
    if (args.messages.some(message => !message.clientMessageId)) {
      const page = await ctx.db.query("messages").withIndex("by_conversation",q=>q.eq("conversationId",args.conversationId)).order("asc").paginate({cursor:null,numItems:1000,maximumBytesRead:7000000});
      if(page.page.some(message=>message.clientMessageId))return;
      if(!page.isDone||args.messages.length>1000)throw new Error("Reload this chat to save the latest history.");
      for(const message of page.page)await ctx.db.delete(message._id);
      const now=Date.now();
      for(const [index,message] of args.messages.entries())await ctx.db.insert("messages",{conversationId:args.conversationId,...message,createdAt:now+index});
      await ctx.db.patch(args.conversationId,{updatedAt:now});return;
    }
    const now = Date.now();
    // Merge by stable client ID. A suspended tab must not erase a newer server answer.
    for (let i = 0; i < args.messages.length; i++) {
      const msg = args.messages[i];
      let prior = msg.clientMessageId
        ? await ctx.db
            .query("messages")
            .withIndex("by_conversation_client", (q) =>
              q
                .eq("conversationId", args.conversationId)
                .eq("clientMessageId", msg.clientMessageId),
            )
            .first()
        : null;
      if (!prior && msg.clientMessageId) {
        const legacyId = ctx.db.normalizeId("messages", msg.clientMessageId);
        const legacy = legacyId ? await ctx.db.get(legacyId) : null;
        if (legacy?.conversationId === args.conversationId && !legacy.clientMessageId) prior = legacy;
      }
      if (prior) {
        if (msg.content.length >= prior.content.length)
          await ctx.db.patch(prior._id, msg);
      } else
        await ctx.db.insert("messages", {
          conversationId: args.conversationId,
          ...msg,
          createdAt: now + i,
        });
    }
    await ctx.db.patch(args.conversationId, { updatedAt: now });
  },
});
