import { reasoningConfig } from "@/lib/ai/reasoning-config";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getProvider } from "@/lib/ai/models";
import { getManagedModel } from "@/lib/ai/managed-models";
import { resolveAccountProviderSecret } from "@/lib/server/provider-secrets";
import { managedCatalog } from "@/lib/server/openrouter";

export type ServerModelRequest = {
  providerId?: string;
  modelId?: string;
  credentialMode?: "cryzo" | "device" | "account";
  modelApiKey?: string;
  modelBaseUrl?: string;
  authToken?: string;
};

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1/",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  deepseek: "https://api.deepseek.com/v1",
  mistral: "https://api.mistral.ai/v1",
  together: "https://api.together.xyz/v1",
  cerebras: "https://api.cerebras.ai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  moonshotai: "https://api.moonshot.ai/v1",
};

function cryzoHeaders() {
  return {
    "HTTP-Referer": "https://www.cryzo.me",
    "X-Title": "Cryzo",
  };
}

async function resolveManagedCryzoModel(requestedModel?: string) {
  const definition = getManagedModel(requestedModel);
  if (requestedModel && requestedModel !== definition.id && requestedModel !== "cryzo/kimi-k3") throw new Error("This model is no longer supported. Choose another model.");
  const managed = (await managedCatalog()).find(model => model.id === definition.id);
  if (!managed) throw new Error("This model is unavailable. Choose another model.");
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const provider = createOpenRouter({
    apiKey,
    headers: cryzoHeaders(),
  });

  return {
    model: provider.chat(managed.upstreamModel, {
      usage: { include: true },
      ...(managed.reasoning ? { reasoning: reasoningConfig(managed.reasoningOptions) } : {}),
      extraBody: { provider: { allow_fallbacks: true } },
    }),
    providerId: "cryzo",
    modelId: managed.id,
    upstreamModelId: managed.upstreamModel,
    billingTier: managed.tier,
    usesCryzoCredits: managed.tier === "premium",
    creditMultiplier: managed.creditMultiplier,
    minimumPlan: managed.minimumPlan ?? "free",
    supportsTools: Boolean(managed.toolCall),
    profile: managed,
  } as const;
}

export async function resolveServerModel(request: ServerModelRequest) {
  const providerId = request.providerId?.trim() || "cryzo";
  const requestedModel = request.modelId?.trim();

  if (providerId === "ollama" || providerId === "lmstudio") {
    throw new Error("Local providers must run directly in the browser");
  }

  if (providerId === "cryzo") {
    return resolveManagedCryzoModel(requestedModel);
  }

  const definition = getProvider(providerId);
  let apiKey = request.modelApiKey?.trim() || "";
  let baseURL =
    request.modelBaseUrl?.trim() ||
    PROVIDER_BASE_URLS[providerId] ||
    definition.defaultBaseURL ||
    "";

  if (request.credentialMode === "account") {
    if (!request.authToken?.trim()) {
      throw new Error("Your Cryzo session is required to use an account-saved API key");
    }
    const saved = await resolveAccountProviderSecret(
      request.authToken.trim(),
      providerId,
    );
    if (!saved) {
      throw new Error(`No saved ${definition.name} API key was found on your Cryzo account`);
    }
    apiKey = saved.apiKey;
    baseURL = saved.baseURL?.trim() || baseURL;
  }

  if (!baseURL) {
    throw new Error(`Enter a base URL for ${definition.name}`);
  }
  if (!apiKey && providerId !== "custom") {
    throw new Error(`Enter or save an API key for ${definition.name}`);
  }
  if (!requestedModel) {
    throw new Error(`Choose a ${definition.name} model`);
  }

  const provider = createOpenAI({
    baseURL,
    apiKey: apiKey || "not-required",
    headers:
      providerId === "openrouter"
        ? {
            "HTTP-Referer": "https://www.cryzo.me",
            "X-Title": "Cryzo",
          }
        : undefined,
  });

  return {
    model: provider.chat(requestedModel),
    providerId,
    modelId: requestedModel,
    upstreamModelId: requestedModel,
    billingTier: "byok" as const,
    usesCryzoCredits: false,
    creditMultiplier: 0,
    minimumPlan: "free" as const,
    supportsTools: true,
    profile: undefined,
  };
}

