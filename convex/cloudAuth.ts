"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("base64");
}

function publicUser(user: any) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export const signUp = action({
  args: {
    appId: v.id("cloudApps"),
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const app = await ctx.runQuery(internal.cloudRuntime.getAppInternal, {
      appId: args.appId,
    });
    if (!app) throw new Error("Cryzo Cloud app not found");
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) throw new Error("Enter a valid email address");
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters");

    const existing = await ctx.runQuery(internal.cloudAuthStore.getUserByEmailInternal, {
      appId: args.appId,
      email,
    });
    if (existing) throw new Error("An account with this email already exists");

    const salt = randomBytes(16).toString("base64");
    const passwordHash = hashPassword(args.password, salt);
    const user = await ctx.runMutation(internal.cloudAuthStore.createUserInternal, {
      appId: args.appId,
      email,
      name: args.name?.trim() || undefined,
      passwordHash,
      passwordSalt: salt,
    });
    if (!user) throw new Error("Unable to create account");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.runMutation(internal.cloudAuthStore.createSessionInternal, {
      appId: args.appId,
      appUserId: user._id,
      token,
      expiresAt,
    });
    await ctx.runMutation(internal.cloudRuntime.logUsageInternal, {
      appId: args.appId,
      ownerUserId: app.ownerUserId,
      category: "auth",
      operation: "sign_up",
      credits: 0,
      detail: email,
    });

    return { user: publicUser(user), token, expiresAt };
  },
});

export const signIn = action({
  args: {
    appId: v.id("cloudApps"),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const app = await ctx.runQuery(internal.cloudRuntime.getAppInternal, {
      appId: args.appId,
    });
    if (!app) throw new Error("Cryzo Cloud app not found");
    const email = normalizeEmail(args.email);
    const user = await ctx.runQuery(internal.cloudAuthStore.getUserByEmailInternal, {
      appId: args.appId,
      email,
    });
    if (!user) throw new Error("Invalid email or password");

    const candidate = Buffer.from(hashPassword(args.password, user.passwordSalt), "base64");
    const expected = Buffer.from(user.passwordHash, "base64");
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      throw new Error("Invalid email or password");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.runMutation(internal.cloudAuthStore.createSessionInternal, {
      appId: args.appId,
      appUserId: user._id,
      token,
      expiresAt,
    });
    await ctx.runMutation(internal.cloudRuntime.logUsageInternal, {
      appId: args.appId,
      ownerUserId: app.ownerUserId,
      category: "auth",
      operation: "sign_in",
      credits: 0,
      detail: email,
    });

    return { user: publicUser(user), token, expiresAt };
  },
});

export const me = action({
  args: { appId: v.id("cloudApps"), token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(
      internal.cloudRuntime.getSessionContextInternal,
      { appId: args.appId, sessionToken: args.token },
    );
    return session?.user ?? null;
  },
});

export const signOut = action({
  args: { appId: v.id("cloudApps"), token: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.cloudAuthStore.deleteSessionInternal, {
      appId: args.appId,
      token: args.token,
    });
    return { success: true };
  },
});
