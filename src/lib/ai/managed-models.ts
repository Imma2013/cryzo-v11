export type ManagedModelTier = "free" | "premium";
export type ManagedUpstreamProvider = "openrouter" | "openai" | "anthropic" | "google";
export type ManagedModelDefinition = {
  id: string; name: string; providerName: string; logoProviderId: string;
  upstreamProvider: ManagedUpstreamProvider; upstreamModel: string; tier: ManagedModelTier;
  creditMultiplier: number; minimumPlan: "free" | "starter";
  reasoning?: boolean; toolCall?: boolean; multimodal?: boolean;
  description: string; badge: string;
};

function definition(input: {
  id: string;
  name: string;
  upstreamProvider: ManagedUpstreamProvider;
  upstreamModel: string;
  tier: ManagedModelTier;
  providerName?: string;
  logoProviderId?: string;
  reasoning?: boolean;
  toolCall?: boolean;
  multimodal?: boolean;
}): ManagedModelDefinition {
  const providerName = input.providerName ?? input.upstreamProvider;
  return {
    ...input,
    providerName,
    logoProviderId: input.logoProviderId ?? providerName,
    creditMultiplier: 0,
    minimumPlan: input.tier === "free" ? "free" : "starter",
    description: "",
    badge: input.tier === "free" ? "Free" : "AI allowance",
  };
}

const freeModels = [
  definition({
    id: "cryzo/nemotron-3.5-lightning-free",
    name: "Nemotron 3.5 Lightning",
    upstreamProvider: "openrouter",
    upstreamModel: "nvidia/nemotron-3.5-lightning:free",
    tier: "free",
    providerName: "nvidia",
    logoProviderId: "nvidia",
  }),
  definition({
    id: "cryzo/ling-3-flash-free",
    name: "Ling 3.0 Flash Fin",
    upstreamProvider: "openrouter",
    upstreamModel: "inclusionai/ling-3.0-flash-fin:free",
    tier: "free",
    providerName: "inclusionai",
    logoProviderId: "inclusionai",
  }),
  definition({
    id: "cryzo/nemotron-3-ultra-free",
    name: "Nemotron 3 Ultra",
    upstreamProvider: "openrouter",
    upstreamModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    tier: "free",
    providerName: "nvidia",
    logoProviderId: "nvidia",
  }),
];

const paidModels = [
  definition({
    id: "cryzo/anthropic-claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    upstreamProvider: "anthropic",
    upstreamModel: "claude-sonnet-5-5",
    tier: "premium",
    reasoning: true, toolCall: true, multimodal: true,
  }),
  definition({
    id: "cryzo/anthropic-claude-opus-5.5",
    name: "Claude Opus 5.5",
    upstreamProvider: "anthropic",
    upstreamModel: "claude-opus-5-5",
    tier: "premium",
    reasoning: true, toolCall: true, multimodal: true,
  }),
  definition({
    id: "cryzo/anthropic-claude-fable-5.1",
    name: "Claude Fable 5.1",
    upstreamProvider: "anthropic",
    upstreamModel: "claude-fable-5-1",
    tier: "premium",
    reasoning: true, toolCall: true, multimodal: true,
  }),
  definition({
    id: "cryzo/google-gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    upstreamProvider: "google",
    upstreamModel: "gemini-3.8-flash",
    tier: "premium",
    reasoning: true, toolCall: true, multimodal: true,
  }),
  definition({
    id: "cryzo/openai-gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    upstreamProvider: "openai",
    upstreamModel: "gpt-6.1-sol",
    tier: "premium",
    reasoning: true, toolCall: true, multimodal: true,
  }),
  definition({
    id: "cryzo/openai-gpt-6-astra",
    name: "GPT-6 Astra",
    upstreamProvider: "openai",
    upstreamModel: "gpt-6-astra",
    tier: "premium",
    reasoning: true, toolCall: true, multimodal: true,
  }),
  definition({
    id: "cryzo/openai-gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    upstreamProvider: "openai",
    upstreamModel: "gpt-5.6-terra",
    tier: "premium",
    reasoning: true, toolCall: true, multimodal: true,
  }),
];

export const CRYZO_MANAGED_MODELS = [...freeModels, ...paidModels];
export const MANAGED_PICKER_MODELS = CRYZO_MANAGED_MODELS;
export const DEFAULT_MANAGED_MODEL_ID = "cryzo/nemotron-3.5-lightning-free";

/** Build an OpenRouter-backed definition for the dynamic router catalog. */
export function managedDefinition(upstreamModel: string, name?: string): ManagedModelDefinition {
  const free = upstreamModel.endsWith(":free");
  const lab = upstreamModel.split("/")[0];
  return definition({
    id: `cryzo/router/${upstreamModel}`,
    name: name?.replace(/^[^:]+:\s*/, "").replace(/\s*\(free\)$/i, "") ?? upstreamModel.split("/").slice(1).join("/"),
    upstreamProvider: "openrouter",
    upstreamModel,
    tier: free ? "free" : "premium",
    providerName: lab,
    logoProviderId: lab === "x-ai" ? "xai" : lab,
  });
}

export function normalizeManagedModelId(modelId?: string | null) {
  const aliases: Record<string, string> = {
    "cryzo/kimi-k3": "cryzo/openai-gpt-5.6-terra",
    "cryzo/minimax-m3": DEFAULT_MANAGED_MODEL_ID,
    "cryzo/moonshot-kimi-k3": "cryzo/openai-gpt-5.6-terra",
    "cryzo/openai-gpt-5.6-luna": "cryzo/openai-gpt-5.6-terra",
    "cryzo/openai-gpt-5.6-sol": "cryzo/openai-gpt-6.1-sol",
    "cryzo/google-gemini-3.1-pro-preview": "cryzo/google-gemini-3.8-flash",
    "cryzo/xai-grok-4.6": "cryzo/openai-gpt-5.6-terra",
    "cryzo/anthropic-claude-sonnet-5": "cryzo/anthropic-claude-sonnet-5.5",
    "cryzo/anthropic-claude-opus-5": "cryzo/anthropic-claude-opus-5.5",
  };
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
