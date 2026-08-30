import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
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

const CODING_REQUEST_PATTERN = /\b(build|generate|redesign|clone|website|web app|mobile app|native app|ios|iphone|android|expo|react native|component|landing page|dashboard|storefront|frontend|ui|ux|react|vite|tailwind|css|html|typescript|javascript|code|source|fix (?:this |the )?(?:site|website|app|code|error)|debug (?:this |the )?(?:site|website|app|code|error)|responsive|mobile layout)\b/i;
const EXTERNAL_ACTION_PATTERN = /\b(send|email|reply|forward|post|publish|schedule|calendar|invite|slack|tweet|x post|github issue|pull request|create issue|open issue|comment on|upload to|connect|disconnect|create event|create meeting|send message)\b/i;

function shouldUseComposioTools(userMessage: string) {
  if (userMessage.includes("[User selected element:")) return false;
  if (CODING_REQUEST_PATTERN.test(userMessage)) return false;
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
    const lastUserMsg = messages.filter((message) => message.role === "user").pop();
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
        console.warn("Unable to load stored project platform; inferring from prompt", error);
      }
    }

    const resolvedProjectPlatforms = projectPlatforms?.length
      ? normalizeProjectPlatforms(projectPlatforms)
      : storedProjectPlatforms?.length
        ? normalizeProjectPlatforms(storedProjectPlatforms)
        : inferProjectPlatforms(lastUserText, ["web"], false);

    const recipeSlug = pickDesignRecipe(lastUserText);
    const recipeContent = recipeSlug ? loadRecipeContent(recipeSlug) : "";
    const recipeBlock = recipeContent
      ? `\n\n## ACTIVE DESIGN RECIPE — FOLLOW AS BINDING GUIDANCE (selected: ${recipeSlug})\n${recipeContent}\n\nCRITICAL: The recipe controls composition, typography attitude, palette behavior, section structure, imagery approach, and CTA styling. Adapt it to the active project platform rather than forcing desktop web patterns into a mobile app.`
      : "";

    const modelMessages = await convertToModelMessages(messages);

    if (mode === "plan") {
      const result = streamText({
        model: resolved.model,
        system: buildPlanPrompt(recipeBlock, resolvedProjectPlatforms),
        messages: modelMessages,
        stopWhen: stepCountIs(5),
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

    const systemPrompt = buildCryzoSystemPrompt({
      useComposioTools,
      recipeBlock,
      projectPlatforms: resolvedProjectPlatforms,
    });

    let responseSessionId = composioSessionId;
    let result;

    if (useComposioTools) {
      const client = getComposio();
      const session = await client.create(userId || "anonymous");
      const tools = await session.tools();
      responseSessionId = session.sessionId;
      result = streamText({
        model: resolved.model,
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(10),
      });

      // The first production meter is intentionally simple: one integration
      // credit is charged when Cryzo provisions tool access for this request.
      // We can evolve this to weighted per-tool execution as usage data grows.
      if (userId) {
        void convex.mutation(api.billing.deductIntegrationCredits, {
          userId: userId as any,
          amount: 1,
          reason: "composio",
          description: "External tool request",
        });
      }
    } else {
      result = streamText({
        model: resolved.model,
        system: systemPrompt,
        messages: modelMessages,
        stopWhen: stepCountIs(10),
      });
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

    return result.toUIMessageStreamResponse({
      headers: {
        ...(responseSessionId
          ? { "x-composio-session-id": responseSessionId }
          : {}),
        "x-cryzo-model-provider": resolved.providerId,
        "x-cryzo-model-id": resolved.modelId,
        "x-cryzo-billing-tier": resolved.billingTier,
        "x-cryzo-message-credits": String(messageCharge),
        "x-cryzo-integration-credits": useComposioTools ? "1" : "0",
      },
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
