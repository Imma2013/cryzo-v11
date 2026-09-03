export type ManagedModelTier = "free" | "premium";

export type ManagedModelDefinition = {
  id: string;
  name: string;
  providerName: string;
  logoProviderId: string;
  upstreamProvider: "openrouter" | "nvidia" | "openai";
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

export const CRYZO_MANAGED_MODELS: ManagedModelDefinition[] = [
  {
    id: "cryzo/minimax-m3",
    name: "Cryzo Fast",
    providerName: "Powered by MiniMax M3",
    logoProviderId: "cryzo",
    upstreamProvider: "openrouter",
    upstreamModel: "minimax/minimax-m3",
    tier: "premium",
    creditMultiplier: 1,
    minimumPlan: "free",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Fast, balanced coding and design for everyday builds.",
    badge: "Premium",
  },
  {
    id: "cryzo/kimi-k3",
    name: "Cryzo Max",
    providerName: "Powered by Kimi K3",
    logoProviderId: "cryzo",
    upstreamProvider: "nvidia",
    upstreamModel: "moonshotai/kimi-k3",
    tier: "premium",
    creditMultiplier: 1,
    minimumPlan: "free",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Deeper long-horizon coding and agentic work for complex builds.",
    badge: "Premium",
  },
  {
    id: "cryzo/gpt-5.6-luna",
    name: "Cryzo Luna",
    providerName: "Powered by GPT-5.6 Luna",
    logoProviderId: "cryzo",
    upstreamProvider: "openai",
    upstreamModel: "gpt-5.6-luna",
    tier: "premium",
    creditMultiplier: 1,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Fast, efficient implementation for focused product work.",
    badge: "Starter",
  },
  {
    id: "cryzo/gpt-5.6-terra",
    name: "Cryzo Terra",
    providerName: "Powered by GPT-5.6 Terra",
    logoProviderId: "cryzo",
    upstreamProvider: "openai",
    upstreamModel: "gpt-5.6-terra",
    tier: "premium",
    creditMultiplier: 2,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Balanced agentic coding for demanding, multi-file builds.",
    badge: "Starter",
  },
  {
    id: "cryzo/gpt-5.6-sol",
    name: "Cryzo Sol",
    providerName: "Powered by GPT-5.6 Sol",
    logoProviderId: "cryzo",
    upstreamProvider: "openai",
    upstreamModel: "gpt-5.6-sol",
    tier: "premium",
    creditMultiplier: 4,
    minimumPlan: "starter",
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Highest-reliability reasoning for complex product and architecture work.",
    badge: "Starter",
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
