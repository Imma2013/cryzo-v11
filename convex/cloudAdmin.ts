import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const accessValidator = v.union(
  v.literal("private"),
  v.literal("public-read"),
  v.literal("public"),
);

async function requireOwnedConversation(ctx: any, conversationId: any) {
  const userId = await getAuthUserId(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (!userId || !conversation || conversation.userId !== userId) {
    throw new Error("Conversation not found");
  }
  return { userId, conversation };
}

export const configureFromPublish = mutation({
  args: {
    conversationId: v.id("conversations"),
    name: v.string(),
    entities: v.array(
      v.object({
        name: v.string(),
        fields: v.optional(v.any()),
        access: v.optional(accessValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnedConversation(ctx, args.conversationId);
    const now = Date.now();
    let app = await ctx.db
      .query("cloudApps")
      .withIndex("by_owner_conversation", (q) =>
        q.eq("ownerUserId", userId).eq("conversationId", args.conversationId),
      )
      .unique();

    let appId;
    if (!app) {
      appId = await ctx.db.insert("cloudApps", {
        ownerUserId: userId,
        conversationId: args.conversationId,
        name: args.name,
        createdAt: now,
        updatedAt: now,
      });
      app = await ctx.db.get(appId);
    } else {
      appId = app._id;
      await ctx.db.patch(appId, { name: args.name, updatedAt: now });
    }

    for (const entity of args.entities) {
      const name = entity.name.trim();
      if (!name) continue;
      const existing = await ctx.db
        .query("cloudEntitySchemas")
        .withIndex("by_app_name", (q) => q.eq("appId", appId).eq("name", name))
        .unique();
      const value = {
        appId,
        name,
        fields: entity.fields,
        access: entity.access ?? ("private" as const),
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, value);
      else await ctx.db.insert("cloudEntitySchemas", { ...value, createdAt: now });
    }

    return {
      appId,
      name: args.name,
      entitiesConfigured: args.entities.length,
    };
  },
});

export const ensureForConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnedConversation(ctx, args.conversationId);
    const existing = await ctx.db
      .query("cloudApps")
      .withIndex("by_owner_conversation", (q) =>
        q.eq("ownerUserId", userId).eq("conversationId", args.conversationId),
      )
      .unique();
    if (existing) return { appId: existing._id, name: existing.name };
    const now = Date.now();
    const appId = await ctx.db.insert("cloudApps", {
      ownerUserId: userId,
      conversationId: args.conversationId,
      name: args.name,
      createdAt: now,
      updatedAt: now,
    });
    return { appId, name: args.name };
  },
});

export const getOverview = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnedConversation(ctx, args.conversationId);
    const app = await ctx.db
      .query("cloudApps")
      .withIndex("by_owner_conversation", (q) =>
        q.eq("ownerUserId", userId).eq("conversationId", args.conversationId),
      )
      .unique();
    if (!app) {
      return { app: null, entities: [], users: [], usage: [] };
    }

    const entities = await ctx.db
      .query("cloudEntitySchemas")
      .withIndex("by_app_name", (q) => q.eq("appId", app._id))
      .collect();
    const users = await ctx.db
      .query("cloudAppUsers")
      .withIndex("by_app", (q) => q.eq("appId", app._id))
      .order("desc")
      .take(100);
    const usage = await ctx.db
      .query("cloudUsageEvents")
      .withIndex("by_app", (q) => q.eq("appId", app._id))
      .order("desc")
      .take(60);

    const entityRows = await Promise.all(
      entities.map(async (entity) => {
        const records = await ctx.db
          .query("cloudRecords")
          .withIndex("by_app_entity", (q) =>
            q.eq("appId", app._id).eq("entityName", entity.name),
          )
          .order("desc")
          .take(100);
        return { ...entity, recordCount: records.length };
      }),
    );

    return {
      app,
      entities: entityRows,
      users: users.map(({ passwordHash, passwordSalt, ...user }) => user),
      usage,
    };
  },
});

export const listRecords = query({
  args: {
    conversationId: v.id("conversations"),
    entityName: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnedConversation(ctx, args.conversationId);
    const app = await ctx.db
      .query("cloudApps")
      .withIndex("by_owner_conversation", (q) =>
        q.eq("ownerUserId", userId).eq("conversationId", args.conversationId),
      )
      .unique();
    if (!app) return [];
    return await ctx.db
      .query("cloudRecords")
      .withIndex("by_app_entity", (q) =>
        q.eq("appId", app._id).eq("entityName", args.entityName),
      )
      .order("desc")
      .take(100);
  },
});
