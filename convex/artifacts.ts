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

type ArtifactActionInput = {
  type: "file" | "shell" | "start" | "supabase";
  filePath?: string;
  operation?: "migration" | "query";
  content: string;
};

type CloudEntityInput = {
  name: string;
  fields?: unknown;
  access?: "private" | "public-read" | "public";
};

function parseJsonResource(path: string, content: string) {
  try {
    return JSON.parse(content) as any;
  } catch {
    throw new Error(`Invalid Cryzo Cloud resource JSON: ${path}`);
  }
}

function accessValue(value: unknown): CloudEntityInput["access"] {
  return value === "private" || value === "public-read" || value === "public"
    ? value
    : undefined;
}

function cloudResourcesFromActions(actions: ArtifactActionInput[]) {
  let name: string | undefined;
  const entities = new Map<string, CloudEntityInput>();
  const authProviders = new Set<"password" | "google">();

  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;
    const path = action.filePath.replace(/^\/+/, "");
    const lower = path.toLowerCase();
    const isCloudResource =
      lower === "cryzo/cloud.json" ||
      lower === "cryzo/auth/config.json" ||
      /^cryzo\/entities\/[^/]+\.json$/i.test(path);
    if (!isCloudResource) continue;

    const json = parseJsonResource(path, action.content);
    if (lower === "cryzo/cloud.json") {
      if (typeof json.name === "string" && json.name.trim()) name = json.name.trim();
      for (const provider of json.auth?.providers || []) {
        if (provider === "password" || provider === "google") authProviders.add(provider);
      }
      for (const entity of json.entities || []) {
        if (!entity || typeof entity.name !== "string" || !entity.name.trim()) continue;
        const entityName = entity.name.trim();
        entities.set(entityName, {
          name: entityName,
          fields: entity.fields,
          access: accessValue(entity.access),
        });
      }
      continue;
    }

    if (lower === "cryzo/auth/config.json") {
      for (const provider of json.providers || []) {
        if (provider === "password" || provider === "google") authProviders.add(provider);
      }
      continue;
    }

    const fallbackName = path.split("/").pop()!.replace(/\.json$/i, "");
    const entityName =
      typeof json.name === "string" && json.name.trim()
        ? json.name.trim()
        : fallbackName;
    entities.set(entityName, {
      name: entityName,
      fields: json.fields,
      access: accessValue(json.access),
    });
  }

  return { name, entities: [...entities.values()], authProviders: [...authProviders] };
}

async function applyCloudResources(
  ctx: MutationCtx,
  conversation: { _id: Id<"conversations">; userId: Id<"users">; title: string },
  actions: ArtifactActionInput[],
) {
  const resources = cloudResourcesFromActions(actions);
  if (!resources.entities.length && !resources.authProviders.length && !resources.name) return;

  const now = Date.now();
  let app = await ctx.db
    .query("cloudApps")
    .withIndex("by_owner_conversation", (q) =>
      q.eq("ownerUserId", conversation.userId).eq("conversationId", conversation._id),
    )
    .unique();

  let appId: Id<"cloudApps">;
  if (!app) {
    appId = await ctx.db.insert("cloudApps", {
      ownerUserId: conversation.userId,
      conversationId: conversation._id,
      name: resources.name || conversation.title || `Cryzo app ${String(conversation._id).slice(-6)}`,
      authProviders: resources.authProviders.length ? resources.authProviders : ["password"],
      createdAt: now,
      updatedAt: now,
    });
    app = await ctx.db.get(appId);
  } else {
    appId = app._id;
    await ctx.db.patch(appId, {
      ...(resources.name ? { name: resources.name } : {}),
      ...(resources.authProviders.length ? { authProviders: resources.authProviders } : {}),
      updatedAt: now,
    });
  }

  for (const entity of resources.entities) {
    const existing = await ctx.db
      .query("cloudEntitySchemas")
      .withIndex("by_app_name", (q) => q.eq("appId", appId).eq("name", entity.name))
      .unique();
    const value = {
      appId,
      name: entity.name,
      fields: entity.fields,
      access: entity.access ?? ("private" as const),
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("cloudEntitySchemas", { ...value, createdAt: now });
  }
}

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    artifactId: v.string(),
    title: v.string(),
    actions: v.array(
      v.object({
        type: v.union(
          v.literal("file"),
          v.literal("shell"),
          v.literal("start"),
          v.literal("supabase"),
        ),
        filePath: v.optional(v.string()),
        operation: v.optional(v.union(v.literal("migration"), v.literal("query"))),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const conversation = await requireOwnedConversation(ctx, args.conversationId);

    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("artifactId"), args.artifactId))
      .first();

    if (existing) return existing._id;

    await applyCloudResources(ctx, conversation, args.actions as ArtifactActionInput[]);

    return await ctx.db.insert("artifacts", {
      conversationId: args.conversationId,
      artifactId: args.artifactId,
      title: args.title,
      actions: args.actions,
      createdAt: Date.now(),
    });
  },
});

export const saveManualFile = mutation({
  args: {
    conversationId: v.id("conversations"),
    artifactId: v.string(),
    filePath: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await requireOwnedConversation(ctx, args.conversationId);
    const path = args.filePath.trim();
    if (!path || path.includes("..") || path.startsWith("/")) {
      throw new Error("Invalid project file path");
    }

    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("artifactId"), args.artifactId))
      .first();
    if (existing) return existing._id;

    const actions: ArtifactActionInput[] = [
      {
        type: "file",
        filePath: path,
        content: args.content,
      },
    ];
    await applyCloudResources(ctx, conversation, actions);

    return await ctx.db.insert("artifacts", {
      conversationId: args.conversationId,
      artifactId: args.artifactId,
      title: `Manual edit: ${path}`,
      actions,
      createdAt: Date.now(),
    });
  },
});

export const listByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getOwnedConversation(ctx, args.conversationId);
    if (!conversation) return [];

    return await ctx.db
      .query("artifacts")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});
