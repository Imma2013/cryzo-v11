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
    id: "cryzo/free-auto",
    name: "Free Auto",
    providerName: "OpenRouter",
    logoProviderId: "openrouter",
    upstreamProvider: "openrouter",
    upstreamModel: "openrouter/free",
    tier: "free",
    creditMultiplier: 0,
    reasoning: true,
    toolCall: true,
    description: "Rotates across available free models. Unlimited app creation; no message credits.",
    badge: "Free",
  },
  {
    id: "cryzo/minimax-m3",
    name: "MiniMax M3",
    providerName: "MiniMax",
    logoProviderId: "minimax",
    upstreamProvider: "nvidia",
    upstreamModel: "minimaxai/minimax-m3",
    tier: "premium",
    creditMultiplier: 1,
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Long-context coding, design and tool use through Cryzo-managed NVIDIA NIM.",
    badge: "Premium",
  },
  {
    id: "cryzo/kimi-k3",
    name: "Kimi K3",
    providerName: "Moonshot AI",
    logoProviderId: "moonshotai",
    upstreamProvider: "nvidia",
    upstreamModel: "moonshotai/kimi-k3",
    tier: "premium",
    creditMultiplier: 1,
    reasoning: true,
    toolCall: true,
    multimodal: true,
    description: "Long-horizon coding and agentic work through Cryzo-managed NVIDIA NIM.",
    badge: "Premium",
  },
];

export const DEFAULT_MANAGED_MODEL_ID = "cryzo/free-auto";

export function getManagedModel(modelId?: string | null) {
  const id = modelId?.trim() || DEFAULT_MANAGED_MODEL_ID;
  return (
    CRYZO_MANAGED_MODELS.find((model) => model.id === id) ||
    CRYZO_MANAGED_MODELS[0]
  );
}
