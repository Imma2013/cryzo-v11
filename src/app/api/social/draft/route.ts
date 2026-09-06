import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { resolveServerModel } from "@/lib/server/model-provider";
import { transientProviderFailure } from "@/lib/ai/request-intent";
import { composioToolCreditCost } from "@/lib/billing/integration-costs";
import { ACTIVE_MARKETING_CHANNELS } from "@/lib/server/composio-social";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MARKETING_MODEL_ID =
  process.env.OPENROUTER_MARKETING_MODEL?.trim() || "minimax/minimax-m3:free";

type HistoryItem = { role?: string; content?: string };
type MediaItem = { url?: string; name?: string; contentType?: string };

let composio: Composio<VercelProvider>;
function getComposio() {
  if (!composio) {
    composio = new Composio<VercelProvider>({ provider: new VercelProvider() });
  }
  return composio;
}

function wantsSocialAction(prompt: string) {
  return /\b(post|publish|send|share|schedule|upload)\b/i.test(prompt) &&
    /\b(linkedin|instagram|facebook|youtube|social|all (?:of )?(?:them|my accounts|networks)|connected accounts?)\b/i.test(prompt);
}

function activeChannel(value: string) {
  return ACTIVE_MARKETING_CHANNELS.includes(value as (typeof ACTIVE_MARKETING_CHANNELS)[number]);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    const user = await fetchQuery(api.users.currentUser, {}, { token });
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

    const body = (await req.json()) as {
      prompt?: unknown;
      channels?: unknown;
      conversationId?: unknown;
      requestKey?: unknown;
      history?: unknown;
      media?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 5000) {
      return Response.json({ error: "Describe what you want to publish." }, { status: 400 });
    }

    const conversationId =
      typeof body.conversationId === "string" && body.conversationId
        ? body.conversationId
        : undefined;
    let project: { title?: string } | null = null;
    if (conversationId) {
      try {
        project = await fetchQuery(
          api.conversations.get,
          { id: conversationId as Id<"conversations"> },
          { token },
        );
      } catch {
        project = null;
      }
    }

    const accounts = (await fetchQuery(api.social.listAccounts, {}, { token })).filter((account) =>
      activeChannel(String(account.channel)),
    );
    const channels = Array.isArray(body.channels)
      ? body.channels
          .filter((channel): channel is string => typeof channel === "string" && activeChannel(channel))
          .slice(0, 4)
      : [];
    const media = Array.isArray(body.media)
      ? (body.media as MediaItem[])
          .filter((item) => item && typeof item.url === "string" && /^https?:\/\//i.test(item.url || ""))
          .slice(0, 10)
          .map((item) => ({
            url: item.url!,
            name: typeof item.name === "string" ? item.name.slice(0, 180) : "media",
            contentType: typeof item.contentType === "string" ? item.contentType : undefined,
          }))
      : [];

    const safeHistory = Array.isArray(body.history)
      ? (body.history as HistoryItem[])
          .slice(-16)
          .filter(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string",
          )
          .map((item) => `${item.role}: ${item.content!.slice(0, 2400)}`)
          .join("\n")
      : "";

    const executeAction = wantsSocialAction(prompt);
    if (executeAction) {
      const hasCredits = await fetchQuery(
        api.billing.hasIntegrationCredits,
        { userId: user._id, amount: 1 },
        { token },
      );
      if (!hasCredits) {
        return Response.json(
          { error: "no_integration_credits", required: 1, requestId },
          { status: 402 },
        );
      }
    }

    const system = [
      "You are Cryzo Marketing, the social-media version of the main Cryzo agent.",
      "You can draft content and, when the user explicitly asks to post, publish, share, upload, or schedule it, you must use the connected social tools instead of saying you cannot act.",
      "Marketing currently supports Facebook, Instagram, LinkedIn, and YouTube only. Never use X/Twitter, Reddit, or TikTok from this Marketing agent.",
      "If the user asks only to write, rewrite, brainstorm, review, or prepare copy, do not call tools; return a ready-to-publish draft.",
      "An imperative such as 'post this on LinkedIn' or 'publish this to Instagram and Facebook' is the user's explicit authorization for that requested action.",
      "Use attached media URLs as the media inputs for the requested network when applicable. Do not invent a media URL.",
      "Respect the connected account and target network requirements. If a tool requires a field you do not have, explain exactly what is missing instead of fabricating it.",
      "Keep the user-facing response concise. After a successful action, say which network(s) were acted on. Never expose provider tokens, tool schemas, or hidden reasoning.",
    ].join(" ");

    const input = [
      project ? `Project context: ${project.title}` : "Project context: none (standalone marketing chat)",
      `Connected active accounts: ${accounts.map((account) => `${account.channel}:${account.name}`).join(", ") || "none"}`,
      `Selected target networks: ${channels.join(", ") || "not selected"}`,
      media.length
        ? `Attached media:\n${media.map((item, index) => `${index + 1}. ${item.name} (${item.contentType || "media"}) ${item.url}`).join("\n")}`
        : "Attached media: none",
      safeHistory ? `Conversation so far:\n${safeHistory}` : "",
      `User request: ${prompt}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      throw new Error("OPENROUTER_API_KEY is not configured in the Vercel runtime.");
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const selected = await resolveServerModel({
          providerId: "openrouter",
          modelId: MARKETING_MODEL_ID,
          credentialMode: "cryzo",
        });

        if (executeAction) {
          const session = await getComposio().create(String(user._id));
          const allTools = await session.tools();
          const socialTools = Object.fromEntries(
            Object.entries(allTools as Record<string, unknown>).filter(([name]) =>
              /facebook|instagram|youtube|linkedin/i.test(name),
            ),
          ) as any;
          const calledTools: string[] = [];
          const result = await generateText({
            model: selected.model,
            system,
            prompt: input,
            tools: socialTools,
            stopWhen: stepCountIs(8),
            maxOutputTokens: 1800,
            maxRetries: 0,
            abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(90_000)]),
            onStepFinish: async (step) => {
              const calls = Array.isArray((step as any).toolCalls)
                ? ((step as any).toolCalls as Array<{ toolName?: string }>)
                : [];
              for (const call of calls) {
                if (!call.toolName) continue;
                calledTools.push(call.toolName);
                await fetchMutation(
                  api.billing.deductIntegrationCredits,
                  {
                    userId: user._id,
                    amount: composioToolCreditCost(call.toolName),
                    reason: "composio",
                    description: `Marketing executed ${call.toolName}`,
                    toolName: call.toolName,
                  },
                  { token },
                );
              }
            },
          });
          const text = result.text.trim() || (calledTools.length ? "Done. The requested social action was sent through your connected account." : "I could not complete the requested social action.");
          return Response.json({
            text,
            requestId,
            actualModel: MARKETING_MODEL_ID,
            fallbackUsed: false,
            actionExecuted: calledTools.length > 0,
            toolNames: calledTools,
            composioSessionId: session.sessionId,
            proposal: {
              content: text,
              channels,
              requiresConfirmation: false,
            },
          });
        }

        const result = await generateText({
          model: selected.model,
          system,
          prompt: input,
          maxOutputTokens: 1400,
          maxRetries: 0,
          abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(45_000)]),
        });
        const text = result.text.trim();
        if (!text || result.finishReason === "length" || result.finishReason === "error") {
          throw new Error("The marketing model did not return a complete response.");
        }
        return Response.json({
          text,
          requestId,
          actualModel: MARKETING_MODEL_ID,
          fallbackUsed: false,
          actionExecuted: false,
          proposal: {
            content: text,
            channels,
            requiresConfirmation: true,
          },
        });
      } catch (error) {
        lastError = error;
        if (attempt === 0 && transientProviderFailure(error)) continue;
        break;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("The marketing model could not complete the response.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create a marketing response.";
    return Response.json({ error: message, requestId }, { status: 502 });
  }
}
