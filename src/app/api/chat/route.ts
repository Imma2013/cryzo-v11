import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ToolSet,
  type UIMessageChunk,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveServerModel } from "@/lib/server/model-provider";
import { readStreamPart } from "@/lib/server/stream-read";
import { managedCandidates, markModelUnhealthy, openRouterClient } from "@/lib/server/openrouter";
import type { Id } from "../../../../convex/_generated/dataModel";
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
      if (action?.type === "file" && action.filePath && typeof action.content === "string") {
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
export const maxDuration = 300;

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/sk-[\w-]+/g, "[redacted]").slice(0, 500);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let runId: Id<"aiRuns"> | undefined;
  const serviceKey = process.env.CRYZO_INTERNAL_API_SECRET ?? "";
  const settle = async (success: boolean, costMicros = 0, detail: { actualModel?: string; generationId?: string; telemetry?: unknown } = {}) => {
    if (!runId) return;
    await convex.mutation(api.aiUsage.settle, { serviceKey, runId, success, costMicros, ...detail });
  };
  try {
    const body = await req.json();
    const messages = body.messages as UIMessage[];
    if (!Array.isArray(messages) || !messages.length || messages.length > 200) {
      return Response.json({ error: "Invalid conversation.", requestId }, { status: 400 });
    }
    const authenticated = authedConvexClient(body.authToken);
    const user = authenticated && await authenticated.query(api.users.currentUser, {});
    if (!authenticated || !user) return Response.json({ error: "Sign in to continue.", requestId }, { status: 401 });
    const userId = user._id;
    const conversationId = body.conversationId as Id<"conversations">;
    if (!conversationId) return Response.json({ error: "A project is required." }, { status: 400 });
    // This authenticated query also checks project ownership.
    const artifacts = await authenticated.query(api.artifacts.listByConversation, { conversationId });
    const mode = body.chatMode === "plan" ? "plan" : "build";
    const lastUser = messages.filter(message => message.role === "user").pop();
    const lastText = messageText(lastUser);
    const wantsTools = mode === "build" && shouldUseComposioTools(lastText);
    const hasImages = messages.some(message => message.parts?.some(part => part.type === "file"));
    const initial = await resolveServerModel({
      providerId: body.modelProvider, modelId: body.modelId, credentialMode: body.modelCredentialMode,
      modelApiKey: body.modelApiKey, modelBaseUrl: body.modelBaseUrl, authToken: body.authToken,
    });
    const managed = initial.providerId === "cryzo";
    if (managed && !serviceKey) throw new Error("Managed generation is not configured.");
    if (wantsTools && !initial.supportsTools) throw new Error("Choose a model that supports connected actions.");
    const profiles = managed ? await managedCandidates(initial.modelId, wantsTools, hasImages) : [];
    const project = await authenticated.query(api.conversations.get, { id: conversationId });
    const platforms = normalizeProjectPlatforms(body.projectPlatforms?.length ? body.projectPlatforms : project?.projectPlatforms?.length ? project.projectPlatforms : inferProjectPlatforms(lastText, ["web"], false));
    const recipe = pickDesignRecipe(lastText);
    const recipeBlock = recipe ? "\n\nDesign reference:\n" + loadRecipeContent(recipe) : "";
    let cloudAppId: string | undefined;
    if (mode === "build") {
      const app = await authenticated.mutation(api.cloudAdmin.ensureForConversation, { conversationId, name: `Cryzo app ${conversationId.slice(-6)}` });
      cloudAppId = String(app.appId);
    }
    const system = (mode === "plan" ? buildPlanPrompt(recipeBlock, platforms) :
      buildCryzoSystemPrompt({ useComposioTools: wantsTools, recipeBlock, projectPlatforms: platforms, cryzoCloudAppId: cloudAppId })) +
      buildCurrentProjectContext(artifacts);
    const modelMessages = await convertToModelMessages(messages);
    const inputUpperBound = Buffer.byteLength(system + JSON.stringify(modelMessages)) + (hasImages ? 16_000 : 0);
    let outputLimit = 8192;
    if (managed) {
      const balance = await authenticated.query(api.aiUsage.balance, {});
      if (initial.minimumPlan === "starter" && balance.plan === "free") {
        return Response.json({ error: "starter_required", requestId }, { status: 402 });
      }
      // A byte is a conservative token bound for text. Reserve the largest
      // eligible single attempt; failed attempts are absorbed by Cryzo.
      const eligible = profiles.filter(profile => profile.context > inputUpperBound + 1024);
      if (!eligible.length) throw new Error("This conversation exceeds the model context. Start a new chat or choose a larger-context model.");
      profiles.splice(0, profiles.length, ...eligible);
      for (const profile of profiles) {
        outputLimit = Math.min(outputLimit, profile.output, profile.context - inputUpperBound - 512);
        if (profile.tier === "premium") {
          const available = balance.remainingMicros / 1_000_000 - inputUpperBound * profile.inputCost - profile.requestCost;
          if (profile.outputCost > 0) outputLimit = Math.min(outputLimit, Math.floor(available / profile.outputCost));
        }
      }
      if (outputLimit < 1024) return Response.json({ error: "no_message_credits", requestId }, { status: 402 });
      const maxCostMicros = Math.ceil(Math.max(...profiles.map(profile =>
        inputUpperBound * profile.inputCost + outputLimit * profile.outputCost + profile.requestCost)) * 1_000_000);
      runId = await authenticated.mutation(api.aiUsage.reserve, {
        conversationId, requestKey: `${conversationId}:${lastUser?.id ?? requestId}`,
        modelId: initial.modelId, freeModel: initial.billingTier === "free", maxCostMicros, serviceKey: serviceKey!,
      });
    }
    let tools: ToolSet | undefined;
    let sessionId = body.composioSessionId;
    if (wantsTools) {
      const allowed = await authenticated.query(api.billing.hasIntegrationCredits, { userId, amount: 1 });
      if (!allowed) throw new Error("no_integration_credits");
      const session = await getComposio().create(userId);
      tools = await session.tools();
      for (const [name, definition] of Object.entries(tools)) {
        const execute = definition.execute;
        if (!execute) continue;
        definition.execute = (async (input, options) => {
          const charged = await authenticated.mutation(api.billing.deductIntegrationCredits, {
            userId, amount: composioToolCreditCost(name), reason: "composio", description: "Connected action", toolName: name,
          });
          if (!charged.success) throw new Error("no_integration_credits");
          return execute(input, options);
        }) as typeof execute;
      }
      sessionId = session.sessionId;
    }
    const started = Date.now();
    const totalSignal = AbortSignal.any([req.signal, AbortSignal.timeout(240_000)]);
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start", messageId: requestId });
        writer.write({ type: "data-generation", data: { requestId, requestedModelId: initial.modelId, status: "connecting" } });
        const attempts = managed ? [profiles[0], profiles[0], ...profiles.slice(1)] : [undefined];
        let lastError: unknown;
        let completed = false;
        try {
          for (let attempt = 0; attempt < attempts.length; attempt++) {
            if (totalSignal.aborted) throw new Error("Generation timed out or was cancelled.");
            const profile = attempts[attempt];
            const selected = profile ? await resolveServerModel({ providerId: "cryzo", modelId: profile.id }) : initial;
            const abort = new AbortController();
            const signal = AbortSignal.any([totalSignal, abort.signal]);
            let committed = false, text = "", firstTokenMs: number | undefined;
            const buffered: UIMessageChunk[] = [];
            const firstTokenTimer = setTimeout(() => abort.abort(new Error("Model did not produce text in time.")), 45_000);
            try {
              const result = streamText({
                model: selected.model, system, messages: modelMessages, tools,
                abortSignal: signal, maxRetries: 0, maxOutputTokens: outputLimit,
                timeout: { totalMs: 180_000, chunkMs: 30_000 }, stopWhen: stepCountIs(6),
                prepareStep: async ({ messages: stepMessages, steps }) => {
                  if (!managed || !profile || !runId) return {};
                  let incurred = 0;
                  for (const step of steps) {
                    const reported = step.providerMetadata?.openrouter?.usage as { cost?: number } | undefined;
                    incurred += reported?.cost ?? (await openRouterClient().generations.getGeneration({ id: step.response.id! }, { timeoutMs: 5000 })).data.totalCost;
                  }
                  const bytes = Buffer.byteLength(system + JSON.stringify(stepMessages) + JSON.stringify(tools ?? {})) + (hasImages ? 16_000 : 0);
                  if (bytes + outputLimit > profile.context) throw new Error("Connected action results exceed this model's context.");
                  await convex.mutation(api.aiUsage.extendReservation, { serviceKey, runId,
                    maxCostMicros: Math.ceil((incurred + bytes * profile.inputCost + outputLimit * profile.outputCost + profile.requestCost) * 1_000_000) });
                  return {};
                },
              });
              const reader = result.toUIMessageStream({
                sendStart: false, sendFinish: false, sendReasoning: false,
                onError: error => safeError(error),
              }).getReader();
              while (true) {
                const next = await readStreamPart(reader, signal);
                if (next.done) break;
                const part = next.value;
                if (part.type === "error") throw new Error(part.errorText);
                if (part.type === "text-delta") text += part.delta;
                const visible = (part.type === "text-delta" && part.delta.trim().length > 0) || part.type.startsWith("tool-");
                if (!committed && visible) {
                  committed = true;
                  firstTokenMs = Date.now() - started;
                  clearTimeout(firstTokenTimer);
                  writer.write({ type: "data-generation", data: { requestId, requestedModelId: initial.modelId, actualModelId: selected.modelId,
                    actualModelName: profile?.name ?? selected.modelId, fallbackUsed: selected.modelId !== initial.modelId, status: "streaming" } });
                  for (const chunk of buffered) writer.write(chunk);
                  buffered.length = 0;
                }
                if (committed) writer.write(part);
                else buffered.push(part);
              }
              clearTimeout(firstTokenTimer);
              const reason = await result.finishReason;
              if (signal.aborted || !text.trim() || reason === "error" || reason === "length") throw new Error("The model did not finish a complete response.");
              const steps = await result.steps;
              let cost = 0;
              const generationIds: string[] = [];
              for (const step of steps) {
                const generationId = step.response.id;
                if (generationId) generationIds.push(generationId);
                const usage = step.providerMetadata?.openrouter?.usage as { cost?: number } | undefined;
                if (managed) {
                  if (typeof usage?.cost === "number" && Number.isFinite(usage.cost)) cost += usage.cost;
                  else if (generationId) {
                    const record = await openRouterClient().generations.getGeneration({ id: generationId }, { timeoutMs: 10_000 });
                    cost += record.data.totalCost;
                  } else throw new Error("Usage verification failed.");
                }
              }
              const telemetry = { requestedModel: initial.modelId, actualModel: selected.modelId, generationIds,
                providerRoutes: steps.map(step => step.providerMetadata?.openrouter?.provider ?? null),
                reportedCost: cost, firstTokenMs: firstTokenMs ?? null, durationMs: Date.now() - started, finishReason: reason,
                usage: await result.totalUsage, fallback: selected.modelId !== initial.modelId };
              if (totalSignal.aborted) throw new Error("Generation was cancelled.");
              await settle(true, Math.ceil(cost * 1_000_000), { actualModel: selected.modelId, generationId: generationIds.at(-1), telemetry });
              completed = true;
              const config = parseCloudConfig(text);
              if (config) {
                await authenticated.mutation(api.cloudAdmin.configureFromPublish, {
                  conversationId, name: config.name ?? "Cryzo app",
                  entities: (config.entities ?? []).filter(entity => entity.name).map(entity => ({
                    name: entity.name!, fields: entity.fields, access: entity.access,
                  })), authProviders: (config.auth?.providers ?? []).filter((provider): provider is "password" | "google" => provider === "password" || provider === "google"),
                }).catch(error => console.warn("[chat/cloud-config]", safeError(error)));
              }
              console.info("[chat/complete]", JSON.stringify({ requestId, ...telemetry, cost }));
              writer.write({ type: "data-generation", data: { requestId, actualModelId: selected.modelId, actualModelName: profile?.name ?? selected.modelId,
                fallbackUsed: selected.modelId !== initial.modelId, costMicros: Math.ceil(cost * 1_000_000), status: "completed" } });
              writer.write({ type: "finish", finishReason: "stop" });
              return;
            } catch (error) {
              clearTimeout(firstTokenTimer);
              abort.abort();
              lastError = error;
              if (profile) markModelUnhealthy(profile.id);
              console.warn("[chat/attempt-failed]", JSON.stringify({ requestId, attempt, model: selected.modelId, committed, error: safeError(error) }));
              // Never replay a partial answer or a potentially executed tool.
              if (committed || totalSignal.aborted) throw error;
              writer.write({ type: "data-generation", data: { requestId, status: "retrying", requestedModelId: initial.modelId } });
            }
          }
          throw lastError ?? new Error("No healthy model is available.");
        } finally {
          if (!completed) await settle(false).catch(error => console.error("[chat/release]", safeError(error)));
        }
      },
      onError: () => `The model could not finish this response. No AI allowance was charged. Your prompt and completed files are preserved. Retry or select another model. Reference: ${requestId}`,
    });
    return createUIMessageStreamResponse({ stream, headers: {
      "x-cryzo-request-id": requestId, "x-cryzo-model-id": initial.modelId,
      ...(sessionId ? { "x-composio-session-id": sessionId } : {}),
      ...(cloudAppId ? { "x-cryzo-cloud-app-id": cloudAppId } : {}),
    } });
  } catch (error) {
    await settle(false).catch(() => {});
    const message = safeError(error);
    console.error("[chat/start-error]", JSON.stringify({ requestId, message }));
    const status = /credits|starter_required/.test(message) ? 402 : /already|running/.test(message) ? 409 : 400;
    return Response.json({ error: message, requestId }, { status });
  }
}

