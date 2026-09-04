"use node";

import { Composio } from "@composio/core";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { composioSocialSessionOptions } from "../src/lib/server/composio-social";

const toolkits: Record<string, string> = { x: "twitter", reddit: "reddit", youtube: "youtube", tiktok: "tiktok", instagram: "instagram", facebook: "facebook" };
function entries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [[key, child] as [string, unknown], ...entries(child)]);
}
function identifier(value: unknown, keys = ["post_id", "tweet_id", "video_id", "media_id", "id"]) {
  return entries(value).find(([key, value]) => keys.includes(key) && (typeof value === "string" || typeof value === "number"))?.[1]?.toString();
}
export const publishPost = internalAction({
  args: { postId: v.id("socialPosts") }, returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.social.claimPost, args);
    return null;
  },
});
export const publishDelivery = internalAction({
  args: { deliveryId: v.id("socialDeliveries") }, returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.social.getDeliveryForPublish, args);
    if (!payload || !await ctx.runMutation(internal.social.claimDelivery, args)) return null;
    const toolkit = toolkits[payload.delivery.channel];
    let executionStarted = false, logId: string | undefined, toolSlug: string | undefined;
    try {
      if (!toolkit || !payload.delivery.connectedAccountId) throw new Error("Connect an approved account to this project before publishing.");
      const composio = new Composio();
      const session = await composio.create(String(payload.post.userId), composioSocialSessionOptions(toolkit, payload.delivery.connectedAccountId));
      const execute = async (slug: string, arguments_: Record<string, unknown>, publishes = true) => {
        toolSlug = slug;
        if (publishes) executionStarted = true;
        const result = await session.execute(slug, arguments_);
        logId = result.logId;
        if (result.error) throw new Error(result.error);
        return result;
      };
      const options = payload.post.platformOptions ?? {}, content = payload.post.content;
      const urls = payload.mediaUrls as string[];
      const video = payload.mediaTypes?.[0]?.startsWith("video/");
      let result;
      if (toolkit === "twitter") {
        const ids = [];
        if (video) throw new Error("X video uploads are not enabled. Use images or a text post.");
        for (const url of urls) {
          const media = await composio.files.upload({ file: url, toolSlug: "TWITTER_UPLOAD_MEDIA", toolkitSlug: toolkit });
          const uploaded = await execute("TWITTER_UPLOAD_MEDIA", { media, media_category: "tweet_image" }, false);
          const id = identifier(uploaded.data, ["media_id", "id"]);
          if (!id) throw new Error("X did not confirm the media upload.");
          ids.push(id);
        }
        result = await execute("TWITTER_CREATION_OF_A_POST", { text: content, ...(ids.length ? { media_media_ids: ids } : {}) });
      } else if (toolkit === "reddit") {
        if (urls.length) throw new Error("Use a text-only Reddit post in this release.");
        result = await execute("REDDIT_CREATE_REDDIT_POST", { subreddit: options.redditCommunity, title: content.split("\n")[0].slice(0, 300), text: content, kind: "self" });
      } else if (toolkit === "facebook") {
        result = video ? await execute("FACEBOOK_CREATE_VIDEO_POST", { page_id: options.facebookPageId, file_url: urls[0], description: content, published: true })
          : urls.length ? await execute("FACEBOOK_CREATE_MULTI_PHOTO_POST", { page_id: options.facebookPageId, photo_urls: urls, message: content })
          : await execute("FACEBOOK_CREATE_POST", { page_id: options.facebookPageId, message: content, published: true });
      } else if (toolkit === "instagram") {
        if (urls.length !== 1) throw new Error("Instagram currently requires exactly one image or video.");
        const container = await execute("INSTAGRAM_POST_IG_USER_MEDIA", { ig_user_id: "me", caption: content,
          ...(video ? { video_url: urls[0], media_type: "REELS" } : { image_url: urls[0] }) }, false);
        const id = identifier(container.data);
        if (!id) throw new Error("Instagram did not create a media container.");
        result = await execute("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", { ig_user_id: "me", creation_id: id, max_wait_seconds: 120 });
      } else if (toolkit === "youtube") {
        if (!video || urls.length !== 1) throw new Error("YouTube requires exactly one video.");
        const file = await composio.files.upload({ file: urls[0], toolSlug: "YOUTUBE_UPLOAD_VIDEO", toolkitSlug: toolkit });
        result = await execute("YOUTUBE_UPLOAD_VIDEO", { title: options.youtubeTitle || content.split("\n")[0].slice(0,100),
          description: content, tags: [], categoryId: "22", privacyStatus: options.youtubePrivacy || "public", videoFilePath: file });
      } else {
        if (!video || urls.length !== 1) throw new Error("TikTok requires exactly one video.");
        result = await execute("TIKTOK_PUBLISH_VIDEO", { video_url: urls[0], caption: content, privacy_level: options.tiktokPrivacy });
        const publishId = identifier(result.data, ["publish_id"]);
        if (!publishId) throw new Error("TikTok did not return a publishing ID.");
        await ctx.runMutation(internal.social.markProcessing, { deliveryId: args.deliveryId, remotePostId: publishId, providerLogId: result.logId, toolSlug: "TIKTOK_PUBLISH_VIDEO" });
        await ctx.scheduler.runAfter(5000, internal.socialWorker.checkTikTok, args);
        return null;
      }
      const id = identifier(result.data);
      if (!id) throw new Error("The platform returned no post ID. Review the network before retrying.");
      await ctx.runMutation(internal.social.markDeliveryPublished, { deliveryId: args.deliveryId, toolSlug: toolSlug!, providerLogId: result.logId, remotePostId: id });
    } catch (error) {
      await ctx.runMutation(internal.social.markDeliveryFailed, { deliveryId: args.deliveryId,
        error: error instanceof Error ? error.message : "Publishing failed.", outcomeUnknown: executionStarted, toolSlug, providerLogId: logId });
    }
    return null;
  },
});

export const checkTikTok = internalAction({
  args: { deliveryId: v.id("socialDeliveries") }, returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runMutation(internal.social.claimPoll, args);
    if (!delivery) return null;
    try {
      const session = await new Composio().create(String(delivery.userId), composioSocialSessionOptions("tiktok", delivery.connectedAccountId!));
      const result = await session.execute("TIKTOK_FETCH_PUBLISH_STATUS", { publish_id: delivery.remotePostId });
      if (result.error) throw new Error(result.error);
      const status = entries(result.data).find(([key]) => key === "status")?.[1];
      if (status === "PUBLISH_COMPLETE") {
        await ctx.runMutation(internal.social.markDeliveryPublished, { deliveryId: delivery._id, toolSlug: "TIKTOK_FETCH_PUBLISH_STATUS", providerLogId: result.logId, remotePostId: delivery.remotePostId });
        return null;
      }
      if (status === "FAILED") {
        await ctx.runMutation(internal.social.markDeliveryFailed, { deliveryId: delivery._id, outcomeUnknown: false, error: "TikTok rejected the post. Check media, privacy and account approval.", providerLogId: result.logId });
        return null;
      }
    } catch { /* Status lookups are safe to retry; never restart the upload. */ }
    if ((delivery.pollingAttempts ?? 0) >= 9) {
      await ctx.runMutation(internal.social.markDeliveryFailed, { deliveryId: delivery._id, outcomeUnknown: true, error: "TikTok is still processing or status is unavailable. Review the network before retrying." });
    } else await ctx.scheduler.runAfter(Math.min(60_000, 5000 * 2 ** (delivery.pollingAttempts ?? 0)), internal.socialWorker.checkTikTok, args);
    return null;
  },
});


