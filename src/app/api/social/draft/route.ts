import { generateText } from "ai";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { resolveServerModel } from "@/lib/server/model-provider";
import { transientProviderFailure } from "@/lib/ai/request-intent";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MARKETING_MODEL_ID =
  process.env.OPENROUTER_MARKETING_MODEL?.trim() || "minimax/minimax-m3:free";

type HistoryItem = { role?: string; content?: string };

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
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 4000) {
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
        // Standalone marketing chats may carry an old/deleted project id.
        project = null;
      }
    }
    const accounts = await fetchQuery(api.social.listAccounts, {}, { token });
    const channels = Array.isArray(body.channels)
      ? body.channels.filter((channel): channel is string => typeof channel === "string").slice(0, 7)
      : [];

    const safeHistory = Array.isArray(body.history)
      ? (body.history as HistoryItem[])
          .slice(-12)
          .filter(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string",
          )
          .map((item) => `${item.role}: ${item.content!.slice(0, 2000)}`)
          .join("\n")
      : "";

    const system = [
      "You are Cryzo Marketing, a conversational social-media copilot.",
      "Respond naturally to the user's request, then provide a ready-to-publish draft when they ask for copy.",
      "Never claim a post was published. Publishing requires explicit user confirmation in the composer.",
      "Keep the response concise and do not emit code, XML, or internal reasoning.",
      "Respect each network's limits (for example, keep X copy under 280 characters unless the user asks otherwise).",
    ].join(" ");

    const input = [
      project ? `Project context: ${project.title}` : "Project context: none (standalone marketing chat)",
      `Connected accounts: ${accounts.map((account) => `${account.channel}:${account.name}`).join(", ") || "none"}`,
      `Target networks: ${channels.join(", ") || "not selected"}`,
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
        const result = await generateText({
          model: selected.model,
          system,
          prompt: input,
          maxOutputTokens: 1200,
          maxRetries: 0,
          abortSignal: AbortSignal.any([
            req.signal,
            AbortSignal.timeout(45_000),
          ]),
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
