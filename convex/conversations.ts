import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const projectPlatformValidator = v.union(
  v.literal("web"),
  v.literal("ios"),
  v.literal("android"),
);

async function requireOwner(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const authUserId = await getAuthUserId(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (!authUserId || !conversation || conversation.userId !== authUserId) {
    throw new Error("Conversation not found");
  }
  return conversation;
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    chatMode: v.optional(v.union(v.literal("build"), v.literal("plan"))),
    projectPlatforms: v.optional(v.array(projectPlatformValidator)),
    modelProvider: v.optional(v.string()),
    modelId: v.optional(v.string()),
    modelCredentialMode: v.optional(
      v.union(v.literal("cryzo"), v.literal("device"), v.literal("account")),
    ),
    modelBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId || authUserId !== args.userId) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: args.userId,
      title: "New Chat",
      chatMode: args.chatMode,
      projectPlatforms:
        args.projectPlatforms && args.projectPlatforms.length > 0
          ? args.projectPlatforms
          : ["web"],
      composioSessionId: null,
      modelProvider: args.modelProvider || "cryzo",
      modelId: args.modelId || "cryzo/minimax-m3",
      modelCredentialMode: args.modelCredentialMode || "cryzo",
      modelBaseUrl: args.modelBaseUrl?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId || authUserId !== args.userId) return [];

    return await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    const conversation = await ctx.db.get(args.id);
    if (!authUserId || !conversation || conversation.userId !== authUserId) {
      return null;
    }
    return conversation;
  },
});

export const getProjectPlatformsForChat = query({
  args: {
    id: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.id);
    if (!conversation || conversation.userId !== args.userId) return null;
    return conversation.projectPlatforms || ["web"];
  },
});

export const updateTitle = mutation({
  args: { id: v.id("conversations"), title: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.id);
    await ctx.db.patch(args.id, { title: args.title, updatedAt: Date.now() });
  },
});

export const updateChatMode = mutation({
  args: {
    id: v.id("conversations"),
    chatMode: v.union(v.literal("build"), v.literal("plan")),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.id);
    await ctx.db.patch(args.id, {
      chatMode: args.chatMode,
      updatedAt: Date.now(),
    });
  },
});

export const updateProjectPlatforms = mutation({
  args: {
    id: v.id("conversations"),
    projectPlatforms: v.array(projectPlatformValidator),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.id);
    const normalized = args.projectPlatforms.includes("web")
      ? ["web" as const]
      : args.projectPlatforms.length > 0
        ? args.projectPlatforms
        : ["web" as const];
    await ctx.db.patch(args.id, {
      projectPlatforms: normalized,
      updatedAt: Date.now(),
    });
  },
});

export const updateModel = mutation({
  args: {
    id: v.id("conversations"),
    providerId: v.string(),
    modelId: v.string(),
    credentialMode: v.union(
      v.literal("cryzo"),
      v.literal("device"),
      v.literal("account"),
    ),
    baseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.id);
    await ctx.db.patch(args.id, {
      modelProvider: args.providerId,
      modelId: args.modelId,
      modelCredentialMode: args.credentialMode,
      modelBaseUrl: args.baseUrl?.trim() || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const updateComposioSession = mutation({
  args: { id: v.id("conversations"), composioSessionId: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.id);
    await ctx.db.patch(args.id, {
      composioSessionId: args.composioSessionId,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await requireOwner(ctx, args.id);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.id))
      .collect();
    for (const artifact of artifacts) {
      await ctx.db.delete(artifact._id);
    }

    const publishTargets = await ctx.db
      .query("publishTargets")
      .withIndex("by_user_conversation_provider", (q) =>
        q.eq("userId", conversation.userId).eq("conversationId", args.id),
      )
      .collect();
    for (const target of publishTargets) {
      await ctx.db.delete(target._id);
    }

    await ctx.db.delete(args.id);
  },
});
