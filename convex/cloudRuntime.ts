import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const DATABASE_OPERATION_CREDITS = 1;

const operationValidator = v.union(
  v.literal("list"),
  v.literal("get"),
  v.literal("create"),
  v.literal("update"),
  v.literal("delete"),
);

export const getAppInternal = internalQuery({
  args: { appId: v.id("cloudApps") },
  handler: async (ctx, args) => await ctx.db.get(args.appId),
});

export const getSchemaInternal = internalQuery({
  args: { appId: v.id("cloudApps"), entityName: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("cloudEntitySchemas")
      .withIndex("by_app_name", (q) =>
        q.eq("appId", args.appId).eq("name", args.entityName),
      )
      .unique(),
});

export const getSessionContextInternal = internalQuery({
  args: {
    appId: v.id("cloudApps"),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.sessionToken) return null;
    const session = await ctx.db
      .query("cloudSessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken!))
      .unique();
    if (!session || session.appId !== args.appId || session.expiresAt <= Date.now()) {
      return null;
    }
    const user = await ctx.db.get(session.appUserId);
    if (!user || user.appId !== args.appId) return null;
    return {
      sessionId: session._id,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  },
});

export const listRecordsInternal = internalQuery({
  args: {
    appId: v.id("cloudApps"),
    entityName: v.string(),
    ownerAppUserId: v.optional(v.id("cloudAppUsers")),
    privateOnly: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.privateOnly && args.ownerAppUserId) {
      return await ctx.db
        .query("cloudRecords")
        .withIndex("by_app_entity_owner", (q) =>
          q
            .eq("appId", args.appId)
            .eq("entityName", args.entityName)
            .eq("ownerAppUserId", args.ownerAppUserId),
        )
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("cloudRecords")
      .withIndex("by_app_entity", (q) =>
        q.eq("appId", args.appId).eq("entityName", args.entityName),
      )
      .order("desc")
      .take(100);
  },
});

export const getRecordInternal = internalQuery({
  args: { recordId: v.id("cloudRecords") },
  handler: async (ctx, args) => await ctx.db.get(args.recordId),
});

export const createRecordInternal = internalMutation({
  args: {
    appId: v.id("cloudApps"),
    entityName: v.string(),
    ownerAppUserId: v.optional(v.id("cloudAppUsers")),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("cloudRecords", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const updateRecordInternal = internalMutation({
  args: { recordId: v.id("cloudRecords"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recordId, { data: args.data, updatedAt: Date.now() });
    return await ctx.db.get(args.recordId);
  },
});

export const deleteRecordInternal = internalMutation({
  args: { recordId: v.id("cloudRecords") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.recordId);
    return { success: true };
  },
});

export const logUsageInternal = internalMutation({
  args: {
    appId: v.id("cloudApps"),
    ownerUserId: v.id("users"),
    category: v.union(
      v.literal("database"),
      v.literal("auth"),
      v.literal("storage"),
      v.literal("function"),
      v.literal("integration"),
    ),
    operation: v.string(),
    credits: v.number(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("cloudUsageEvents", { ...args, createdAt: Date.now() }),
});

function publicRecord(record: any) {
  return record
    ? {
        id: record._id,
        ...record.data,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    : null;
}

function canTouchRecord(
  record: any,
  session: { user: { id: Id<"cloudAppUsers">; role: "user" | "admin" } } | null,
) {
  if (!session) return false;
  return session.user.role === "admin" || record.ownerAppUserId === session.user.id;
}

export const database = action({
  args: {
    appId: v.id("cloudApps"),
    operation: operationValidator,
    entityName: v.string(),
    recordId: v.optional(v.id("cloudRecords")),
    data: v.optional(v.any()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const app = await ctx.runQuery(internal.cloudRuntime.getAppInternal, {
      appId: args.appId,
    });
    if (!app) throw new Error("Cryzo Cloud app not found");

    const schema = await ctx.runQuery(internal.cloudRuntime.getSchemaInternal, {
      appId: args.appId,
      entityName: args.entityName,
    });
    if (!schema) throw new Error(`Unknown entity: ${args.entityName}`);

    const session = await ctx.runQuery(
      internal.cloudRuntime.getSessionContextInternal,
      { appId: args.appId, sessionToken: args.sessionToken },
    );
    const isRead = args.operation === "list" || args.operation === "get";
    if (schema.access === "private" && !session) {
      throw new Error("Authentication required");
    }
    if (!isRead && schema.access !== "public" && !session) {
      throw new Error("Authentication required");
    }

    const hasCredits = await ctx.runQuery(api.billing.hasIntegrationCredits, {
      userId: app.ownerUserId,
      amount: DATABASE_OPERATION_CREDITS,
    });
    if (!hasCredits) throw new Error("This app has no integration credits remaining");

    let result: any;
    if (args.operation === "list") {
      const rows = await ctx.runQuery(internal.cloudRuntime.listRecordsInternal, {
        appId: args.appId,
        entityName: args.entityName,
        ownerAppUserId: session?.user.id,
        privateOnly: schema.access === "private" && session?.user.role !== "admin",
      });
      result = rows.map(publicRecord);
    } else if (args.operation === "get") {
      if (!args.recordId) throw new Error("recordId is required");
      const record = await ctx.runQuery(internal.cloudRuntime.getRecordInternal, {
        recordId: args.recordId,
      });
      if (!record || record.appId !== args.appId || record.entityName !== args.entityName) {
        throw new Error("Record not found");
      }
      if (schema.access === "private" && !canTouchRecord(record, session as any)) {
        throw new Error("Record not found");
      }
      result = publicRecord(record);
    } else if (args.operation === "create") {
      if (args.data === undefined) throw new Error("data is required");
      const record = await ctx.runMutation(internal.cloudRuntime.createRecordInternal, {
        appId: args.appId,
        entityName: args.entityName,
        ownerAppUserId: session?.user.id,
        data: args.data,
      });
      result = publicRecord(record);
    } else if (args.operation === "update") {
      if (!args.recordId || args.data === undefined) {
        throw new Error("recordId and data are required");
      }
      const existing = await ctx.runQuery(internal.cloudRuntime.getRecordInternal, {
        recordId: args.recordId,
      });
      if (!existing || existing.appId !== args.appId || existing.entityName !== args.entityName) {
        throw new Error("Record not found");
      }
      if (!canTouchRecord(existing, session as any)) throw new Error("Forbidden");
      const record = await ctx.runMutation(internal.cloudRuntime.updateRecordInternal, {
        recordId: args.recordId,
        data: { ...existing.data, ...args.data },
      });
      result = publicRecord(record);
    } else {
      if (!args.recordId) throw new Error("recordId is required");
      const existing = await ctx.runQuery(internal.cloudRuntime.getRecordInternal, {
        recordId: args.recordId,
      });
      if (!existing || existing.appId !== args.appId || existing.entityName !== args.entityName) {
        throw new Error("Record not found");
      }
      if (!canTouchRecord(existing, session as any)) throw new Error("Forbidden");
      result = await ctx.runMutation(internal.cloudRuntime.deleteRecordInternal, {
        recordId: args.recordId,
      });
    }

    await ctx.runMutation(api.billing.deductIntegrationCredits, {
      userId: app.ownerUserId,
      amount: DATABASE_OPERATION_CREDITS,
      reason: "cloud_database",
      description: `${args.entityName}.${args.operation}`,
      toolName: `cloud.database.${args.operation}`,
    });
    await ctx.runMutation(internal.cloudRuntime.logUsageInternal, {
      appId: args.appId,
      ownerUserId: app.ownerUserId,
      category: "database",
      operation: args.operation,
      credits: DATABASE_OPERATION_CREDITS,
      detail: args.entityName,
    });

    return result;
  },
});
