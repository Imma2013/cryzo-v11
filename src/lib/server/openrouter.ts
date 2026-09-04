import type { ModelReasoning } from "@openrouter/sdk/models";
import { OpenRouter } from "@openrouter/sdk";
import { managedDefinition, CRYZO_MANAGED_MODELS, MANAGED_PICKER_MODELS } from "@/lib/ai/managed-models";

export function openRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return new OpenRouter({ apiKey, httpReferer: "https://www.cryzo.me", appTitle: "Cryzo" });
}

export type ManagedCatalogModel = ReturnType<typeof managedDefinition> & {
  context: number; output: number; inputCost: number; outputCost: number; requestCost: number;
  attachments: boolean; available: boolean; reasoningOptions?: ModelReasoning;
};
let cached: { at: number; models: ManagedCatalogModel[] } | undefined;
let pending: Promise<ManagedCatalogModel[]> | undefined;
const unhealthy = new Map<string, number>();
export function markModelUnhealthy(id: string) { unhealthy.set(id, Date.now() + 120_000); }
export function modelHealthy(id: string) { return (unhealthy.get(id) ?? 0) < Date.now(); }

export async function managedCatalog(): Promise<ManagedCatalogModel[]> {
  if (cached && Date.now() - cached.at < 300_000) return cached.models;
  if (pending) return pending;
  pending = (async () => {
    const pages = await openRouterClient().models.list({ limit: 500, outputModalities: "text" }, { timeoutMs: 15_000 });
    const models: ManagedCatalogModel[] = [];
    for await (const page of pages) {
      for (const model of page.result.data) {
        if (model.id.includes(":batch") || model.id.startsWith("~") || model.id.startsWith("openrouter/")) continue;
        const inputCost = Number(model.pricing.prompt), outputCost = Number(model.pricing.completion);
        if (![inputCost, outputCost].every(n => Number.isFinite(n) && n >= 0)) continue;
        if (model.architecture.outputModalities.length !== 1 || model.architecture.outputModalities[0] !== "text" || (model.contextLength ?? 0) < 16_000) continue;
        if (/guard|moderation|safety|embedding|rerank/i.test(model.id)) continue;
        const definition = managedDefinition(model.id, model.name);
        if (definition.tier === "free" && !CRYZO_MANAGED_MODELS.some(item => item.upstreamModel === model.id && item.tier === "free")) continue;
        const requestCost = Number(model.pricing.request ?? 0);
        if (!Number.isFinite(requestCost) || requestCost < 0) continue;
        if (definition.tier === "free" && inputCost + outputCost + requestCost !== 0) continue;
        models.push({ ...definition, reasoningOptions: model.reasoning, reasoning: model.supportedParameters.includes("reasoning"),
          toolCall: model.supportedParameters.includes("tools"), multimodal: model.architecture.inputModalities.includes("image"),
          attachments: model.architecture.inputModalities.includes("image"),
          context: model.contextLength ?? 16_000, output: model.topProvider.maxCompletionTokens ?? 8192,
          inputCost, outputCost, requestCost, available: true });
      }
    }
    if (!models.length) throw new Error("The managed model catalog is temporarily unavailable.");
    cached = { at: Date.now(), models };
    return models;
  })().finally(() => { pending = undefined; });
  return pending;
}

export async function managedCandidates(id: string, tools: boolean, images: boolean) {
  const models = await managedCatalog();
  const requested = models.find(model => model.id === id);
  if (!requested) throw new Error("This model is unavailable. Choose another model.");
  if (tools && !requested.toolCall) throw new Error("This model does not support connected actions.");
  if (images && !requested.attachments) throw new Error("This model cannot read images. Choose a vision model.");
  return [requested];
}

export async function managedPickerCatalog() {
  const live = await managedCatalog();
  return MANAGED_PICKER_MODELS.flatMap(seed => {
    const model = live.find(item => item.upstreamModel === seed.upstreamModel);
    return model ? [model] : [];
  });
}
