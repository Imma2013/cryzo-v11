import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getUserByEmailInternal = internalQuery({
  args: { appId: v.id("cloudApps"), email: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("cloudAppUsers")
      .withIndex("by_app_email", (q) =>
        q.eq("appId", args.appId).eq("email", args.email.toLowerCase()),
      )
      .unique(),
});

export const createUserInternal = internalMutation({
  args: {
    appId: v.id("cloudApps"),
    email: v.string(),
    name: v.optional(v.string()),
    passwordHash: v.string(),
    passwordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("cloudAppUsers", {
      appId: args.appId,
      email: args.email.toLowerCase(),
      name: args.name,
      role: "user",
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const createSessionInternal = internalMutation({
  args: {
    appId: v.id("cloudApps"),
    appUserId: v.id("cloudAppUsers"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cloudSessions", {
      ...args,
      createdAt: Date.now(),
    });
    return { token: args.token, expiresAt: args.expiresAt };
  },
});

export const deleteSessionInternal = internalMutation({
  args: { appId: v.id("cloudApps"), token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("cloudSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (session && session.appId === args.appId) await ctx.db.delete(session._id);
    return { success: true };
  },
});
