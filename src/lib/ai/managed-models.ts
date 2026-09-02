export type ManagedModelTier = "free" | "premium";

export type ManagedModelDefinition = {
  id: string;
  name: string;
  providerName: string;
  logoProviderId: string;
  upstreamProvider: "openrouter" | "nvidia";
  upstreamModel: string;
  tier: ManagedModelTier;
  creditMultiplier: number;
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
    upstreamProvider: "nvidia",
    upstreamModel: "minimaxai/minimax-m3",
    tier: "premium",
    creditMultiplier: 1,
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
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Deeper long-horizon coding and agentic work for complex builds.",
    badge: "Premium",
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
