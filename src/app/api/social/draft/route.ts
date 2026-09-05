import { generateText } from "ai";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { resolveServerModel } from "@/lib/server/model-provider";
import { managedCandidates, openRouterClient } from "@/lib/server/openrouter";
import { DEFAULT_MANAGED_MODEL_ID } from "@/lib/ai/managed-models";
import { transientProviderFailure } from "@/lib/ai/request-intent";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });
  const serviceKey = process.env.CRYZO_INTERNAL_API_SECRET;
  let runId: Id<"aiRuns"> | undefined;
  let settled = false;
  try {
    if (!serviceKey) throw new Error("AI drafting is not configured.");
    const user = await fetchQuery(api.users.currentUser, {}, { token });
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
    const { prompt, channels, conversationId, requestKey, history } = await req.json();
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000 || typeof requestKey !== "string") throw new Error("Describe the post you want.");
    const project = await fetchQuery(api.conversations.get, { id: conversationId }, { token });
    if (!project) throw new Error("Project not found.");
    const balance = await fetchQuery(api.aiUsage.balance, {}, { token });
    const modelId = balance.plan === "free" ? DEFAULT_MANAGED_MODEL_ID : "cryzo/minimax-m3";
    const candidates = await managedCandidates(modelId, false, false);
    const system = "You are Cryzo Marketing. Draft social copy for human review. Never claim to have published anything. No fabricated facts, URLs or results. Return only the post copy.";
    const safeHistory = Array.isArray(history) ? history.slice(-8).filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").map(item => `${item.role}: ${item.content.slice(0, 2000)}`).join("\n") : "";
    const accounts = await fetchQuery(api.social.listAccounts, {}, { token });
    const input = "Project context: " + project.title + "\nConnected accounts: " + accounts.map(account => `${account.channel}:${account.name}`).join(", ") +
      "\nNetworks: " + (Array.isArray(channels) ? channels.join(", ") : "") + (safeHistory ? "\nConversation:\n" + safeHistory : "") + "\nRequest: " + prompt;
    const maxCostMicros = Math.ceil(Math.max(...candidates.map(model => (system.length + input.length) * model.inputCost + 8192 * model.outputCost + model.requestCost)) * 1_000_000);
    runId = await fetchMutation(api.aiUsage.reserve, { conversationId, requestKey: "social:" + requestKey, modelId,
      freeModel: balance.plan === "free", maxCostMicros, serviceKey }, { token });
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(150_000)]);
    for (const [attempt, candidate] of [candidates[0], candidates[0]].entries()) {
      try {
        const selected = await resolveServerModel({ providerId: "cryzo", modelId: candidate.id });
        const result = await generateText({ model: selected.model, system, prompt: input,
          maxOutputTokens: Math.min(8192, candidate.output), maxRetries: 0,
          abortSignal: AbortSignal.any([signal, AbortSignal.timeout(35000)]) });
        const text = result.text.trim();
        if (!text || result.finishReason === "length" || result.finishReason === "error") throw new Error("No complete draft returned.");
        const reported = result.providerMetadata?.openrouter?.usage as { cost?: number } | undefined;
        const cost = reported?.cost ?? (await openRouterClient().generations.getGeneration({ id: result.response.id }, { timeoutMs: 5000 })).data.totalCost;
        if (!Number.isFinite(cost) || cost < 0) throw new Error("Unable to verify usage.");
        if (signal.aborted) throw new Error("Draft generation cancelled.");
        await fetchMutation(api.aiUsage.settle, { serviceKey, runId, success: true, costMicros: Math.ceil(cost * 1_000_000),
          actualModel: candidate.id, generationId: result.response.id,
          telemetry: { requestedModel: modelId, actualModel: candidate.id, usage: result.usage, finishReason: result.finishReason, reportedCost: cost } });
        settled = true;
        return Response.json({ text, requestId, actualModel: candidate.name, fallbackUsed: false,
          proposal: { content: text, channels: Array.isArray(channels) ? channels : [], requiresConfirmation: true } });
      } catch (error) { if (signal.aborted || attempt > 0 || !transientProviderFailure(error)) break; }
    }
    throw new Error("No model completed the draft. Please retry. No AI allowance was charged.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create draft.", requestId }, { status: 502 });
  } finally {
    if (runId && !settled && serviceKey) await fetchMutation(api.aiUsage.settle, { serviceKey, runId, success: false, costMicros: 0 }).catch(() => undefined);
  }
}


