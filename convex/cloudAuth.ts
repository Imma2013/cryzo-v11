"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const internalApi = internal as any;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("base64");
}

function normalizeOrigin(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Invalid application origin");
  }
  return parsed.origin;
}

function publicUser(user: any) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    authProvider: user.authProvider || (user.passwordHash ? "password" : undefined),
    createdAt: user.createdAt,
  };
}

function enabledProviders(app: any): string[] {
  return Array.isArray(app?.authProviders) && app.authProviders.length
    ? app.authProviders
    : ["password"];
}

async function createSession(ctx: any, appId: any, appUserId: any) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await ctx.runMutation(internalApi.cloudAuthStore.createSessionInternal, {
    appId,
    appUserId,
    token,
    expiresAt,
  });
  return { token, expiresAt };
}

async function googleSessionFromIdToken(ctx: any, appId: any, idToken: string) {
  const app = await ctx.runQuery(internalApi.cloudRuntime.getAppInternal, { appId });
  if (!app) throw new Error("Cryzo Cloud app not found");
  if (!enabledProviders(app).includes("google")) {
    throw new Error("Google authentication is not enabled for this app");
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) throw new Error("Google authentication is not configured on Cryzo");
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!response.ok) throw new Error("Google identity token is invalid");
  const identity = (await response.json()) as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
  };
  const verified = identity.email_verified === true || identity.email_verified === "true";
  if (identity.aud !== clientId || !identity.sub || !identity.email || !verified) {
    throw new Error("Google identity could not be verified");
  }

  const email = normalizeEmail(identity.email);
  const user = await ctx.runMutation(internalApi.cloudAuthStore.upsertGoogleUserInternal, {
    appId,
    email,
    name: identity.name?.trim() || undefined,
    providerSubject: identity.sub,
  });
  if (!user) throw new Error("Unable to create Google account");

  const session = await createSession(ctx, appId, user._id);
  await ctx.runMutation(internalApi.cloudRuntime.logUsageInternal, {
    appId,
    ownerUserId: app.ownerUserId,
    category: "auth",
    operation: "sign_in_google",
    credits: 0,
    detail: email,
  });

  return { user: publicUser(user), ...session };
}

export const signUp = action({
  args: {
    appId: v.id("cloudApps"),
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const app = await ctx.runQuery(internalApi.cloudRuntime.getAppInternal, {
      appId: args.appId,
    });
    if (!app) throw new Error("Cryzo Cloud app not found");
    if (!enabledProviders(app).includes("password")) {
      throw new Error("Password authentication is not enabled for this app");
    }
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) throw new Error("Enter a valid email address");
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters");

    const existing = await ctx.runQuery(internalApi.cloudAuthStore.getUserByEmailInternal, {
      appId: args.appId,
      email,
    });
    if (existing) throw new Error("An account with this email already exists");

    const salt = randomBytes(16).toString("base64");
    const passwordHash = hashPassword(args.password, salt);
    const user = await ctx.runMutation(internalApi.cloudAuthStore.createUserInternal, {
      appId: args.appId,
      email,
      name: args.name?.trim() || undefined,
      passwordHash,
      passwordSalt: salt,
    });
    if (!user) throw new Error("Unable to create account");

    const session = await createSession(ctx, args.appId, user._id);
    await ctx.runMutation(internalApi.cloudRuntime.logUsageInternal, {
      appId: args.appId,
      ownerUserId: app.ownerUserId,
      category: "auth",
      operation: "sign_up",
      credits: 0,
      detail: email,
    });

    return { user: publicUser(user), ...session };
  },
});

export const signIn = action({
  args: {
    appId: v.id("cloudApps"),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const app = await ctx.runQuery(internalApi.cloudRuntime.getAppInternal, {
      appId: args.appId,
    });
    if (!app) throw new Error("Cryzo Cloud app not found");
    if (!enabledProviders(app).includes("password")) {
      throw new Error("Password authentication is not enabled for this app");
    }
    const email = normalizeEmail(args.email);
    const user = await ctx.runQuery(internalApi.cloudAuthStore.getUserByEmailInternal, {
      appId: args.appId,
      email,
    });
    if (!user?.passwordSalt || !user?.passwordHash) throw new Error("Invalid email or password");

    const candidate = Buffer.from(hashPassword(args.password, user.passwordSalt), "base64");
    const expected = Buffer.from(user.passwordHash, "base64");
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      throw new Error("Invalid email or password");
    }

    const session = await createSession(ctx, args.appId, user._id);
    await ctx.runMutation(internalApi.cloudRuntime.logUsageInternal, {
      appId: args.appId,
      ownerUserId: app.ownerUserId,
      category: "auth",
      operation: "sign_in",
      credits: 0,
      detail: email,
    });

    return { user: publicUser(user), ...session };
  },
});

export const googleOAuthClientId = action({
  args: {},
  handler: async () => {
    const clientId = process.env.AUTH_GOOGLE_ID;
    if (!clientId) throw new Error("Google authentication is not configured on Cryzo");
    return { clientId };
  },
});

export const validateGoogleReturnOrigin = action({
  args: {
    appId: v.id("cloudApps"),
    origin: v.string(),
  },
  handler: async (ctx, args) => {
    const origin = normalizeOrigin(args.origin);
    const app = await ctx.runQuery(internalApi.cloudRuntime.getAppInternal, {
      appId: args.appId,
    });
    if (!app) throw new Error("Cryzo Cloud app not found");
    if (!enabledProviders(app).includes("google")) {
      throw new Error("Google authentication is not enabled for this app");
    }
    const allowedOrigins = await ctx.runQuery(
      internalApi.cloudRuntime.getPublishedOriginsInternal,
      { appId: args.appId },
    );
    return { allowed: allowedOrigins.includes(origin) };
  },
});

export const exchangeGoogleCode = action({
  args: {
    appId: v.id("cloudApps"),
    code: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.AUTH_GOOGLE_ID;
    const clientSecret = process.env.AUTH_GOOGLE_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Google authentication is not configured on Cryzo");
    }
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: args.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: args.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenResponse.json()) as {
      id_token?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokenData.id_token) {
      throw new Error(tokenData.error_description || "Google token exchange failed");
    }
    return await googleSessionFromIdToken(ctx, args.appId, tokenData.id_token);
  },
});

export const signInGoogle = action({
  args: {
    appId: v.id("cloudApps"),
    idToken: v.string(),
  },
  handler: async (ctx, args) => await googleSessionFromIdToken(ctx, args.appId, args.idToken),
});

export const me = action({
  args: { appId: v.id("cloudApps"), token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(
      internalApi.cloudRuntime.getSessionContextInternal,
      { appId: args.appId, sessionToken: args.token },
    );
    return session?.user ?? null;
  },
});

export const signOut = action({
  args: { appId: v.id("cloudApps"), token: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internalApi.cloudAuthStore.deleteSessionInternal, {
      appId: args.appId,
      token: args.token,
    });
    return { success: true };
  },
});
