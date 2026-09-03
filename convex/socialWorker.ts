"use node";

import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

type Channel =
  | "x"
  | "linkedin"
  | "reddit"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
};

type PublishContext = {
  content: string;
  mediaUrls: string[];
  idempotencyKey: string;
  platformOptions?: {
    redditCommunity?: string;
    youtubeTitle?: string;
    tiktokPrivacy?: string;
  };
};

const CHANNEL_CONFIG: Record<
  Channel,
  { toolkit: string; label: string; search: string }
> = {
  x: {
    toolkit: "twitter",
    label: "X",
    search:
      "Create exactly one post on X/Twitter. Prefer a direct create-post action and return the created post ID and URL.",
  },
  linkedin: {
    toolkit: "linkedin",
    label: "LinkedIn",
    search:
      "Create exactly one LinkedIn post. Prefer a direct create-post action and return the created post ID and URL.",
  },
  reddit: {
    toolkit: "reddit",
    label: "Reddit",
    search:
      "Submit exactly one Reddit post to a specified subreddit. Return the submission ID and permalink.",
  },
  youtube: {
    toolkit: "youtube",
    label: "YouTube",
    search:
      "Upload exactly one YouTube video with a title and description. Return the video ID and watch URL.",
  },
  tiktok: {
    toolkit: "tiktok",
    label: "TikTok",
    search:
      "Publish exactly one TikTok video from a supplied video URL. Return the publish ID and public URL.",
  },
  instagram: {
    toolkit: "instagram",
    label: "Instagram",
    search:
      "Publish exactly one Instagram Business or Creator media post from supplied media URLs and a caption. Return the media ID and permalink.",
  },
  facebook: {
    toolkit: "facebook",
    label: "Facebook",
    search:
      "Publish exactly one Facebook Page post. Return the post ID and permalink.",
  },
};

let composio: Composio<VercelProvider> | null = null;

function getComposio() {
  if (!composio) {
    composio = new Composio<VercelProvider>({
      provider: new VercelProvider(),
    });
  }
  return composio;
}

