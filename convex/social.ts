import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const OWNER_EMAIL = "lloyd.ebnchenge@gmail.com";
const FREE_MONTHLY_POSTS = 10;
const FREE_CHANNELS_PER_POST = 1;

const channelValidator = v.union(
  v.literal("x"),
  v.literal("linkedin"),
  v.literal("reddit"),
  v.literal("youtube"),
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("facebook"),
);

const platformOptionsValidator = v.object({
  redditCommunity: v.optional(v.string()),
  youtubeTitle: v.optional(v.string()),
  tiktokPrivacy: v.optional(v.string()),
});

type Channel = Doc<"socialDeliveries">["channel"];
type SocialContext = QueryCtx | MutationCtx;

function startOfMonth(now: number) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

async function currentUserId(ctx: { auth: MutationCtx["auth"] }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to use Social.");
  return userId;
}

async function socialAccess(
  ctx: SocialContext,
  userId: Id<"users">,
  now: number,
) {
  const [user, subscription] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  ]);
  const owner = user?.email?.trim().toLowerCase() === OWNER_EMAIL;
  const paid =
    owner ||
    Boolean(
      subscription &&
        subscription.plan !== "free" &&
        subscription.status === "active",
    );
  const postsThisMonth = await ctx.db
    .query("socialPosts")
    .withIndex("by_user_and_created", (q) =>
      q.eq("userId", userId).gte("createdAt", startOfMonth(now)),
    )
    .take(FREE_MONTHLY_POSTS + 1);

  return {
    plan: owner ? "owner" : (subscription?.plan ?? "free"),
    postsUsed: postsThisMonth.length,
    monthlyPostLimit: paid ? null : FREE_MONTHLY_POSTS,
    maxChannelsPerPost: paid ? null : FREE_CHANNELS_PER_POST,
    paid,
  };
}

async function assertCanCreate(
  ctx: MutationCtx,
  userId: Id<"users">,
  channels: Channel[],
) {
  const access = await socialAccess(ctx, userId, Date.now());
  if (!access.paid && channels.length > FREE_CHANNELS_PER_POST) {
    throw new Error(
      "The free Social plan supports one network per post. Starter supports multi-network publishing.",
    );
  }
  if (!access.paid && access.postsUsed >= FREE_MONTHLY_POSTS) {
    throw new Error(
      "You have used this month's 10 free Social posts. Upgrade to Starter for unlimited posts.",
    );
  }
}

async function deliveriesForPost(
  ctx: SocialContext,
  postId: Id<"socialPosts">,
) {
  return await ctx.db
    .query("socialDeliveries")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .take(10);
}

