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

import { chargeSocialDelivery } from "./billing";

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
  facebookPageId: v.optional(v.string()),
  youtubePrivacy: v.optional(v.string()),
  linkedinAuthorUrn: v.optional(v.string()),
  linkedinVisibility: v.optional(v.string()),
  instagramUserId: v.optional(v.string()),
  instagramPostType: v.optional(
    v.union(
      v.literal("post"),
      v.literal("reel"),
      v.literal("story"),
      v.literal("carousel"),
    ),
  ),
  accountSelections: v.optional(
    v.array(
      v.object({
        channel: channelValidator,
        connectedAccountId: v.string(),
      }),
    ),
  ),
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
        (subscription.status === "active" || (subscription.status === "canceled" && subscription.currentPeriodEnd > now)),
    );
  const period = new Date(now).toISOString().slice(0, 7);
  const usage = await ctx.db.query("socialUsage").withIndex("by_user_period", q => q.eq("userId", userId).eq("period", period)).unique();

  return {
    plan: owner ? "owner" : (subscription?.plan ?? "free"),
    postsUsed: usage?.reserved ?? 0,
    monthlyPostLimit: paid ? null : FREE_MONTHLY_POSTS,
    maxChannelsPerPost: paid ? null : FREE_CHANNELS_PER_POST,
    paid,
  };
}

