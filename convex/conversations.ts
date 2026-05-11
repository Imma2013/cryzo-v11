import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    userId: v.id("users"),
    chatMode: v.optional(v.union(v.literal("build"), v.literal("plan"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: args.userId,
      title: "New Chat",
      chatMode: args.chatMode,
      composioSessionId: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
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
    return await ctx.db.get(args.id);
  },
});

export const updateTitle = mutation({
  args: { id: v.id("conversations"), title: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title, updatedAt: Date.now() });
  },
});

export const updateChatMode = mutation({
  args: {
    id: v.id("conversations"),
    chatMode: v.union(v.literal("build"), v.literal("plan")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      chatMode: args.chatMode,
      updatedAt: Date.now(),
    });
  },
});

export const updateComposioSession = mutation({
  args: { id: v.id("conversations"), composioSessionId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      composioSessionId: args.composioSessionId,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(args.id);
  },
});
