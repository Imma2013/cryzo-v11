export type ManagedModelTier = "free" | "premium";

export type ManagedModelDefinition = {
  id: string;
  name: string;
  providerName: string;
  logoProviderId: string;
  upstreamProvider: "openrouter";
  upstreamModel: string;
  tier: ManagedModelTier;
  creditMultiplier: number;
  minimumPlan?: "free" | "starter";
  reasoning?: boolean;
  toolCall?: boolean;
  multimodal?: boolean;
  description: string;
  badge?: string;
};

// Managed routes keep the upstream model and provider visible. Credit weights
// are relative request weights, not token-price claims.
export const CRYZO_MANAGED_MODELS: ManagedModelDefinition[] = [
  {
    id: "cryzo/minimax-m3",
    name: "MiniMax M3",
    providerName: "MiniMax via OpenRouter",
    logoProviderId: "minimax",
    upstreamProvider: "openrouter",
    upstreamModel: "minimax/minimax-m3",
    tier: "premium",
    creditMultiplier: 1,
    minimumPlan: "free",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Fast managed coding and design with tool support.",
    badge: "1x credits",
  },
  {
    id: "cryzo/ling-3-flash-free",
    name: "Ling 3 Flash",
    providerName: "InclusionAI via OpenRouter",
    logoProviderId: "inclusionai",
    upstreamProvider: "openrouter",
    upstreamModel: "inclusionai/ling-3.0-flash:free",
    tier: "free",
    creditMultiplier: 0,
    minimumPlan: "free",
    reasoning: true,
    toolCall: true,
    description: "Free OpenRouter route; provider availability and limits can change.",
    badge: "Free",
  },
  {
    id: "cryzo/nemotron-3.5-lightning-free",
    name: "Nemotron 3.5 Lightning",
    providerName: "NVIDIA via OpenRouter",
    logoProviderId: "nvidia",
    upstreamProvider: "openrouter",
    upstreamModel: "nvidia/nemotron-3.5-lightning:free",
    tier: "free",
    creditMultiplier: 0,
    minimumPlan: "free",
    reasoning: true,
    toolCall: true,
    description: "Free high-throughput NVIDIA route with tool support.",
    badge: "Free",
  },
  {
    id: "cryzo/nemotron-3-ultra-free",
    name: "Nemotron 3 Ultra",
    providerName: "NVIDIA via OpenRouter",
    logoProviderId: "nvidia",
    upstreamProvider: "openrouter",
    upstreamModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    tier: "free",
    creditMultiplier: 0,
    minimumPlan: "free",
    reasoning: true,
    toolCall: true,
    description: "Free long-context NVIDIA route; it can be rate-limited.",
    badge: "Free",
  },
  {
    id: "cryzo/openai-gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    providerName: "OpenAI via OpenRouter",
    logoProviderId: "openai",
    upstreamProvider: "openrouter",
    upstreamModel: "openai/gpt-5.6-luna",
    tier: "premium",
    creditMultiplier: 1,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Fast, cost-efficient coding and lightweight agentic work.",
    badge: "1x credits",
  },
  {
    id: "cryzo/google-gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    providerName: "Google via OpenRouter",
    logoProviderId: "google",
    upstreamProvider: "openrouter",
    upstreamModel: "google/gemini-3.8-flash",
    tier: "premium",
    creditMultiplier: 2,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Responsive multimodal coding and multi-step workflows.",
    badge: "2x credits",
  },
  {
    id: "cryzo/openai-gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    providerName: "OpenAI via OpenRouter",
    logoProviderId: "openai",
    upstreamProvider: "openrouter",
    upstreamModel: "openai/gpt-5.6-sol",
    tier: "premium",
    creditMultiplier: 3,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Flagship OpenAI coding and complex agentic workflows.",
    badge: "3x credits",
  },
  {
    id: "cryzo/xai-grok-4.6",
    name: "Grok 4.6",
    providerName: "xAI via OpenRouter",
    logoProviderId: "xai",
    upstreamProvider: "openrouter",
    upstreamModel: "x-ai/grok-4.6",
    tier: "premium",
    creditMultiplier: 3,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Frontier xAI model for coding, knowledge work, and STEM.",
    badge: "3x credits",
  },
  {
    id: "cryzo/openai-gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    providerName: "OpenAI via OpenRouter",
    logoProviderId: "openai",
    upstreamProvider: "openrouter",
    upstreamModel: "openai/gpt-5.6-terra",
    tier: "premium",
    creditMultiplier: 4,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Balanced high-capability coding and long-context reasoning.",
    badge: "4x credits",
  },
  {
    id: "cryzo/anthropic-claude-sonnet-5",
    name: "Claude Sonnet 5",
    providerName: "Anthropic via OpenRouter",
    logoProviderId: "anthropic",
    upstreamProvider: "openrouter",
    upstreamModel: "anthropic/claude-sonnet-5",
    tier: "premium",
    creditMultiplier: 4,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Strong coding, agents, and professional knowledge work.",
    badge: "4x credits",
  },
  {
    id: "cryzo/moonshot-kimi-k3",
    name: "Kimi K3",
    providerName: "Moonshot AI via OpenRouter",
    logoProviderId: "moonshotai",
    upstreamProvider: "openrouter",
    upstreamModel: "moonshotai/kimi-k3",
    tier: "premium",
    creditMultiplier: 5,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Long-horizon coding, repository navigation, and debugging.",
    badge: "5x credits",
  },
  {
    id: "cryzo/anthropic-claude-opus-5",
    name: "Claude Opus 5",
    providerName: "Anthropic via OpenRouter",
    logoProviderId: "anthropic",
    upstreamProvider: "openrouter",
    upstreamModel: "anthropic/claude-opus-5",
    tier: "premium",
    creditMultiplier: 8,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Flagship Anthropic model for demanding long-horizon work.",
    badge: "8x credits",
  },
  {
    id: "cryzo/anthropic-claude-fable-5.1",
    name: "Claude Fable 5.1",
    providerName: "Anthropic via OpenRouter",
    logoProviderId: "anthropic",
    upstreamProvider: "openrouter",
    upstreamModel: "anthropic/claude-fable-5.1",
    tier: "premium",
    creditMultiplier: 12,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Highest-cost Anthropic route for complex autonomous builds.",
    badge: "12x credits",
  },
];

export const DEFAULT_MANAGED_MODEL_ID = "cryzo/minimax-m3";

export function normalizeManagedModelId(modelId?: string | null) {
  const id = modelId?.trim();
  return (
    CRYZO_MANAGED_MODELS.find((model) => model.id === id)?.id ||
    DEFAULT_MANAGED_MODEL_ID
  );
}

export function getManagedModel(modelId?: string | null) {
  const id = normalizeManagedModelId(modelId);
  return (
    CRYZO_MANAGED_MODELS.find((model) => model.id === id) ||
    CRYZO_MANAGED_MODELS[0]
  );
}