async function assertCanPublish(
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

async function userAccounts(ctx: SocialContext, userId: Id<"users">) {
  return await ctx.db
    .query("socialAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(100);
}

async function ensureDeliveries(ctx: MutationCtx, post: Doc<"socialPosts">) {
  const [existing, accounts] = await Promise.all([
    deliveriesForPost(ctx, post._id),
    userAccounts(ctx, post.userId),
  ]);
  const existingChannels = new Set(
    existing.map((delivery) => delivery.channel),
  );
  const now = Date.now();

  for (const channel of post.channels) {
    const selectedAccountId = post.platformOptions?.accountSelections?.find(
      (selection) => selection.channel === channel,
    )?.connectedAccountId;
    const account = accounts.find(
      (item) =>
        item.channel === channel &&
        (!selectedAccountId || item.connectedAccountId === selectedAccountId),
    );
    if (existingChannels.has(channel)) {
      const delivery = existing.find((item) => item.channel === channel)!;
      if (!delivery.connectedAccountId && account) {
        await ctx.db.patch(delivery._id, {
          connectedAccountId: account.connectedAccountId,
          updatedAt: now,
        });
      }
      continue;
    }

    await ctx.db.insert("socialDeliveries", {
      postId: post._id,
      userId: post.userId,
      conversationId: post.conversationId,
      connectedAccountId: account?.connectedAccountId,
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
  if (published === 0 && unknown === 0) {
    const post = await ctx.db.get(postId);
    if (post) await releasePost(ctx, post);
  }
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
  args: { now: v.number(), conversationId: v.optional(v.id("conversations")) },
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
    if (args.conversationId) await requireProject(ctx, userId, args.conversationId);
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
  args: { conversationId: v.optional(v.id("conversations")) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (args.conversationId) await requireProject(ctx, userId, args.conversationId);
    const posts = await (args.conversationId
      ? ctx.db.query("socialPosts").withIndex("by_project_and_scheduled", q => q.eq("conversationId", args.conversationId))
      : ctx.db.query("socialPosts").withIndex("by_user_and_scheduled", q => q.eq("userId", userId)))
      .order("desc")
      .take(250);

    return await Promise.all(
      posts.filter((post) => post.userId === userId).map(async (post) => ({
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
    conversationId: v.optional(v.id("conversations")),
    requestKey: v.string(),
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
    if (args.conversationId) {
      await requireProject(ctx, userId, args.conversationId);
    }
    if (!args.requestKey || args.requestKey.length > 200) {
      throw new Error("Invalid request.");
    }
    const previous = await ctx.db
      .query("socialPosts")
      .withIndex("by_user_and_request", (q) =>
        q.eq("userId", userId).eq("requestKey", args.requestKey),
      )
      .first();
    if (previous) return previous._id;
    const access = await socialAccess(ctx, userId, Date.now());
    if (!Number.isFinite(args.scheduledFor)) throw new Error("Choose a valid date.");
    if (args.status === "scheduled" && !access.paid) throw new Error("Upgrade to Starter to schedule posts.");
    if (args.status === "scheduled") await assertCanPublish(ctx, userId, channels);
    if ((args.mediaStorageIds?.length ?? 0) > 10) throw new Error("Use at most ten media files.");
    for (const storageId of args.mediaStorageIds ?? []) {
      const media = await ctx.db.query("socialMedia").withIndex("by_storage", q => q.eq("storageId", storageId)).unique();
      if (!media || media.userId !== userId) {
        throw new Error("Media does not belong to this account.");
      }
    }
    const content = args.content.trim();
    if (!content || content.length > 12000) {
      throw new Error("Write a post before scheduling.");
    }
    if (channels.length === 0) {
      throw new Error("Choose at least one channel.");
    }
    if (
      args.status !== "draft" && channels.includes("reddit") &&
      !args.platformOptions?.redditCommunity?.trim()
    ) {
      throw new Error("Choose a Reddit community before scheduling.");
    }
    if (
      args.status !== "draft" && (channels.includes("youtube") || channels.includes("tiktok") || channels.includes("instagram")) &&
      !args.mediaStorageIds?.length
    ) {
      throw new Error("The selected networks require a media upload.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("socialPosts", {
      userId,
      conversationId: args.conversationId,
      requestKey: args.requestKey,
      scheduledByUser: args.status === "scheduled",
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
    if (post) {
      if (args.status === "scheduled") await validatePublishing(ctx, post);
      await ensureDeliveries(ctx, post);
    }

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

    await validatePublishing(ctx, post);
    await reservePost(ctx, post);
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
      scheduledByUser: false,
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
    const deliveries = await deliveriesForPost(ctx, post._id);
    if (deliveries.every(item => !["published", "unknown", "publishing"].includes(item.status))) await releasePost(ctx, post);
    for (const delivery of deliveries) {
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
    if (post.scheduledFor > Date.now()) return [];
    try {
      const access = await socialAccess(ctx, post.userId, Date.now());
      if (post.scheduledByUser && !access.paid) throw new Error("Scheduling requires an active Starter plan.");
      await validatePublishing(ctx, post);
      await reservePost(ctx, post);
    } catch (error) {
      await ctx.db.patch(post._id, { status: "failed", error: error instanceof Error ? error.message : "Publishing is unavailable.", updatedAt: Date.now() });
      return [];
    }
    const deliveries = await ensureDeliveries(ctx, post);
    const pending = deliveries.filter(
      (delivery) => delivery.status === "pending",
    );
    await ctx.db.patch(post._id, {
      status: "publishing",
      error: undefined,
      updatedAt: Date.now(),
    });
    for (const delivery of pending) {
      await ctx.scheduler.runAfter(0, internal.socialWorker.publishDelivery, { deliveryId: delivery._id });
    }
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
    const mediaTypes = await Promise.all(post.mediaStorageIds.map(storageId => ctx.db.query("socialMedia").withIndex("by_storage", q => q.eq("storageId", storageId)).unique()));
    return { delivery, post, mediaUrls, mediaTypes: mediaTypes.map(item => item?.contentType ?? "") };
  },
});

export const claimDelivery = internalMutation({
  args: { deliveryId: v.id("socialDeliveries") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") return false;
    const post = await ctx.db.get(delivery.postId);
    if (!post || post.status !== "publishing") return false;
    try { await validatePublishing(ctx, post); } catch (error) {
      await ctx.db.patch(delivery._id, { status: "failed", error: error instanceof Error ? error.message : "Account unavailable.", updatedAt: Date.now() });
      await refreshPostStatus(ctx, delivery.postId);
      return false;
    }
    if (!await chargeSocialDelivery(ctx, delivery.userId, delivery.channel)) {
      await ctx.db.patch(delivery._id, { status: "failed", error: "No integration credits remaining.", updatedAt: Date.now() });
      await refreshPostStatus(ctx, delivery.postId);
      return false;
    }
    await ctx.db.patch(delivery._id, {
      status: "publishing",
      attempts: delivery.attempts + 1,
      startedAt: Date.now(),
      leaseExpiresAt: Date.now() + 300_000,
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(305_000, internal.social.expireDeliveryLease, { deliveryId: delivery._id });
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
      leaseExpiresAt: undefined,
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
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await refreshPostStatus(ctx, delivery.postId);
    return null;
  },
});
async function requireProject(ctx: SocialContext, userId: Id<"users">, conversationId: Id<"conversations">) {
  const project = await ctx.db.get(conversationId);
  if (project?.userId !== userId) throw new Error("Project not found.");
}
async function validatePublishing(ctx: MutationCtx, post: Doc<"socialPosts">) {
  if (post.conversationId) {
    await requireProject(ctx, post.userId, post.conversationId);
  }

  const [accounts, deliveries] = await Promise.all([
    userAccounts(ctx, post.userId),
    deliveriesForPost(ctx, post._id),
  ]);

  for (const channel of post.channels) {
    const selectedAccountId = post.platformOptions?.accountSelections?.find(
      (selection) => selection.channel === channel,
    )?.connectedAccountId;
    const delivery = deliveries.find((item) => item.channel === channel);
    const accountId = selectedAccountId || delivery?.connectedAccountId;
    const account = accountId
      ? accounts.find(
          (item) =>
            item.channel === channel &&
            item.connectedAccountId === accountId,
        )
      : accounts.find((item) => item.channel === channel);

    if (!account) {
      throw new Error(`Connect and select ${channel} in Marketing before publishing.`);
    }
  }

  if (
    post.channels.includes("reddit") &&
    !post.platformOptions?.redditCommunity?.trim()
  ) {
    throw new Error("Choose a Reddit community.");
  }
  if (
    post.channels.some((channel) =>
      ["youtube", "tiktok", "instagram"].includes(channel),
    ) &&
    !post.mediaStorageIds.length
  ) {
    throw new Error("This network requires media.");
  }
  if (
    post.channels.includes("facebook") &&
    !/^\d+$/.test(post.platformOptions?.facebookPageId ?? "")
  ) {
    throw new Error("Choose a numeric Facebook Page ID.");
  }
  if (
    post.channels.some((channel) => ["youtube", "tiktok"].includes(channel)) &&
    post.mediaStorageIds.length !== 1
  ) {
    throw new Error("Choose exactly one video for YouTube or TikTok.");
  }
  if (
    post.channels.includes("instagram") &&
    !/^\d+$/.test(post.platformOptions?.instagramUserId ?? "")
  ) {
    throw new Error("Choose an Instagram Business or Creator account.");
  }
  const instagramPostType = post.platformOptions?.instagramPostType ?? "post";
  if (post.channels.includes("instagram")) {
    if (
      instagramPostType === "carousel" &&
      (post.mediaStorageIds.length < 2 || post.mediaStorageIds.length > 10)
    ) {
      throw new Error("Instagram carousels require 2 to 10 media files.");
    }
    if (
      instagramPostType !== "carousel" &&
      post.mediaStorageIds.length !== 1
    ) {
      throw new Error("Instagram posts, reels, and stories require exactly one media file.");
    }
  }
  if (post.channels.includes("reddit") && post.mediaStorageIds.length) {
    throw new Error("Reddit currently supports text posts only.");
  }
  if (post.channels.includes("x") && post.mediaStorageIds.length > 4) {
    throw new Error("X supports at most four images per post.");
  }
  if (post.channels.includes("linkedin") && post.content.length > 3000) {
    throw new Error("LinkedIn posts must be 3,000 characters or fewer.");
  }

  const mediaItems = [];
  for (const id of post.mediaStorageIds) {
    const media = await ctx.db
      .query("socialMedia")
      .withIndex("by_storage", (q) => q.eq("storageId", id))
      .unique();

    if (!media || media.userId !== post.userId) {
      throw new Error("Media does not belong to this account.");
    }
    mediaItems.push(media);
  }

  if (
    post.channels.includes("x") &&
    mediaItems.some((media) => media.contentType.startsWith("video/"))
  ) {
    throw new Error("X currently supports image uploads only.");
  }
  if (
    post.channels.some((channel) => channel === "youtube" || channel === "tiktok") &&
    mediaItems.some((media) => !media.contentType.startsWith("video/"))
  ) {
    throw new Error("YouTube and TikTok require video files.");
  }
  if (
    post.channels.includes("instagram") &&
    instagramPostType === "post" &&
    mediaItems.some((media) => media.contentType.startsWith("video/"))
  ) {
    throw new Error("Choose Reel for an Instagram video.");
  }
  if (
    post.channels.includes("instagram") &&
    instagramPostType === "reel" &&
    mediaItems.some((media) => !media.contentType.startsWith("video/"))
  ) {
    throw new Error("Instagram Reels require a video.");
  }
  if (
    post.channels.includes("facebook") &&
    mediaItems.some((media) => media.contentType.startsWith("video/")) &&
    mediaItems.length !== 1
  ) {
    throw new Error("Facebook video posts require exactly one video.");
  }
  if (
    post.channels.includes("linkedin") &&
    mediaItems.some((media) => media.contentType.startsWith("video/"))
  ) {
    throw new Error(
      "LinkedIn video publishing is not enabled yet. Use text or images.",
    );
  }
}
async function reservePost(ctx: MutationCtx, post: Doc<"socialPosts">) {
  if (post.quotaPeriod) return;
  await assertCanPublish(ctx, post.userId, post.channels);
  const period = new Date().toISOString().slice(0, 7);
  const meter = await ctx.db.query("socialUsage").withIndex("by_user_period", q => q.eq("userId", post.userId).eq("period", period)).unique();
  if (meter) await ctx.db.patch(meter._id, { reserved: meter.reserved + 1 });
  else await ctx.db.insert("socialUsage", { userId: post.userId, period, reserved: 1 });
  await ctx.db.patch(post._id, { quotaPeriod: period });
}
export const expireDeliveryLease = internalMutation({
  args: { deliveryId: v.id("socialDeliveries") }, returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "publishing" || !delivery.leaseExpiresAt || delivery.leaseExpiresAt > Date.now()) return null;
    await ctx.db.patch(delivery._id, { status: "unknown", leaseExpiresAt: undefined,
      error: "Publishing was interrupted after dispatch began. Check the network before retrying to avoid a duplicate post.", updatedAt: Date.now() });
    await refreshPostStatus(ctx, delivery.postId);
    return null;
  },
});
export const listAccounts = query({
  args: { conversationId: v.optional(v.id("conversations")) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (args.conversationId) {
      await requireProject(ctx, userId, args.conversationId);
    }
    const accounts = await userAccounts(ctx, userId);
    const seen = new Set<string>();
    return accounts.filter((account) => {
      if (seen.has(account.connectedAccountId)) return false;
      seen.add(account.connectedAccountId);
      return true;
    });
  },
});

export const bindAccount = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    channel: channelValidator,
    connectedAccountId: v.string(),
    name: v.string(),
    serviceKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !process.env.CRYZO_INTERNAL_API_SECRET ||
      args.serviceKey !== process.env.CRYZO_INTERNAL_API_SECRET
    ) {
      throw new Error("Unauthorized.");
    }

    const userId = await currentUserId(ctx);
    if (args.conversationId) {
      await requireProject(ctx, userId, args.conversationId);
    }

    const [access, all] = await Promise.all([
      socialAccess(ctx, userId, Date.now()),
      userAccounts(ctx, userId),
    ]);
    const existing = all.find(
      (account) => account.connectedAccountId === args.connectedAccountId,
    );
    const distinct = new Set(
      all
        .filter((account) => account._id !== existing?._id)
        .map((account) => account.connectedAccountId),
    );
    distinct.add(args.connectedAccountId);

    if (distinct.size > (access.paid ? 7 : 1)) {
      throw new Error(
        `Your plan allows ${access.paid ? 7 : 1} connected social accounts.`,
      );
    }

    const now = Date.now();
    const fields = {
      userId,
      conversationId: args.conversationId,
      channel: args.channel,
      connectedAccountId: args.connectedAccountId,
      name: args.name.slice(0, 100),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("socialAccounts", {
        ...fields,
        createdAt: now,
      });
    }
    return null;
  },
});

export const unbindAccount = mutation({
  args: { accountId: v.id("socialAccounts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    const account = await ctx.db.get(args.accountId);
    if (account?.userId !== userId) throw new Error("Account not found.");

    const matches = await userAccounts(ctx, userId);
    for (const match of matches) {
      if (match.connectedAccountId === account.connectedAccountId) {
        await ctx.db.delete(match._id);
      }
    }
    return null;
  },
});

export const registerMedia = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    storageId: v.id("_storage"),
    contentType: v.string(),
    name: v.string(),
    serviceKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !process.env.CRYZO_INTERNAL_API_SECRET ||
      args.serviceKey !== process.env.CRYZO_INTERNAL_API_SECRET
    ) {
      throw new Error("Unauthorized.");
    }

    const userId = await currentUserId(ctx);
    if (args.conversationId) {
      await requireProject(ctx, userId, args.conversationId);
    }

    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (
      !metadata ||
      metadata.size > 500_000_000 ||
      !metadata.contentType?.match(/^(image|video)\//)
    ) {
      throw new Error("Invalid or oversized media upload.");
    }
    if (metadata.contentType !== args.contentType) {
      throw new Error("Media type does not match the upload.");
    }

    const existing = await ctx.db
      .query("socialMedia")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      if (existing.userId !== userId) {
        throw new Error("Media already belongs to another account.");
      }
      return null;
    }

    await ctx.db.insert("socialMedia", {
      userId,
      conversationId: args.conversationId,
      storageId: args.storageId,
      contentType: args.contentType,
      name: args.name,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const mediaUrl = query({
  args: { storageId: v.id("_storage") }, returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    const media = await ctx.db.query("socialMedia").withIndex("by_storage", q => q.eq("storageId", args.storageId)).unique();
    if (media?.userId !== userId) throw new Error("Media not found.");
    return ctx.storage.getUrl(args.storageId);
  },
});

export const markProcessing = internalMutation({
  args: { deliveryId: v.id("socialDeliveries"), remotePostId: v.string(), providerLogId: v.string(), toolSlug: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { deliveryId, ...fields } = args;
    await ctx.db.patch(deliveryId, { ...fields, status: "publishing", pollingAttempts: 0, updatedAt: Date.now() });
    return null;
  },
});
export const claimPoll = internalMutation({
  args: { deliveryId: v.id("socialDeliveries") }, returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "publishing" || !delivery.remotePostId) return null;
    await ctx.db.patch(delivery._id, { pollingAttempts: (delivery.pollingAttempts ?? 0) + 1 });
    return delivery;
  },
});
async function releasePost(ctx: MutationCtx, post: Doc<"socialPosts">) {
  if (!post.quotaPeriod) return;
  const meter = await ctx.db.query("socialUsage").withIndex("by_user_period", q => q.eq("userId", post.userId).eq("period", post.quotaPeriod!)).unique();
  if (meter) await ctx.db.patch(meter._id, { reserved: Math.max(0, meter.reserved - 1) });
  await ctx.db.patch(post._id, { quotaPeriod: undefined });
}



