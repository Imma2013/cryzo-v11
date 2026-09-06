import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveServerModel } from "@/lib/server/model-provider";
import { classifyCreditCost, describeCreditCharge } from "@/lib/stripe";
import { composioToolCreditCost } from "@/lib/billing/integration-costs";
import {
  buildCryzoSystemPrompt,
  buildPlanPrompt,
} from "@/lib/ai/server-prompt";
import {
  inferProjectPlatforms,
  normalizeProjectPlatforms,
  type ProjectPlatform,
} from "@/lib/project-platform";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const MAX_BUILD_SEGMENTS = 3;
const CONTINUE_BUILD_PROMPT = `Continue the previous build response exactly where it stopped.
Do not restart the artifact and do not repeat any completed cryzoAction.
If the response stopped inside a file action, continue that file's raw contents first, then close the action normally.
Finish every remaining required file/action and close the cryzoArtifact. Output only the continuation.`;

let composio: Composio<VercelProvider>;
function getComposio() {
  if (!composio) {
    composio = new Composio<VercelProvider>({ provider: new VercelProvider() });
  }
  return composio;
}

const RECIPE_KEYWORDS: Record<string, string[]> = {
  "cryzo-10": ["dog", "pet", "cat", "animal", "puppy", "kitten", "vet"],
  "cryzo-1": ["festival", "concert", "event", "lineup", "music event", "rave"],
  "cryzo-2": ["3d", "futuristic", "immersive", "artifact"],
  "cryzo-3": ["furniture", "interior", "home decor", "design studio"],
  "cryzo-4": ["car rental", "vehicle", "fleet"],
  "cryzo-5": ["hypercar", "supercar", "speed", "performance car"],
  "cryzo-6": ["travel", "luxury travel", "concierge", "destination"],
  "cryzo-7": ["restaurant", "dining", "food", "nightlife", "bar", "chef"],
  "cryzo-8": ["book", "publisher", "author", "literary", "novel"],
  "cryzo-9": ["luxury car", "motorsport", "automotive luxury"],
  airbnb: ["stay", "rental", "booking", "hotel", "accommodation", "airbnb"],
  stripe: ["payment", "billing", "api", "fintech", "merchant"],
  spotify: ["music", "streaming", "audio", "playlist", "podcast"],
  ferrari: ["ferrari", "racing", "supercar editorial"],
  tesla: ["electric", "ev", "tesla"],
  notion: ["productivity", "notes", "docs", "workspace", "wiki"],
  figma: ["design tool", "interface", "prototype", "figma"],
  vercel: ["deploy", "frontend", "developer platform"],
  apple: ["phone", "device", "product launch", "consumer tech"],
  coinbase: ["crypto", "exchange", "wallet", "bitcoin"],
  "linear.app": ["issue", "project management", "sprint", "kanban"],
  framer: ["website builder", "motion", "animation"],
  cursor: ["code editor", "ai coding", "ide"],
  spacex: ["rocket", "space", "mission", "aerospace"],
};

function pickDesignRecipe(userMessage: string): string | null {
  const msg = userMessage.toLowerCase();
  for (const [slug, keywords] of Object.entries(RECIPE_KEYWORDS)) {
    if (keywords.some((keyword) => msg.includes(keyword))) return slug;
  }
  return null;
}

function loadRecipeContent(slug: string): string {
  try {
    return readFileSync(
      join(process.cwd(), `vendor/design-recipes/${slug}/DESIGN.md`),
      "utf-8",
    );
  } catch {
    return "";
  }
}

const EXTERNAL_ACTION_PATTERN = /\b(send|email|reply|forward|post|publish|schedule|calendar|invite|slack|tweet|x post|github issue|pull request|create issue|open issue|comment on|upload to|connect|disconnect|create event|create meeting|send message|setup|set up|configure|authorize|stripe|gmail|payment)\b/i;

function shouldUseComposioTools(userMessage: string) {
  if (userMessage.includes("[User selected element:")) return false;
  return EXTERNAL_ACTION_PATTERN.test(userMessage);
}

function messageText(message: UIMessage | undefined) {
  return (
    message?.parts
      ?.filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join(" ") || ""
  );
}

function hasAttachedContent(messages: UIMessage[]) {
  return messages.some((message) =>
    message.parts?.some((part) => part.type !== "text"),
  );
}

