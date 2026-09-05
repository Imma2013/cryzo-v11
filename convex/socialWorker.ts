"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const toolkits: Record<string, string> = { x: "twitter", reddit: "reddit", youtube: "youtube", tiktok: "tiktok", instagram: "instagram", facebook: "facebook", linkedin: "linkedin" };

type ComposioExecution = {
  data: unknown;
  error?: string;
  logId: string;
  // Some providers (notably LinkedIn) return the created resource identifier
  // in response metadata instead of the JSON body.
  response?: {
    status?: number;
    headers?: Record<string, string>;
  };
  headers?: Record<string, string>;
  status?: number;
};

async function callComposio<T>(body: Record<string, unknown>): Promise<T> {
  const secret = process.env.CRYZO_INTERNAL_API_SECRET;
  if (!secret) throw new Error("Social publishing is not configured.");

  const origin = (
    process.env.CRYZO_APP_URL ||
    process.env.SITE_URL ||
    "https://www.cryzo.me"
  ).replace(/\/$/, "");
  const response = await fetch(`${origin}/api/internal/social/composio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json()) as { result?: T; error?: string };
  if (!response.ok || payload.result === undefined) {
    throw new Error(payload.error || "Composio execution failed.");
  }
  return payload.result;
}
function entries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [[key, child] as [string, unknown], ...entries(child)]);
}
function identifier(value: unknown, keys = ["post_id", "tweet_id", "video_id", "media_id", "id"]) {
  return entries(value).find(([key, value]) => keys.includes(key) && (typeof value === "string" || typeof value === "number"))?.[1]?.toString();
}

function linkedinIdentifier(result: ComposioExecution) {
  const dataId = identifier(result.data);
  if (dataId) return dataId;

  const metadataId = identifier(result, [
    "x-restli-id",
    "x_restli_id",
    "xRestliId",
    "shareUrn",
    "share_urn",
    "activity",
    "entityUrn",
    "urn",
  ]);
  if (metadataId) return metadataId;

  const headers = result.response?.headers ?? result.headers;
  return Object.entries(headers ?? {}).find(([key, value]) =>
    ["x-restli-id", "x_restli_id", "xrestliid"].includes(key.toLowerCase()) &&
    typeof value === "string" &&
    value.length > 0,
  )?.[1];
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
    let executionStarted = false;
    let explicitProviderFailure = false;
    let logId: string | undefined;
    let toolSlug: string | undefined;
    try {
      if (!toolkit || !payload.delivery.connectedAccountId) throw new Error("Connect an approved account in Marketing before publishing.");
      const execute = async (slug: string, arguments_: Record<string, unknown>, publishes = true) => {
        toolSlug = slug;
        if (publishes) executionStarted = true;
        const result = await callComposio<ComposioExecution>({
          operation: "execute",
          userId: String(payload.post.userId),
          toolkit,
          connectedAccountId: payload.delivery.connectedAccountId,
          toolSlug: slug,
          arguments: arguments_,
        });
        logId = result.logId;
        if (result.error) {
          explicitProviderFailure = true;
          throw new Error(result.error);
        }
        return result;
      };
      const options = payload.post.platformOptions ?? {}, content = payload.post.content;
      const urls = payload.mediaUrls as string[];
      const mediaTypes = (payload.mediaTypes ?? []) as string[];
      const video = mediaTypes[0]?.startsWith("video/");
      let result;
      if (toolkit === "twitter") {
        const ids = [];
        if (video) throw new Error("X video uploads are not enabled. Use images or a text post.");
        for (const url of urls) {
          const media = await callComposio<unknown>({
            operation: "upload",
            toolkit,
            toolSlug: "TWITTER_UPLOAD_MEDIA",
            file: url,
          });
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
        const igUserId = String(options.instagramUserId ?? "");
        if (!/^\d+$/.test(igUserId)) {
          throw new Error("Choose an Instagram Business or Creator account.");
        }
        const postType = options.instagramPostType ?? "post";
        let container;
        if (postType === "carousel") {
          const childImageUrls = urls.filter((_, index) => !mediaTypes[index]?.startsWith("video/"));
          const childVideoUrls = urls.filter((_, index) => mediaTypes[index]?.startsWith("video/"));
          container = await execute("INSTAGRAM_CREATE_CAROUSEL_CONTAINER", {
            ig_user_id: igUserId,
            caption: content,
            ...(childImageUrls.length ? { child_image_urls: childImageUrls } : {}),
            ...(childVideoUrls.length ? { child_video_urls: childVideoUrls } : {}),
          }, false);
        } else {
          container = await execute("INSTAGRAM_POST_IG_USER_MEDIA", {
            ig_user_id: igUserId,
            ...(postType === "story" ? {} : { caption: content }),
            ...(video
              ? {
                  video_url: urls[0],
                  media_type: postType === "story" ? "STORIES" : "REELS",
                }
              : {
                  image_url: urls[0],
                  ...(postType === "story" ? { media_type: "STORIES" } : {}),
                }),
          }, false);
        }
        const id = identifier(container.data);
        if (!id) throw new Error("Instagram did not create a media container.");
        result = await execute("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", {
          ig_user_id: igUserId,
          creation_id: id,
          max_wait_seconds: 300,
        });
      } else if (toolkit === "linkedin") {
        if (video) throw new Error("LinkedIn video publishing is not enabled yet. Use text or images.");
        let author = typeof options.linkedinAuthorUrn === "string"
          ? options.linkedinAuthorUrn.trim()
          : "";
        if (!author) {
          const profile = await execute("LINKEDIN_GET_MY_INFO", {}, false);
          const personId = identifier(profile.data, ["sub", "person_id", "member_id", "id"]);
          if (!personId) throw new Error("LinkedIn did not return the connected member ID.");
          author = personId.startsWith("urn:li:") ? personId : `urn:li:person:${personId}`;
        }
        const images = [];
        for (const url of urls) {
          images.push(await callComposio<unknown>({
            operation: "upload",
            toolkit,
            toolSlug: "LINKEDIN_CREATE_LINKED_IN_POST",
            file: url,
          }));
        }
        result = await execute("LINKEDIN_CREATE_LINKED_IN_POST", {
          author,
          commentary: content.slice(0, 3000),
          visibility: options.linkedinVisibility || "PUBLIC",
          ...(images.length ? { images } : {}),
        });
      } else if (toolkit === "youtube") {
        const videoIndex = mediaTypes.findIndex((type) => type.startsWith("video/"));
        const thumbnailIndex = mediaTypes.findIndex((type) => type.startsWith("image/"));
        if (videoIndex < 0) throw new Error("YouTube requires exactly one video.");
        const file = await callComposio<unknown>({
          operation: "upload",
          toolkit,
          toolSlug: "YOUTUBE_UPLOAD_VIDEO",
          file: urls[videoIndex],
        });
        result = await execute("YOUTUBE_UPLOAD_VIDEO", {
          title: options.youtubeTitle || content.split("\n")[0].slice(0, 100),
          description: content,
          tags: [],
          categoryId: "22",
          privacyStatus: options.youtubePrivacy || "public",
          videoFilePath: file,
        });
        const videoId = identifier(result.data, ["video_id", "id"]);
        if (!videoId) throw new Error("YouTube did not return the uploaded video ID.");
        if (thumbnailIndex >= 0) {
          await execute("YOUTUBE_UPDATE_THUMBNAIL", {
            videoId,
            thumbnailUrl: urls[thumbnailIndex],
          }, false);
        }
      } else {
        if (!video || urls.length !== 1) throw new Error("TikTok requires exactly one video.");
        result = await execute("TIKTOK_PUBLISH_VIDEO", { video_url: urls[0], caption: content, privacy_level: options.tiktokPrivacy });
        const publishId = identifier(result.data, ["publish_id"]);
        if (!publishId) throw new Error("TikTok did not return a publishing ID.");
        await ctx.runMutation(internal.social.markProcessing, { deliveryId: args.deliveryId, remotePostId: publishId, providerLogId: result.logId, toolSlug: "TIKTOK_PUBLISH_VIDEO" });
        await ctx.scheduler.runAfter(5000, internal.socialWorker.checkTikTok, args);
        return null;
      }
      const id = toolkit === "linkedin"
        ? linkedinIdentifier(result)
        : identifier(result.data);
      if (!id) throw new Error("The platform returned no post ID. Review the network before retrying.");
      await ctx.runMutation(internal.social.markDeliveryPublished, { deliveryId: args.deliveryId, toolSlug: toolSlug!, providerLogId: result.logId, remotePostId: id });
    } catch (error) {
      await ctx.runMutation(internal.social.markDeliveryFailed, { deliveryId: args.deliveryId,
        error: error instanceof Error ? error.message : "Publishing failed.",
        outcomeUnknown: executionStarted && !explicitProviderFailure,
        toolSlug,
        providerLogId: logId,
      });
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
      const result = await callComposio<ComposioExecution>({
        operation: "execute",
        userId: String(delivery.userId),
        toolkit: "tiktok",
        connectedAccountId: delivery.connectedAccountId!,
        toolSlug: "TIKTOK_FETCH_PUBLISH_STATUS",
        arguments: { publish_id: delivery.remotePostId },
      });
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


