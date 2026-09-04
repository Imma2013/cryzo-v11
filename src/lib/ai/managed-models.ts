export type ManagedModelTier = "free" | "premium";
export type ManagedModelDefinition = {
  id: string; name: string; providerName: string; logoProviderId: string;
  upstreamProvider: "openrouter"; upstreamModel: string; tier: ManagedModelTier;
  creditMultiplier: number; minimumPlan: "free" | "starter";
  reasoning?: boolean; toolCall?: boolean; multimodal?: boolean;
  description: string; badge: string;
};

const seeds = [
  ["cryzo/ling-3-flash-free", "Ling 3.0 Flash Fin", "inclusionai/ling-3.0-flash-fin:free"],
  ["cryzo/nemotron-3.5-lightning-free", "Nemotron 3.5 Lightning", "nvidia/nemotron-3.5-lightning:free"],
  ["cryzo/nemotron-3-ultra-free", "Nemotron 3 Ultra", "nvidia/nemotron-3-ultra-550b-a55b:free"],
  ["cryzo/minimax-m3", "MiniMax M3", "minimax/minimax-m3"],
  ["cryzo/openai-gpt-5.6-luna", "GPT-5.6 Luna", "openai/gpt-5.6-luna"],
  ["cryzo/openai-gpt-5.6-sol", "GPT-5.6 Sol", "openai/gpt-5.6-sol"],
  ["cryzo/openai-gpt-5.6-terra", "GPT-5.6 Terra", "openai/gpt-5.6-terra"],
  ["cryzo/google-gemini-3.8-flash", "Gemini 3.8 Flash", "google/gemini-3.8-flash"],
  ["cryzo/xai-grok-4.6", "Grok 4.6", "x-ai/grok-4.6"],
  ["cryzo/moonshot-kimi-k3", "Kimi K3", "moonshotai/kimi-k3"],
  ["cryzo/anthropic-claude-sonnet-5", "Claude Sonnet 5", "anthropic/claude-sonnet-5"],
  ["cryzo/anthropic-claude-opus-5", "Claude Opus 5", "anthropic/claude-opus-5"],
  ["cryzo/anthropic-claude-fable-5.1", "Claude Fable 5.1", "anthropic/claude-fable-5.1"],
] as const;

export function managedDefinition(upstreamModel: string, name?: string): ManagedModelDefinition {
  const seed = seeds.find(item => item[2] === upstreamModel);
  const lab = upstreamModel.split("/")[0];
  const free = upstreamModel.endsWith(":free");
  return {
    id: seed?.[0] ?? `cryzo/router/${upstreamModel}`,
    name: name?.replace(/^[^:]+:\s*/, "").replace(/\s*\(free\)$/i, "") ?? seed?.[1] ?? upstreamModel.split("/").slice(1).join("/"),
    providerName: lab, logoProviderId: lab === "x-ai" ? "xai" : lab,
    upstreamProvider: "openrouter", upstreamModel, tier: free ? "free" : "premium",
    creditMultiplier: 0, minimumPlan: free ? "free" : "starter",
    description: "", badge: free ? "Free" : "AI allowance",
  };
}

export const CRYZO_MANAGED_MODELS = seeds.map(([, name, upstream]) => managedDefinition(upstream, name));
export const DEFAULT_MANAGED_MODEL_ID = "cryzo/ling-3-flash-free";
export function normalizeManagedModelId(modelId?: string | null) {
  const aliases: Record<string, string> = { "cryzo/kimi-k3": "cryzo/moonshot-kimi-k3" };
  const raw = modelId?.trim();
  const id = raw ? aliases[raw] ?? raw : undefined;
  return id && (CRYZO_MANAGED_MODELS.some(model => model.id === id) || /^cryzo\/router\/[^/]+\/.+/.test(id))
    ? id : DEFAULT_MANAGED_MODEL_ID;
}
export function getManagedModel(modelId?: string | null) {
  const id = normalizeManagedModelId(modelId);
  return CRYZO_MANAGED_MODELS.find(model => model.id === id) ??
    managedDefinition(id.slice("cryzo/router/".length));
}