function normalized(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstLine(text: string, max = 100) {
  return text.split(/\r?\n/, 1)[0].trim().slice(0, max) || "Cryzo post";
}

function valueForProperty(
  name: string,
  schema: JsonSchema,
  context: PublishContext,
): unknown {
  const key = normalized(name);
  if (schema.default !== undefined) return schema.default;

  if (
    [
      "text",
      "content",
      "message",
      "body",
      "caption",
      "description",
      "posttext",
      "tweettext",
      "status",
    ].includes(key)
  ) {
    return context.content;
  }
  if (["title", "videotitle", "posttitle"].includes(key)) {
    return context.platformOptions?.youtubeTitle?.trim() ||
      firstLine(context.content);
  }
  if (
    ["subreddit", "subredditname", "community", "communityname"].includes(key)
  ) {
    return context.platformOptions?.redditCommunity?.trim().replace(/^r\//, "");
  }
  if (key.includes("idempotency") || key === "requestid") {
    return context.idempotencyKey;
  }
  if (key.includes("privacy")) {
    return (
      context.platformOptions?.tiktokPrivacy ||
      schema.enum?.find((value) =>
        String(value).toLowerCase().includes("public"),
      ) ||
      schema.enum?.[0]
    );
  }
  if (
    key === "mediaurls" ||
    key === "imageurls" ||
    key === "videourls" ||
    key === "attachments"
  ) {
    return context.mediaUrls;
  }
  if (
    (key.includes("media") || key.includes("image") || key.includes("video")) &&
    key.includes("url")
  ) {
    return schema.type === "array"
      ? context.mediaUrls
      : context.mediaUrls[0];
  }
  if (schema.type === "object" && schema.properties) {
    return buildArguments(schema, context);
  }
  if (schema.enum?.length === 1) return schema.enum[0];
  return undefined;
}

function buildArguments(schema: JsonSchema, context: PublishContext) {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const arguments_: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const [name, propertySchema] of Object.entries(properties)) {
    const value = valueForProperty(name, propertySchema, context);
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    if (value !== undefined && value !== "" && !isEmptyArray) {
      arguments_[name] = value;
    } else if (required.has(name)) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Cryzo needs these network-specific details before publishing: ${missing.join(", ")}.`,
    );
  }
  return arguments_;
}

function deepEntries(
  value: unknown,
  prefix = "",
  seen = new Set<object>(),
): Array<[string, unknown]> {
  if (!value || typeof value !== "object") return [[prefix, value]];
  if (seen.has(value)) return [];
  seen.add(value);
  const entries: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    entries.push([path, child], ...deepEntries(child, path, seen));
  }
  return entries;
}

function executionEvidence(data: Record<string, unknown>) {
  const entries = deepEntries(data);
  const idEntry = entries.find(
    ([path, value]) =>
      typeof value === "string" &&
      /(^|\.)(post|tweet|video|media|submission|publish)?_?id$/i.test(path),
  );
  const urlEntry = entries.find(
    ([path, value]) =>
      typeof value === "string" &&
      /^https?:\/\//.test(value) &&
      /url|permalink|link/i.test(path),
  );
  const success = entries.some(
    ([path, value]) =>
      (/success|published|created/i.test(path) && value === true) ||
      (/status/i.test(path) &&
        typeof value === "string" &&
        /success|published|created|complete/i.test(value)),
  );
  return {
    remotePostId:
      typeof idEntry?.[1] === "string" ? idEntry[1] : undefined,
    remoteUrl: typeof urlEntry?.[1] === "string" ? urlEntry[1] : undefined,
    confirmed: Boolean(idEntry || urlEntry || success),
  };
}

async function fullToolSchema(
  session: Awaited<ReturnType<Composio<VercelProvider>["create"]>>,
  toolSlug: string,
  initial: JsonSchema | undefined,
) {
  if (initial?.properties) return initial;
  const response = await session.execute("COMPOSIO_GET_TOOL_SCHEMAS", {
    toolSlugs: [toolSlug],
  });
  if (response.error) throw new Error(response.error);
  const candidates = deepEntries(response.data);
  const schemaEntry = candidates.find(
    ([path, value]) =>
      /inputSchema|input_schema/i.test(path) &&
      value &&
      typeof value === "object",
  );
  if (!schemaEntry) {
    throw new Error(`Composio did not return an input schema for ${toolSlug}.`);
  }
  return schemaEntry[1] as JsonSchema;
}

export const publishPost = internalAction({
  args: { postId: v.id("socialPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const deliveryIds = await ctx.runMutation(internal.social.claimPost, args);
    for (const deliveryId of deliveryIds) {
      await ctx.scheduler.runAfter(0, internal.socialWorker.publishDelivery, {
        deliveryId,
      });
    }
    return null;
  },
});

export const publishDelivery = internalAction({
  args: { deliveryId: v.id("socialDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      internal.social.getDeliveryForPublish,
      args,
    );
    if (!payload) return null;
    const claimed = await ctx.runMutation(internal.social.claimDelivery, args);
    if (!claimed) return null;

    const channel = payload.delivery.channel as Channel;
    const config = CHANNEL_CONFIG[channel];
    let toolSlug: string | undefined;
    let providerLogId: string | undefined;
    let executionStarted = false;
    let missingConfirmation = false;

    try {
      const session = await getComposio().create(String(payload.post.userId));
      const search = await session.search({
        query: config.search,
        toolkits: [config.toolkit],
      });
      if (!search.success || search.error) {
        throw new Error(search.error || `Unable to load ${config.label} publishing actions.`);
      }
      const connection = search.toolkitConnectionStatuses.find(
        (status) => status.toolkit === config.toolkit,
      );
      if (!connection?.hasActiveConnection) {
        throw new Error(
          `Connect ${config.label} in Apps before publishing: ${connection?.statusMessage || "no active account"}.`,
        );
      }
      toolSlug = search.results
        .flatMap((result) => result.primaryToolSlugs)
        .find((slug) => search.toolSchemas[slug]);
      if (!toolSlug) {
        throw new Error(`Composio did not return a ${config.label} publishing action.`);
      }
      const schemaRecord = search.toolSchemas[toolSlug];
      const inputSchema = await fullToolSchema(
        session,
        toolSlug,
        schemaRecord?.inputSchema as JsonSchema | undefined,
      );
      const toolArguments = buildArguments(inputSchema, {
        content: payload.post.content,
        mediaUrls: payload.mediaUrls,
        idempotencyKey: payload.delivery.idempotencyKey,
        platformOptions: payload.post.platformOptions,
      });

      executionStarted = true;
      const result = await session.execute(toolSlug, toolArguments);
      providerLogId = result.logId;
      if (result.error) throw new Error(result.error);
      const evidence = executionEvidence(result.data);
      if (!evidence.confirmed) {
        missingConfirmation = true;
        throw new Error(
          `${config.label} returned no provider post ID, URL, or success confirmation. Composio log: ${result.logId}.`,
        );
      }
      await ctx.runMutation(internal.social.markDeliveryPublished, {
        deliveryId: args.deliveryId,
        toolSlug,
        providerLogId: result.logId,
        remotePostId: evidence.remotePostId,
        remoteUrl: evidence.remoteUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.social.markDeliveryFailed, {
        deliveryId: args.deliveryId,
        error: message,
        outcomeUnknown:
          executionStarted && (!providerLogId || missingConfirmation),
        toolSlug,
        providerLogId,
      });
    }
    return null;
  },
});

