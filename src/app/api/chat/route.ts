import { providerReasoningOptions } from "@/lib/ai/reasoning-config";
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
import { after } from "next/server";
import { checkpointGenerationStream } from "@/lib/server/background-generation";
import { planWebsiteDesign, auditWebsiteDraft } from "@/lib/server/design-quality";
import { planDatabaseBeforeFrontend, verifiedBackendContext } from "@/lib/server/database-first";
import { isBookOrPublishingRequest, isAutomotiveRequest, mustProvisionCatalog, lockedUserDomainPrompt, offDomainGeneratedPaths } from "@/lib/server/project-intent";
import type { CryzoCloudResources } from "@/lib/ai/cryzo-cloud-resources";
import { CANONICAL_DESIGN_LIBRARY_PATH, getDesignReferenceLibrary, routeDesignReferences } from "@/lib/server/design-reference-library";
import { buildCanonicalDesignPreamble, buildCompiledReferenceBlock } from "@/lib/server/design-guidance";
import { api } from "../../../../convex/_generated/api";
import { resolveServerModel } from "@/lib/server/model-provider";
import { buildProjectMcpTools } from "@/lib/server/mcp-client";
import { classifyCreditCost, describeCreditCharge } from "@/lib/stripe";
import { composioToolCreditCost } from "@/lib/billing/integration-costs";
import {
  buildCryzoSystemPrompt,
  buildPlanPrompt,
} from "@/lib/ai/server-prompt";
import {
  backendRepairPrompt,
  backendRequirementPrompt,
  backendRequirementsFromPrompt,
  missingBackendRequirements,
  parseCryzoCloudResources,
} from "@/lib/ai/cryzo-cloud-resources";
import {
  inferProjectPlatforms,
  normalizeProjectPlatforms,
  type ProjectPlatform,
  requestedNativeLanguage,
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
export const maxDuration = 300; // Vercel bounded background work; checkpoints survive client suspension.

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
      reasoningEffort,
      modelBaseUrl,
      modelApiKey,
      authToken,
      convexAuthToken,
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
      reasoningEffort?: string;
      modelBaseUrl?: string;
      modelApiKey?: string;
      authToken?: string;
      convexAuthToken?: string;
    };

    const mode = chatMode === "plan" ? "plan" : "build";
    const lastUserMsg = messages
      .filter((message) => message.role === "user")
      .pop();
    const lastUserText = messageText(lastUserMsg);
    // Automatic compiler-repair prompts contain the *broken code* (e.g.
    // Vehicle) rather than the actual user's app intent (e.g. bookstore).
    // Recover the last human build request so repairs cannot import the wrong
    // reference subject or skip provisioning the real project database.
    const isAutomaticRepair = /automatic project repair|generated project failed|fix the underlying cause by inspecting/i.test(lastUserText);
    const earlierUserRequests = messages.filter((message) => message.role === "user")
      .map((message) => messageText(message))
      .filter((text) => text.trim() && !/automatic project repair|generated project failed|fix the underlying cause by inspecting/i.test(text));
    const projectIntent = isAutomaticRepair && earlierUserRequests.length
      ? earlierUserRequests[earlierUserRequests.length - 1]
      : lastUserText;
    if (mode === "build" && requestedNativeLanguage(projectIntent) &&
      /\b(build|create|make|develop|implement|generate)\b/i.test(projectIntent)) {
      return Response.json({
        error: "native_toolchain_unavailable",
        message: "SwiftUI and Kotlin native compilation is not yet enabled. Cryzo currently builds previewable iOS/Android apps using Expo + React Native.",
      }, { status: 422 });
    }
    const backendRequirements = backendRequirementsFromPrompt(lastUserText);
    const resolved = await resolveServerModel({
      providerId: modelProvider,
      modelId,
      credentialMode: modelCredentialMode,
      modelApiKey,
      modelBaseUrl,
      authToken,
    });
    const providerOptions = providerReasoningOptions(resolved.providerId, resolved.upstreamModelId, reasoningEffort);

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
    const authenticatedConvex = authedConvexClient(convexAuthToken || authToken);
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

    // Database first: establish and verify Convex tables and sample records
    // before generating any frontend files. Subsequent edits reuse the data.
    let verifiedBackendBlock = "";
    let hasVerifiedBackendEntities = false;
    let confirmedBackendResources: CryzoCloudResources = { entities: [], authProviders: [], functions: [] };
    if (mode === "build" && conversationId && authenticatedConvex && cryzoCloudAppId) {
      try {
        let overview = await authenticatedConvex.query(api.cloudAdmin.getOverview, { conversationId: conversationId as any });
        const modifyingBackend = (backendRequirements.database && /\b(add|create|modify|change|update|new|extend|migrate|seed)\b/i.test(lastUserText)) ||
          /\b(add|create|build|implement)\b[\s\S]{0,70}\b(form|applications?|comments?|reviews?|orders?|favorites?|profiles?|accounts?|bookings?)\b/i.test(lastUserText);
        // An earlier frontend attempt must not prevent database recovery.
        // Infer catalogs even when the request never literally says "database".
        const missingRequiredCatalog = !overview.entities.length &&
          (mustProvisionCatalog(projectIntent) ||
            (isBookOrPublishingRequest(currentProjectContext) && !isAutomotiveRequest(projectIntent)) ||
            /\b(create or repair|create database tables|create.*database first)\b/i.test(lastUserText));
        if ((!overview.entities.length && !currentProjectContext.trim()) || missingRequiredCatalog || modifyingBackend) {
          const existing = overview.entities.map((entity) => ({ name: entity.name, fields: entity.fields, access: entity.access }));
          const planned = await planDatabaseBeforeFrontend({
            model: resolved.model,
            prompt: existing.length
              ? `${projectIntent}\nExisting entities (preserve existing unrelated data): ${JSON.stringify(existing)}`
              : `${projectIntent}\n${isBookOrPublishingRequest(currentProjectContext) ? "Existing project is a BOOKSTORE. Create a Books catalog with realistic seed records, and any other needed publishing/shop tables. Do not create Vehicles, cars, or showroom collections." : ""}`,
          });
          if ((backendRequirements.database || missingRequiredCatalog) && !planned.entities.length && !overview.entities.length) {
            throw new Error("The selected model did not define a valid database schema");
          }
          if (planned.entities.length) {
            const previousCounts = new Map(overview.entities.map((entity) => [entity.name, entity.recordCount]));
            await authenticatedConvex.mutation(api.cloudAdmin.configureFromPublish, {
              conversationId: conversationId as any,
              name: planned.name,
              authProviders: planned.authProviders,
              entities: planned.entities.map((e) => {
                const existingEntity = overview.entities.find((item) => item.name === e.name);
                return {
                  name: e.name,
                  // A follow-up feature may add fields but cannot erase old
                  // schema fields or change access for existing users.
                  fields: { ...((existingEntity?.fields || {}) as Record<string, string>), ...e.fields },
                  access: existingEntity?.access || e.access,
                  seed: existingEntity ? [] : e.seed,
                };
              }),
            });
            overview = await authenticatedConvex.query(api.cloudAdmin.getOverview, { conversationId: conversationId as any });
            for (const entity of planned.entities) {
              const confirmed = overview.entities.find((e) => e.name === entity.name);
              const priorCount = previousCounts.get(entity.name) || 0;
              const requiredCount = previousCounts.has(entity.name) ? priorCount : entity.seed.length;
              if (!confirmed || confirmed.recordCount < requiredCount) {
                throw new Error(`Schema/seed verification failed for ${entity.name}`);
              }
            }
          }
        }
        if (overview.entities.length) {
          hasVerifiedBackendEntities = true;
          confirmedBackendResources = {
            entities: overview.entities.map((e) => ({ name: e.name, fields: e.fields, access: e.access })),
            authProviders: overview.app?.authProviders || ["password"], functions: [],
          };
          verifiedBackendBlock = verifiedBackendContext({
            name: overview.app?.name || "Cryzo app",
            authProviders: confirmedBackendResources.authProviders.filter((p): p is "password" | "google" => p === "password" || p === "google"),
            entities: overview.entities.map((e) => ({ name: e.name, fields: (e.fields || {}) as Record<string, string>, access: e.access, seed: [] })),
          }, cryzoCloudAppId);
          verifiedBackendBlock += `\nVerified live record counts: ${JSON.stringify(overview.entities.map((e) => ({ name: e.name, count: e.recordCount })))}\n`;
        }
      } catch (error) {
        console.error("[Cryzo Cloud] database-first provisioning failed", error);
        return Response.json({ error: "backend_setup_failed", message: error instanceof Error ? error.message : "Database setup failed" }, { status: 422 });
      }
    } else if (mode === "build" && (backendRequirements.database || mustProvisionCatalog(projectIntent)) &&
      (!authenticatedConvex || !cryzoCloudAppId)) {
      return Response.json({
        error: authenticatedConvex ? "backend_unavailable" : "authentication_required",
        message: authenticatedConvex
          ? "Cryzo Cloud could not initialize this app's database. Please retry."
          : "Sign in to create the app database",
      }, { status: authenticatedConvex ? 503 : 401 });
    }

    const syncGeneratedCloudResources = async (text: string) => {
      const resources = parseCryzoCloudResources(text);
      if (!conversationId || !authenticatedConvex) return resources;
      if (!resources.entities.length && !resources.authProviders.length && !resources.name) {
        return resources;
      }
      const authProviders = resources.authProviders.filter(
        (provider): provider is "password" | "google" =>
          provider === "password" || provider === "google",
      );
      try {
        await authenticatedConvex.mutation(api.cloudAdmin.configureFromPublish, {
          conversationId: conversationId as any,
          name: resources.name?.trim() || `Cryzo app ${conversationId.slice(-6)}`,
          entities: (hasVerifiedBackendEntities ? [] : resources.entities).map((entity) => ({
            name: entity.name,
            fields: entity.fields,
            access: entity.access,
          })),
          ...(authProviders.length ? { authProviders } : {}),
        } as any);
      } catch (error) {
        console.warn("Unable to apply generated Cryzo Cloud resources", error);
      }
      return resources;
    };

    // Cryzo V5 selects one canonical visual system for EVERY web build,
    // based on product/industry/design-family signals, not only style words.
    const designIsWeb = resolvedProjectPlatforms.includes("web") && (mode === "build" || mode === "plan");
    const designRouting = designIsWeb ? routeDesignReferences(projectIntent, 8) : null;
    // Some V5 recipes are automotive product templates; a book request must
    // never inherit automotive concepts just to reproduce the reference.
    const requestedBooks = isBookOrPublishingRequest(projectIntent) && !isAutomotiveRequest(projectIntent);
    const selectedPrimaryReference = requestedBooks
      ? ([designRouting?.primary, ...(designRouting?.supporting || [])].filter(Boolean).find((reference) =>
          reference && !/\b(vehicle|car|automotive|motorsport|supercar|hypercar|engine)\b/i.test(reference.profile.visualIntent) &&
          !["cryzo-2", "cryzo-4", "cryzo-5"].includes(reference.slug)) || designRouting?.primary)
      : designRouting?.primary;
    const selectedDesignReference = selectedPrimaryReference
      ? {
          slug: selectedPrimaryReference.slug,
          relativePath: selectedPrimaryReference.relativePath,
          excerpt: selectedPrimaryReference.excerpt,
          markdown: selectedPrimaryReference.markdown,
          profile: selectedPrimaryReference.profile,
          source: selectedPrimaryReference.source,
        }
      : undefined;
    const compiledReferenceBrief = selectedDesignReference
      ? buildCompiledReferenceBlock(selectedDesignReference)
      : "";
    const recipeBlock = selectedDesignReference
      ? buildCanonicalDesignPreamble({
          libraryPath: CANONICAL_DESIGN_LIBRARY_PATH,
          availableReferences: getDesignReferenceLibrary().map((item) => item.slug),
          selectedReferences: [selectedDesignReference],
          selectionSource: designRouting?.selectionSource,
        })
      : "";
    if (designIsWeb) {
      console.info("[Cryzo design] V5 reference routing", {
        primary: selectedPrimaryReference?.slug || "none",
        selectionSource: designRouting?.selectionSource,
        matchedSignals: designRouting?.matchedSignals,
      });
    }

    const modelMessages = await convertToModelMessages(messages);

    if (mode === "plan") {
      const result = streamText({
        model: resolved.model,
        providerOptions,
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

    const mcpBundle = resolved.supportsTools
      ? await buildProjectMcpTools({ authToken, userId }).catch((error) => {
          console.warn("Unable to load MCP tools", error);
          return { tools: {} as Record<string, any>, servers: [] as any[] };
        })
      : { tools: {} as Record<string, any>, servers: [] as any[] };
    const hasMcpTools = Object.keys(mcpBundle.tools).length > 0;
    const mcpPrompt = hasMcpTools
      ? `\n\n## MCP CONNECTORS\nCryzo has enabled MCP tools for this user. Use an MCP tool when it directly helps answer or execute the user's request. Never expose connector credentials, internal tool names, or raw authentication material. Ask before destructive external actions unless the user explicitly requested that action.`
      : "";

    // Faithful V5 layout lock: exact reference execution packet drives the
    // hero, typography, overlap, section order and image relationships.
    let layoutPlan = "";
    if (mode === "build" && selectedPrimaryReference && compiledReferenceBrief && lastUserText.trim()) {
      try {
        layoutPlan = await planWebsiteDesign({
          model: resolved.model,
          prompt: lastUserText,
          primaryReference: selectedPrimaryReference,
          executionPacket: compiledReferenceBrief,
        });
      } catch (error) {
        console.warn("[Cryzo design] V5 layout plan unavailable", error);
      }
    }

    const systemPrompt =
      recipeBlock + "\n\n" +
      buildCryzoSystemPrompt({
        useComposioTools,
        recipeBlock: "",
        projectPlatforms: resolvedProjectPlatforms,
        cryzoCloudAppId,
      }) +
      backendRequirementPrompt(backendRequirements) +
      verifiedBackendBlock +
      currentProjectContext +
      layoutPlan +
      mcpPrompt +
      lockedUserDomainPrompt(projectIntent);

    let responseSessionId = composioSessionId;
    let response: Response;

    if (useComposioTools || hasMcpTools) {
      let tools: Record<string, any> = { ...mcpBundle.tools };
      if (useComposioTools) {
        const client = getComposio();
        const session = await client.create(userId || "anonymous");
        tools = { ...(await session.tools()), ...tools };
        responseSessionId = session.sessionId;
      }

      const result = streamText({
        model: resolved.model,
        providerOptions,
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(12),
        maxRetries: 2,
        onStepFinish: async (step) => {
          if (!userId || !useComposioTools) return;
          const calls = Array.isArray((step as any).toolCalls)
            ? ((step as any).toolCalls as Array<{ toolName?: string }>)
            : [];
          for (const call of calls) {
            if (call.toolName?.startsWith("mcp_")) continue;
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
          await syncGeneratedCloudResources(text || "");
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
          if (hasVerifiedBackendEntities) {
            writer.write({ type: "text-delta", id: textId, delta: `✓ Cryzo Cloud database ready: ${confirmedBackendResources.entities.map((entity) => entity.name).join(", ")}. Building the application against the verified schema.\n\n` });
          }

          let continuationMessages: any[] = [...modelMessages];
          let fullText = "";

          for (let segment = 0; segment < MAX_BUILD_SEGMENTS; segment++) {
            const result = streamText({
              model: resolved.model,
              providerOptions,
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

          let resources = parseCryzoCloudResources(fullText);
          const missing = missingBackendRequirements(backendRequirements, { ...resources, entities: [...confirmedBackendResources.entities, ...resources.entities], authProviders: [...new Set([...confirmedBackendResources.authProviders, ...resources.authProviders])] });
          if (missing.length && cryzoCloudAppId) {
            const repair = streamText({
              model: resolved.model,
              providerOptions,
              system: systemPrompt,
              messages: [
                ...modelMessages,
                { role: "assistant", content: fullText },
                { role: "user", content: backendRepairPrompt(missing) },
              ],
              maxRetries: 2,
            });
            for await (const delta of repair.textStream) {
              fullText += delta;
              writer.write({ type: "text-delta", id: textId, delta });
            }
            resources = parseCryzoCloudResources(fullText);
          }

          // Reference-fidelity audit from V5 (not a generic aesthetic score).
          // One corrective pass preserves V11's streamed code and existing
          // Vivari/Convex execution and avoids unbounded model API costs.
          if (selectedPrimaryReference && compiledReferenceBrief && layoutPlan && fullText.includes("<cryzoArtifact")) {
            try {
              const audit = await auditWebsiteDraft({
                model: resolved.model,
                prompt: lastUserText,
                layoutPlan,
                draft: fullText,
                primaryReference: selectedPrimaryReference,
                executionPacket: compiledReferenceBrief,
              });
              console.info("[Cryzo design] V5 fidelity audit", {
                primary: selectedPrimaryReference.slug,
                verdict: audit.verdict,
                score: audit.score,
              });
              if (audit.verdict === "retry" && audit.critique.length) {
                const revision = streamText({
                  model: resolved.model,
                  providerOptions,
                  system: systemPrompt + `\n\n<design_audit_retry>\nThe draft drifted from the locked ${selectedPrimaryReference.slug} reference. Preserve the exact design execution packet; fix the following:\n${audit.critique.map((c: string) => `- ${c}`).join("\n")}\nDo not output another generic hero/cards/footer layout.\n</design_audit_retry>`,
                  messages: [
                    ...modelMessages,
                    { role: "assistant", content: fullText },
                    { role: "user", content: `Correct the design fidelity problems and retain all working functionality. Emit complete Cryzo file actions for the necessary replacements, not explanations. Make the new composition recognizably faithful to ${selectedPrimaryReference.slug}.` },
                  ],
                  maxRetries: 1,
                });
                for await (const delta of revision.textStream) {
                  fullText += delta;
                  writer.write({ type: "text-delta", id: textId, delta });
                }
              }
            } catch (error) {
              console.warn("[Cryzo design] V5 reference audit unavailable", error);
            }
          }
          if (requestedBooks) {
            const generatedPaths = Array.from(fullText.matchAll(/<cryzoAction\b[^>]*filePath=["']([^"']+)["']/gi), (match) => match[1]);
            const wrongDomain = offDomainGeneratedPaths(projectIntent, generatedPaths);
            if (wrongDomain.length) {
              throw new Error(`Generated code violates bookstore product requirements: ${wrongDomain.slice(0, 8).join(", ")}. Replace the unrelated vehicle/car components with book catalog components.`);
            }
          }
          await syncGeneratedCloudResources(fullText);
          const stillMissing = missingBackendRequirements(backendRequirements, { ...resources, entities: [...confirmedBackendResources.entities, ...resources.entities], authProviders: [...new Set([...confirmedBackendResources.authProviders, ...resources.authProviders])] });
          if (stillMissing.length && cryzoCloudAppId) {
            throw new Error(
              `Cryzo Cloud backend setup is incomplete: ${stillMissing.join(", ")}. Retry this build so Cryzo can finish the backend resources.`,
            );
          }

          writer.write({ type: "text-end", id: textId });
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
      useComposioTools ? "metered" : hasMcpTools ? "mcp" : "0",
    );
    headers.set("x-cryzo-mcp-tools", String(Object.keys(mcpBundle.tools).length));
    if (cryzoCloudAppId) {
      headers.set("x-cryzo-cloud-app-id", cryzoCloudAppId);
    }

    // Keep consuming the model stream in the server after Safari drops its
    // connection; Convex checkpoints permit a new tab to reconnect. This is
    // bounded by Vercel maxDuration, not a guarantee of unlimited compute.
    if (mode === "build" && conversationId && authenticatedConvex && response.body) {
      try {
        const promptId = lastUserMsg?.id || generateId();
        const jobId = await authenticatedConvex.mutation(api.generationJobs.start, {
          conversationId: conversationId as any, promptId,
        });
        const [toBrowser, toCheckpoint] = response.body.tee();
        after(checkpointGenerationStream(toCheckpoint, authenticatedConvex, jobId));
        headers.set("x-cryzo-generation-job", String(jobId));
        return new Response(toBrowser, { status: response.status, statusText: response.statusText, headers });
      } catch (error) {
        console.warn("Could not initialize background generation checkpoint", error);
      }
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
