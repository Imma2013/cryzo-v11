import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireOwner(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const authUserId = await getAuthUserId(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (!authUserId || !conversation || conversation.userId !== authUserId) {
    throw new Error("Conversation not found");
  }
  return { authUserId, conversation };
}

export const getCryzoTarget = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { authUserId } = await requireOwner(ctx, args.conversationId);
    return await ctx.db
      .query("publishTargets")
      .withIndex("by_user_conversation_provider", (q) =>
        q
          .eq("userId", authUserId)
          .eq("conversationId", args.conversationId)
          .eq("provider", "cryzo"),
      )
      .unique();
  },
});

export const findCryzoSlug = query({
  args: {
    conversationId: v.id("conversations"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.conversationId);
    const existing = await ctx.db
      .query("publishTargets")
      .withIndex("by_provider_slug", (q) =>
        q.eq("provider", "cryzo").eq("slug", args.slug),
      )
      .first();

    return {
      available: !existing || existing.conversationId === args.conversationId,
      sameConversation: existing?.conversationId === args.conversationId,
    };
  },
});

export const upsertCryzoTarget = mutation({
  args: {
    conversationId: v.id("conversations"),
    targetId: v.string(),
    slug: v.string(),
    url: v.string(),
    deploymentId: v.optional(v.string()),
    customDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authUserId } = await requireOwner(ctx, args.conversationId);

    const slugOwner = await ctx.db
      .query("publishTargets")
      .withIndex("by_provider_slug", (q) =>
        q.eq("provider", "cryzo").eq("slug", args.slug),
      )
      .first();
    if (slugOwner && slugOwner.conversationId !== args.conversationId) {
      throw new Error("That Cryzo URL is already taken");
    }

    const existing = await ctx.db
      .query("publishTargets")
      .withIndex("by_user_conversation_provider", (q) =>
        q
          .eq("userId", authUserId)
          .eq("conversationId", args.conversationId)
          .eq("provider", "cryzo"),
      )
      .unique();

    const now = Date.now();
    const patch = {
      targetId: args.targetId,
      slug: args.slug,
      url: args.url,
      deploymentId: args.deploymentId,
      customDomain: args.customDomain,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("publishTargets", {
      userId: authUserId,
      conversationId: args.conversationId,
      provider: "cryzo",
      ...patch,
      createdAt: now,
    });
  },
});
