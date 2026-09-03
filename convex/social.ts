import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const channelValidator = v.union(
  v.literal("x"),
  v.literal("linkedin"),
  v.literal("reddit"),
  v.literal("youtube"),
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("facebook"),
);

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("publishing"),
  v.literal("published"),
  v.literal("failed"),
);

async function currentUserId(ctx: { auth: MutationCtx["auth"] }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to use Social.");
  return userId;
}

async function paidAccess(_ctx: MutationCtx, _userId: Id<"users">) {
  // Social is free during the public beta. Keep this guard centralized so the
  // Starter entitlement can be restored without touching every mutation.
  return true;
}

export const getAccess = query({
  args: {},
  returns: v.object({
    allowed: v.boolean(),
    plan: v.string(),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { allowed: false, plan: "free" };
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return { allowed: true, plan: subscription?.plan ?? "free" };
  },
});

export const listPosts = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const posts = await ctx.db
      .query("socialPosts")
      .withIndex("by_user_and_scheduled", (q) => q.eq("userId", userId))
      .order("desc")
      .take(250);

    return await Promise.all(
      posts.map(async (post) => ({
        ...post,
        mediaUrls: (
          await Promise.all(
            post.mediaStorageIds.map((storageId) => ctx.storage.getUrl(storageId)),
          )
        ).filter((url): url is string => Boolean(url)),
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!(await paidAccess(ctx, userId))) {
      throw new Error("Social Scheduling is unavailable.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const createPost = mutation({
  args: {
    content: v.string(),
    channels: v.array(channelValidator),
    scheduledFor: v.number(),
    status: v.union(v.literal("draft"), v.literal("scheduled")),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("socialPosts"),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!(await paidAccess(ctx, userId))) {
      throw new Error("Social Scheduling is unavailable.");
    }
    const content = args.content.trim();
    if (!content || content.length > 12000) throw new Error("Write a post before scheduling.");
    if (args.channels.length === 0) throw new Error("Choose at least one channel.");

    const now = Date.now();
    const id = await ctx.db.insert("socialPosts", {
      userId,
      content,
      channels: [...new Set(args.channels)],
      scheduledFor: args.scheduledFor,
      status: args.status,
      mediaStorageIds: args.mediaStorageIds ?? [],
      createdAt: now,
      updatedAt: now,
    });

    if (args.status === "scheduled") {
      await ctx.scheduler.runAt(
        Math.max(args.scheduledFor, now + 1000),
        internal.socialWorker.publishPost,
        { postId: id },
      );
    }
    return id;
  },
});

export const publishNow = mutation({
  args: { postId: v.id("socialPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!(await paidAccess(ctx, userId))) {
      throw new Error("Social Scheduling is unavailable.");
    }
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) throw new Error("Post not found.");
    await ctx.db.patch(post._id, {
      status: "scheduled",
      scheduledFor: Date.now(),
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.socialWorker.publishPost, {
      postId: post._id,
    });
    return null;
  },
});

export const removePost = mutation({
  args: { postId: v.id("socialPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) throw new Error("Post not found.");
    if (post.status === "publishing") throw new Error("This post is publishing now.");
    await ctx.db.delete(post._id);
    return null;
  },
});

export const getPostForPublish = internalQuery({
  args: { postId: v.id("socialPosts") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "scheduled") return null;
    const mediaUrls = (
      await Promise.all(
        post.mediaStorageIds.map((storageId) => ctx.storage.getUrl(storageId)),
      )
    ).filter((url): url is string => Boolean(url));
    return { ...post, mediaUrls };
  },
});

export const claimPost = internalMutation({
  args: { postId: v.id("socialPosts") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "scheduled") return false;
    await ctx.db.patch(post._id, {
      status: "publishing",
      error: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const markPublished = internalMutation({
  args: { postId: v.id("socialPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      status: "published",
      publishedAt: Date.now(),
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: { postId: v.id("socialPosts"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      status: "failed",
      error: args.error.slice(0, 1000),
      updatedAt: Date.now(),
    });
    return null;
  },
});