function needsBuildContinuation(text: string, finishReason: string) {
  if (finishReason === "length") return true;
  if (!text.includes("<cryzoArtifact")) return false;

  const artifactOpen = text.lastIndexOf("<cryzoArtifact");
  const artifactClose = text.lastIndexOf("</cryzoArtifact>");
  if (artifactOpen > artifactClose) return true;

  const actionOpenCount = text.match(/<cryzoAction\b/g)?.length ?? 0;
  const actionCloseCount = text.match(/<\/cryzoAction>/g)?.length ?? 0;
  return actionOpenCount > actionCloseCount;
}

type CloudConfig = {
  name?: string;
  auth?: { providers?: string[] };
  entities?: Array<{
    name?: string;
    fields?: unknown;
    access?: "private" | "public-read" | "public";
  }>;
};

function parseCloudConfig(text: string): CloudConfig | null {
  const match = text.match(
    /<cryzoAction\s+type=["']file["']\s+filePath=["']cryzo\/cloud\.json["']>([\s\S]*?)<\/cryzoAction>/i,
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1].trim()) as CloudConfig;
  } catch {
    return null;
  }
}

function authedConvexClient(authToken?: string) {
  if (!authToken || !process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
  client.setAuth(authToken);
  return client;
}

function buildCurrentProjectContext(artifacts: any[]) {
  const latest = new Map<string, string>();
  for (const artifact of artifacts || []) {
    for (const action of artifact?.actions || []) {
      if (
        action?.type === "file" &&
        action.filePath &&
        typeof action.content === "string"
      ) {
        latest.set(action.filePath, action.content);
      }
    }
  }

  const ignored = /(^|\/)(node_modules|dist|build|\.git)(\/|$)|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|(^|\/)\.env/i;
  const entries = [...latest.entries()]
    .filter(([path]) => !ignored.test(path))
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return "";

  const limit = 90000;
  let used = 0;
  const blocks: string[] = [];
  for (const [path, content] of entries) {
    const header = `\n--- ${path} ---\n`;
    if (used + header.length >= limit) break;
    const remaining = limit - used - header.length;
    const body = content.length > remaining ? content.slice(0, remaining) : content;
    blocks.push(`${header}${body}`);
    used += header.length + body.length;
    if (body.length < content.length) break;
  }

  return `\n\n## CURRENT PROJECT SOURCE — AUTHORITATIVE\nThese are the latest saved project files, including manual edits made in Cryzo Files. Treat them as the source of truth. Preserve manual edits unless the user asks to change them. When editing, output complete replacements only for files that actually need changes.\n${blocks.join("\n")}`;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const {
      messages,
      conversationId,
      userId,
      composioSessionId,
      chatMode,
      projectPlatforms,
      modelProvider,
      modelId,
      modelCredentialMode,
      modelBaseUrl,
      modelApiKey,
      authToken,
    } = (await req.json()) as {
      messages: UIMessage[];
      conversationId?: string;
      userId: string;
      composioSessionId: string | null;
      chatMode?: "build" | "plan";
      projectPlatforms?: ProjectPlatform[];
      modelProvider?: string;
      modelId?: string;
      modelCredentialMode?: "cryzo" | "device" | "account";
      modelBaseUrl?: string;
      modelApiKey?: string;
      authToken?: string;
    };

    const mode = chatMode === "plan" ? "plan" : "build";
    const lastUserMsg = messages
      .filter((message) => message.role === "user")
      .pop();
    const lastUserText = messageText(lastUserMsg);
    const resolved = await resolveServerModel({
      providerId: modelProvider,
      modelId,
      credentialMode: modelCredentialMode,
      modelApiKey,
      modelBaseUrl,
      authToken,
    });

    const baseMessageCharge = resolved.usesCryzoCredits
      ? classifyCreditCost({
          text: lastUserText,
          mode,
          hasFiles: hasAttachedContent(messages),
        })
      : 0;
    const messageCharge = Number(
      (baseMessageCharge * resolved.creditMultiplier).toFixed(2),
    );

    if (messageCharge > 0 && userId) {
      const hasCredits = await convex.query(api.billing.hasMessageCredits, {
        userId: userId as any,
        amount: messageCharge,
      });
      if (!hasCredits) {
        return Response.json(
          {
            error: "no_message_credits",
            required: messageCharge,
            modelId: resolved.modelId,
          },
          { status: 402 },
        );
      }
    }

    let storedProjectPlatforms: ProjectPlatform[] | null = null;
    if (!projectPlatforms?.length && conversationId && userId) {
      try {
        const stored = await convex.query(
          api.conversations.getProjectPlatformsForChat,
          {
            id: conversationId as any,
            userId: userId as any,
          },
        );
        if (Array.isArray(stored) && stored.length > 0) {
          storedProjectPlatforms = stored as ProjectPlatform[];
        }
      } catch (error) {
        console.warn(
          "Unable to load stored project platform; inferring from prompt",
          error,
        );
      }
    }

    const resolvedProjectPlatforms = projectPlatforms?.length
      ? normalizeProjectPlatforms(projectPlatforms)
      : storedProjectPlatforms?.length
        ? normalizeProjectPlatforms(storedProjectPlatforms)
        : inferProjectPlatforms(lastUserText, ["web"], false);

    let cryzoCloudAppId: string | undefined;
    let currentProjectContext = "";
    const authenticatedConvex = authedConvexClient(authToken);
    if (conversationId && authenticatedConvex) {
      try {
        const artifacts = await authenticatedConvex.query(
          api.artifacts.listByConversation,
          {
            conversationId: conversationId as any,
          },
        );
        currentProjectContext = buildCurrentProjectContext(artifacts as any[]);
      } catch (error) {
        console.warn("Unable to load current project source for model context", error);
      }
    }

    if (mode === "build" && conversationId && authenticatedConvex) {
      try {
        const cloudApp = await authenticatedConvex.mutation(
          api.cloudAdmin.ensureForConversation,
          {
            conversationId: conversationId as any,
            name: `Cryzo app ${conversationId.slice(-6)}`,
          },
        );
        cryzoCloudAppId = String(cloudApp.appId);
      } catch (error) {
        console.warn("Unable to initialize Cryzo Cloud namespace", error);
      }
    }

    const syncGeneratedCloudConfig = async (text: string) => {
      if (!conversationId || !authenticatedConvex) return;
      const config = parseCloudConfig(text);
      if (!config) return;
      const entities = (config.entities || [])
        .filter((entity) => entity.name?.trim())
        .map((entity) => ({
          name: entity.name!.trim(),
          fields: entity.fields,
          access: entity.access,
        }));
      try {
        await authenticatedConvex.mutation(api.cloudAdmin.configureFromPublish, {
          conversationId: conversationId as any,
          name: config.name?.trim() || `Cryzo app ${conversationId.slice(-6)}`,
          entities,
          authProviders: (config.auth?.providers || []).filter(Boolean),
        } as any);
      } catch (error) {
        console.warn("Unable to apply generated Cryzo Cloud config", error);
      }
    };

    const recipeSlug = pickDesignRecipe(lastUserText);
    const recipeContent = recipeSlug ? loadRecipeContent(recipeSlug) : "";
    const recipeBlock = recipeContent
      ? `\n\n## ACTIVE DESIGN RECIPE — FOLLOW AS BINDING GUIDANCE (selected: ${recipeSlug})\n${recipeContent}\n\nCRITICAL: The recipe controls composition, typography attitude, palette behavior, section structure, imagery approach, and CTA styling. Adapt it to the active project platform rather than forcing desktop web patterns into a mobile app.`
      : "";

    const modelMessages = await convertToModelMessages(messages);

    if (mode === "plan") {
      const result = streamText({
        model: resolved.model,
        system:
          buildPlanPrompt(recipeBlock, resolvedProjectPlatforms) +
          currentProjectContext,
        messages: modelMessages,
        stopWhen: stepCountIs(5),
        maxRetries: 2,
      });

      if (messageCharge > 0 && userId) {
        void convex.mutation(api.billing.deductMessageCredits, {
          userId: userId as any,
          amount: messageCharge,
          reason: "message",
          description: describeCreditCharge(messageCharge),
          providerId: resolved.providerId,
          modelId: resolved.modelId,
        });
      }

      return result.toUIMessageStreamResponse({
        headers: {
          ...(composioSessionId
            ? { "x-composio-session-id": composioSessionId }
            : {}),
          "x-cryzo-model-provider": resolved.providerId,
          "x-cryzo-model-id": resolved.modelId,
          "x-cryzo-billing-tier": resolved.billingTier,
          "x-cryzo-message-credits": String(messageCharge),
        },
      });
    }

    const useComposioTools = shouldUseComposioTools(lastUserText);
    if (useComposioTools && userId) {
      const hasIntegrationCredits = await convex.query(
        api.billing.hasIntegrationCredits,
        { userId: userId as any, amount: 1 },
      );
      if (!hasIntegrationCredits) {
        return Response.json(
          { error: "no_integration_credits", required: 1 },
          { status: 402 },
        );
      }
    }

    const systemPrompt =
      buildCryzoSystemPrompt({
        useComposioTools,
        recipeBlock,
        projectPlatforms: resolvedProjectPlatforms,
        cryzoCloudAppId,
      }) + currentProjectContext;

    let responseSessionId = composioSessionId;
    let response: Response;

    if (useComposioTools) {
      const client = getComposio();
      const session = await client.create(userId || "anonymous");
      const tools = await session.tools();
      responseSessionId = session.sessionId;
      const result = streamText({
        model: resolved.model,
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(10),
        maxRetries: 2,
        onStepFinish: async (step) => {
          if (!userId) return;
          const calls = Array.isArray((step as any).toolCalls)
            ? ((step as any).toolCalls as Array<{ toolName?: string }>)
            : [];
          for (const call of calls) {
            const amount = composioToolCreditCost(call.toolName);
            await convex.mutation(api.billing.deductIntegrationCredits, {
              userId: userId as any,
              amount,
              reason: "composio",
              description: call.toolName
                ? `Executed ${call.toolName}`
                : "Executed external tool",
              toolName: call.toolName,
            });
          }
        },
        onFinish: async ({ text }) => {
          await syncGeneratedCloudConfig(text || "");
        },
      });
      response = result.toUIMessageStreamResponse();
    } else {
      const textId = generateId();
      const uiStream = createUIMessageStream({
        originalMessages: messages,
        onError: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[chat/build-stream]", error);
          return message;
        },
        execute: async ({ writer }) => {
          writer.write({ type: "text-start", id: textId });

          let continuationMessages: any[] = [...modelMessages];
          let fullText = "";

          for (let segment = 0; segment < MAX_BUILD_SEGMENTS; segment++) {
            const result = streamText({
              model: resolved.model,
              system: systemPrompt,
              messages: continuationMessages,
              maxRetries: 2,
            });

            let segmentText = "";
            for await (const delta of result.textStream) {
              segmentText += delta;
              fullText += delta;
              writer.write({ type: "text-delta", id: textId, delta });
            }

            const finishReason = await result.finishReason;
            const needsMore = needsBuildContinuation(fullText, finishReason);
            if (!needsMore) break;

            if (segment === MAX_BUILD_SEGMENTS - 1) {
              throw new Error(
                "The selected model could not finish the build after automatic continuation.",
              );
            }

            continuationMessages = [
              ...continuationMessages,
              { role: "assistant", content: segmentText },
              { role: "user", content: CONTINUE_BUILD_PROMPT },
            ];
          }

          writer.write({ type: "text-end", id: textId });
          await syncGeneratedCloudConfig(fullText);
        },
      });
      response = createUIMessageStreamResponse({ stream: uiStream });
    }

    if (messageCharge > 0 && userId) {
      void convex.mutation(api.billing.deductMessageCredits, {
        userId: userId as any,
        amount: messageCharge,
        reason: "message",
        description: describeCreditCharge(messageCharge),
        providerId: resolved.providerId,
        modelId: resolved.modelId,
      });
    }

    const headers = new Headers(response.headers);
    if (responseSessionId) {
      headers.set("x-composio-session-id", responseSessionId);
    }
    headers.set("x-cryzo-model-provider", resolved.providerId);
    headers.set("x-cryzo-model-id", resolved.modelId);
    headers.set("x-cryzo-billing-tier", resolved.billingTier);
    headers.set("x-cryzo-message-credits", String(messageCharge));
    headers.set(
      "x-cryzo-integration-credits",
      useComposioTools ? "metered" : "0",
    );
    if (cryzoCloudAppId) {
      headers.set("x-cryzo-cloud-app-id", cryzoCloudAppId);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model request failed";
    const status =
      message.includes("session") || message.includes("saved")
        ? 401
        : message.includes("API key") ||
            message.includes("Choose") ||
            message.includes("base URL") ||
            message.includes("Local providers") ||
            message.includes("is not configured")
          ? 400
          : 500;
    return Response.json({ error: message }, { status });
  }
}
