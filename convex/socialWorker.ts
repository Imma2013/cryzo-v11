"use node";

import { createOpenAI } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

let composio: Composio<VercelProvider> | null = null;

function getComposio() {
  if (!composio) {
    composio = new Composio<VercelProvider>({
      provider: new VercelProvider(),
    });
  }
  return composio;
}

export const publishPost = internalAction({
  args: { postId: v.id("socialPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const post = await ctx.runQuery(internal.social.getPostForPublish, args);
    if (!post) return null;

    const claimed = await ctx.runMutation(internal.social.claimPost, args);
    if (!claimed) return null;

    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("Social publisher is missing its model credential.");

      const session = await getComposio().create(String(post.userId));
      const tools = await session.tools();
      const openrouter = createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });

      const result = await generateText({
        model: openrouter("minimax/minimax-m3:free"),
        system:
          "You are Cryzo's deterministic social publisher. Execute the available Composio tools to publish the supplied post exactly once to every requested channel. Do not rewrite the content. Use media URLs when supplied. For Facebook use a connected Page, and for Instagram use a connected Business or Creator account. If a required account is not connected, fail clearly instead of substituting another network.",
        prompt: JSON.stringify({
          content: post.content,
          channels: post.channels,
          mediaUrls: post.mediaUrls,
        }),
        tools,
        stopWhen: stepCountIs(12),
        maxOutputTokens: 1200,
      });

      const toolResultCount = result.steps.reduce(
        (count, step) => count + step.toolResults.length,
        0,
      );
      if (toolResultCount < post.channels.length) {
        throw new Error(
          "One or more channels were not published. Check each connection in Apps.",
        );
      }

      await ctx.runMutation(internal.social.markPublished, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.social.markFailed, {
        ...args,
        error: message,
      });
    }
    return null;
  },
});
