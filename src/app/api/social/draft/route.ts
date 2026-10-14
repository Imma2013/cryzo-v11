import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { resolveServerModel } from "@/lib/server/model-provider";
import { providerReasoningOptions } from "@/lib/ai/reasoning-config";
import { classifyCreditCost, describeCreditCharge } from "@/lib/stripe";
import { ACTIVE_MARKETING_CHANNELS } from "@/lib/server/composio-social";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

type HistoryItem = { role?: string; content?: string };
type MediaItem = { url?: string; name?: string; contentType?: string };

function activeChannel(value: string) {
  return ACTIVE_MARKETING_CHANNELS.includes(
    value as (typeof ACTIVE_MARKETING_CHANNELS)[number],
  );
}

function calendarTools(token: string, userId: string, defaultChannels: string[]) {
  return {
    calendar_list_posts: tool({
      description: "Read the user's Cryzo Marketing calendar and current scheduled/draft/published posts.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        const posts = await fetchQuery(api.social.listPosts, {}, { token });
        return posts.slice(0, 80).map((post: any) => ({
          id: String(post._id),
          content: post.content,
          channels: post.channels,
          scheduledFor: new Date(post.scheduledFor).toISOString(),
          status: post.status,
        }));
      },
    }),
    calendar_create_post: tool({
      description: "Create a Cryzo Marketing draft, schedule it for a future time, or publish it now. Use this whenever the user explicitly asks to add/schedule/publish content on the calendar.",
      inputSchema: jsonSchema({
        type: "object",
        required: ["content", "mode"],
        properties: {
          content: { type: "string", minLength: 1, maxLength: 12000 },
          channels: {
            type: "array",
            items: { type: "string", enum: [...ACTIVE_MARKETING_CHANNELS] },
          },
          mode: { type: "string", enum: ["draft", "schedule", "publish"] },
          scheduledFor: { type: "string", description: "ISO-8601 local/UTC date-time for schedule mode." },
        },
        additionalProperties: false,
      }),
      execute: async (input: any) => {
        const accounts = await fetchQuery(api.social.listAccounts, {}, { token });
        const requested = Array.isArray(input.channels)
          ? input.channels.filter((item: string) => activeChannel(item))
          : defaultChannels.filter(activeChannel);
        const channels = requested.length ? [...new Set(requested)] : ["x"];
        let scheduledFor = Date.now();
        if (input.mode === "schedule") {
          scheduledFor = Date.parse(String(input.scheduledFor || ""));
          if (!Number.isFinite(scheduledFor) || scheduledFor <= Date.now()) {
            throw new Error("Choose a future date and time for the scheduled post.");
          }
        }
        const accountSelections = channels.flatMap((channel) => {
          const account = accounts.find((item: any) => item.channel === channel);
          return account
            ? [{ channel, connectedAccountId: account.connectedAccountId }]
            : [];
        });
        const postId = await fetchMutation(api.social.createPost, {
          requestKey: crypto.randomUUID(),
          content: String(input.content),
          channels: channels as any,
          scheduledFor,
          status: input.mode === "schedule" ? "scheduled" : "draft",
          mediaStorageIds: [],
          platformOptions: { accountSelections: accountSelections as any },
        }, { token });
        if (input.mode === "publish") {
          await fetchMutation(api.social.publishNow, { postId }, { token });
        }
        return {
          postId: String(postId),
          mode: input.mode,
          channels,
          scheduledFor: new Date(scheduledFor).toISOString(),
        };
      },
    }),
    calendar_reschedule_post: tool({
      description: "Move an existing draft or scheduled Cryzo Marketing post to another date/time.",
      inputSchema: jsonSchema({
        type: "object",
        required: ["postId", "scheduledFor"],
        properties: {
          postId: { type: "string" },
          scheduledFor: { type: "string" },
        },
        additionalProperties: false,
      }),
      execute: async (input: any) => {
        const scheduledFor = Date.parse(String(input.scheduledFor || ""));
        if (!Number.isFinite(scheduledFor)) throw new Error("Choose a valid date and time.");
        await fetchMutation(api.social.reschedulePost, {
          postId: input.postId as any,
          scheduledFor,
        }, { token });
        return { ok: true, scheduledFor: new Date(scheduledFor).toISOString() };
      },
    }),
    calendar_delete_post: tool({
      description: "Delete an existing Cryzo Marketing post when the user explicitly asks to remove it.",
      inputSchema: jsonSchema({
        type: "object",
        required: ["postId"],
        properties: { postId: { type: "string" } },
        additionalProperties: false,
      }),
      execute: async (input: any) => {
        await fetchMutation(api.social.removePost, { postId: input.postId as any }, { token });
        return { ok: true };
      },
    }),
  };
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return Response.json({ error: "authentication_required", message: "Sign in to use Marketing AI." }, { status: 401 });

  try {
    const user = await fetchQuery(api.users.currentUser, {}, { token });
    if (!user) return Response.json({ error: "authentication_required", message: "Sign in to use Marketing AI." }, { status: 401 });

    const body = (await req.json()) as {
      prompt?: unknown;
      channels?: unknown;
      history?: unknown;
      media?: unknown;
      modelProvider?: string;
      modelId?: string;
      modelCredentialMode?: "cryzo" | "device" | "account";
      reasoningEffort?: string;
      modelBaseUrl?: string;
      modelApiKey?: string;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 8000) {
      return Response.json({ error: "Describe what you want Marketing AI to do." }, { status: 400 });
    }
    const channels = Array.isArray(body.channels)
      ? body.channels.filter((channel): channel is string => typeof channel === "string" && activeChannel(channel)).slice(0, 5)
      : [];
    const media = Array.isArray(body.media)
      ? (body.media as MediaItem[]).filter((item) => item && typeof item.url === "string").slice(0, 10)
      : [];
    const safeHistory = Array.isArray(body.history)
      ? (body.history as HistoryItem[])
          .slice(-16)
          .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
          .map((item) => `${item.role}: ${item.content!.slice(0, 2400)}`)
          .join("\n")
      : "";

    const selected = await resolveServerModel({
      providerId: body.modelProvider,
      modelId: body.modelId,
      credentialMode: body.modelCredentialMode,
      modelApiKey: body.modelApiKey,
      modelBaseUrl: body.modelBaseUrl,
      authToken: body.modelCredentialMode === "account" ? token : undefined,
    });
    const providerOptions = providerReasoningOptions(
      selected.providerId,
      selected.upstreamModelId,
      body.reasoningEffort,
    );
    const charge = selected.usesCryzoCredits
      ? Number((classifyCreditCost({ text: prompt, mode: "plan", hasFiles: media.length > 0 }) * selected.creditMultiplier).toFixed(2))
      : 0;
    if (charge > 0) {
      const hasCredits = await fetchQuery(api.billing.hasMessageCredits, {
        userId: user._id,
        amount: charge,
      }, { token });
      if (!hasCredits) {
        return Response.json({ error: "no_message_credits", required: charge }, { status: 402 });
      }
    }

    const accounts = await fetchQuery(api.social.listAccounts, {}, { token });
    const tools = calendarTools(token, String(user._id), channels);
    const system = [
      "You are Cryzo Marketing AI. You operate the user's real Cryzo social calendar.",
      "You have tools to read, create, schedule, publish, reschedule, and delete calendar posts. Use them when the user asks for an action.",
      "Never claim a calendar action succeeded unless the corresponding tool succeeded.",
      "Marketing supports X, Facebook, Instagram, YouTube, and LinkedIn.",
      "If the user only asks for ideas/copy/analysis, answer normally without changing the calendar.",
      "For references like 'Friday's post' or 'the LinkedIn post next week', call calendar_list_posts first and resolve the correct post rather than guessing an ID.",
      "Scheduling/publishing may fail when a connected network needs extra destination settings; explain the missing requirement rather than fabricating it.",
      "Keep user-facing replies concise and practical. Never expose tool schemas, tokens, credentials, or hidden reasoning.",
    ].join(" ");
    const input = [
      `Connected accounts: ${accounts.map((a: any) => `${a.channel}:${a.name}`).join(", ") || "none"}`,
      `Selected channels: ${channels.join(", ") || "none"}`,
      media.length
        ? `Attached media context: ${media.map((item) => `${item.name || "media"} ${item.url}`).join(", ")}`
        : "",
      safeHistory ? `Recent conversation:\n${safeHistory}` : "",
      `User request: ${prompt}`,
    ].filter(Boolean).join("\n");

    const calledTools: string[] = [];
    const result = await generateText({
      model: selected.model,
      providerOptions,
      system,
      prompt: input,
      tools,
      stopWhen: stepCountIs(8),
      maxOutputTokens: 1800,
      maxRetries: 1,
      abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(100_000)]),
      onStepFinish: async (step) => {
        const calls = Array.isArray((step as any).toolCalls) ? (step as any).toolCalls : [];
        for (const call of calls) if (call?.toolName) calledTools.push(call.toolName);
      },
    });

    if (charge > 0) {
      await fetchMutation(api.billing.deductMessageCredits, {
        userId: user._id,
        amount: charge,
        reason: "message",
        description: describeCreditCharge(charge),
        providerId: selected.providerId,
        modelId: selected.modelId,
      }, { token });
    }

    return Response.json({
      text: result.text.trim() || (calledTools.length ? "Done." : "I couldn't complete that request."),
      requestId,
      actualModel: selected.modelId,
      actionExecuted: calledTools.length > 0,
      toolNames: calledTools,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create a marketing response.";
    return Response.json({ error: "marketing_ai_failed", message, requestId }, { status: 502 });
  }
}