async function ensureDeliveries(ctx: MutationCtx, post: Doc<"socialPosts">) {
  const existing = await deliveriesForPost(ctx, post._id);
  const existingChannels = new Set(
    existing.map((delivery) => delivery.channel),
  );
  const now = Date.now();
  for (const channel of post.channels) {
    if (existingChannels.has(channel)) continue;
    await ctx.db.insert("socialDeliveries", {
      postId: post._id,
      userId: post.userId,
      channel,
      status: post.status === "draft" ? "draft" : "pending",
      idempotencyKey: `${post._id}:${channel}`,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  return await deliveriesForPost(ctx, post._id);
}

async function refreshPostStatus(
  ctx: MutationCtx,
  postId: Id<"socialPosts">,
) {
  const deliveries = await deliveriesForPost(ctx, postId);
  if (deliveries.length === 0) return;
  const now = Date.now();
  if (deliveries.every((delivery) => delivery.status === "published")) {
    await ctx.db.patch(postId, {
      status: "published",
      publishedAt: now,
      error: undefined,
      updatedAt: now,
    });
    return;
  }
  if (
    deliveries.some(
      (delivery) =>
        delivery.status === "pending" || delivery.status === "publishing",
    )
  ) {
    await ctx.db.patch(postId, { status: "publishing", updatedAt: now });
    return;
  }
  const failed = deliveries.filter(
    (delivery) => delivery.status === "failed",
  ).length;
  const unknown = deliveries.filter(
    (delivery) => delivery.status === "unknown",
  ).length;
  const published = deliveries.filter(
    (delivery) => delivery.status === "published",
  ).length;
  await ctx.db.patch(postId, {
    status: "failed",
    error:
      unknown > 0
        ? `${unknown} network delivery result${unknown === 1 ? " is" : "s are"} unknown. Review before retrying to avoid a duplicate post.`
        : `${failed} network delivery${failed === 1 ? "" : "ies"} failed; ${published} published.`,
    updatedAt: now,
  });
}

export const getAccess = query({
  args: { now: v.number() },
  returns: v.object({
    allowed: v.boolean(),
    plan: v.string(),
    postsUsed: v.number(),
    monthlyPostLimit: v.union(v.number(), v.null()),
    maxChannelsPerPost: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        allowed: false,
        plan: "free",
        postsUsed: 0,
        monthlyPostLimit: FREE_MONTHLY_POSTS,
        maxChannelsPerPost: FREE_CHANNELS_PER_POST,
      };
    }
    const access = await socialAccess(ctx, userId, args.now);
    return {
      allowed: true,
      plan: access.plan,
      postsUsed: access.postsUsed,
      monthlyPostLimit: access.monthlyPostLimit,
      maxChannelsPerPost: access.maxChannelsPerPost,
    };
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
        deliveries: await deliveriesForPost(ctx, post._id),
        mediaUrls: (
          await Promise.all(
            post.mediaStorageIds.map((storageId) =>
              ctx.storage.getUrl(storageId),
            ),
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
    await currentUserId(ctx);
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
    platformOptions: v.optional(platformOptionsValidator),
  },
  returns: v.id("socialPosts"),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    const channels = [...new Set(args.channels)];
    await assertCanCreate(ctx, userId, channels);
    const content = args.content.trim();
    if (!content || content.length > 12000) {
      throw new Error("Write a post before scheduling.");
    }
    if (channels.length === 0) {
      throw new Error("Choose at least one channel.");
    }
    if (
      channels.includes("reddit") &&
      !args.platformOptions?.redditCommunity?.trim()
    ) {
      throw new Error("Choose a Reddit community before scheduling.");
    }
    if (
      (channels.includes("youtube") || channels.includes("tiktok")) &&
      !args.mediaStorageIds?.length
    ) {
      throw new Error("YouTube and TikTok publishing require a video upload.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("socialPosts", {
      userId,
      content,
      channels,
      scheduledFor: args.scheduledFor,
      status: args.status,
      mediaStorageIds: args.mediaStorageIds ?? [],
      platformOptions: args.platformOptions,
      createdAt: now,
      updatedAt: now,
    });
    const post = await ctx.db.get(id);
    if (post) await ensureDeliveries(ctx, post);

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
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) throw new Error("Post not found.");
    if (post.status === "publishing") {
      throw new Error("This post is already publishing.");
    }
    if (post.status === "published") {
      throw new Error("This post has already been published.");
    }
    const access = await socialAccess(ctx, userId, Date.now());
    if (!access.paid && post.channels.length > FREE_CHANNELS_PER_POST) {
      throw new Error(
        "This draft uses multiple networks. Choose one network on Free or upgrade to Starter.",
      );
    }

    const deliveries = await ensureDeliveries(ctx, post);
    const now = Date.now();
    for (const delivery of deliveries) {
      if (delivery.status === "published") continue;
      if (delivery.status === "unknown") {
        throw new Error(
          `The ${delivery.channel} result is unknown. Check the network before retrying to avoid a duplicate.`,
        );
      }
      await ctx.db.patch(delivery._id, {
        status: "pending",
        error: undefined,
        updatedAt: now,
      });
    }
    await ctx.db.patch(post._id, {
      status: "scheduled",
      scheduledFor: now,
      error: undefined,
      updatedAt: now,
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
    if (post.status === "publishing") {
      throw new Error("This post is publishing now.");
    }
    for (const delivery of await deliveriesForPost(ctx, post._id)) {
      await ctx.db.delete(delivery._id);
    }
    await ctx.db.delete(post._id);
    return null;
  },
});

export const claimPost = internalMutation({
  args: { postId: v.id("socialPosts") },
  returns: v.array(v.id("socialDeliveries")),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "scheduled") return [];
    const deliveries = await ensureDeliveries(ctx, post);
    const pending = deliveries.filter(
      (delivery) => delivery.status === "pending",
    );
    await ctx.db.patch(post._id, {
      status: "publishing",
      error: undefined,
      updatedAt: Date.now(),
    });
    return pending.map((delivery) => delivery._id);
  },
});

export const getDeliveryForPublish = internalQuery({
  args: { deliveryId: v.id("socialDeliveries") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") return null;
    const post = await ctx.db.get(delivery.postId);
    if (!post || post.status !== "publishing") return null;
    const mediaUrls = (
      await Promise.all(
        post.mediaStorageIds.map((storageId) =>
          ctx.storage.getUrl(storageId),
        ),
      )
    ).filter((url): url is string => Boolean(url));
    return { delivery, post, mediaUrls };
  },
});

export const claimDelivery = internalMutation({
  args: { deliveryId: v.id("socialDeliveries") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") return false;
    await ctx.db.patch(delivery._id, {
      status: "publishing",
      attempts: delivery.attempts + 1,
      startedAt: Date.now(),
      error: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const markDeliveryPublished = internalMutation({
  args: {
    deliveryId: v.id("socialDeliveries"),
    toolSlug: v.string(),
    providerLogId: v.string(),
    remotePostId: v.optional(v.string()),
    remoteUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return null;
    const now = Date.now();
    await ctx.db.patch(delivery._id, {
      status: "published",
      toolSlug: args.toolSlug,
      providerLogId: args.providerLogId,
      remotePostId: args.remotePostId,
      remoteUrl: args.remoteUrl,
      error: undefined,
      completedAt: now,
      updatedAt: now,
    });
    await refreshPostStatus(ctx, delivery.postId);
    return null;
  },
});

export const markDeliveryFailed = internalMutation({
  args: {
    deliveryId: v.id("socialDeliveries"),
    error: v.string(),
    outcomeUnknown: v.boolean(),
    toolSlug: v.optional(v.string()),
    providerLogId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return null;
    const now = Date.now();
    await ctx.db.patch(delivery._id, {
      status: args.outcomeUnknown ? "unknown" : "failed",
      error: args.error.slice(0, 1000),
      toolSlug: args.toolSlug,
      providerLogId: args.providerLogId,
      completedAt: now,
      updatedAt: now,
    });
    await refreshPostStatus(ctx, delivery.postId);
    return null;
  },
});

