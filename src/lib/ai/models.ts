import {
  DEFAULT_MANAGED_MODEL_ID,
  getManagedModel,
} from "@/lib/ai/managed-models";

export type CredentialMode = "cryzo" | "device" | "account";

export type ModelSelection = {
  providerId: string;
  modelId: string;
  credentialMode: CredentialMode;
  baseURL?: string;
};

export type ProviderDefinition = {
  id: string;
  name: string;
  catalogId?: string;
  logoSlug?: string;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  defaultBaseURL?: string;
  local?: boolean;
  custom?: boolean;
  native?: "google" | "anthropic";
  description: string;
};

export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  providerId: "cryzo",
  modelId: DEFAULT_MANAGED_MODEL_ID,
  credentialMode: "cryzo",
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "cryzo",
    name: "Cryzo",
    description: "Cryzo-managed premium models. No API key required.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    logoSlug: "openrouter",
    catalogId: "openrouter",
    apiKeyLabel: "OpenRouter API key",
    apiKeyPlaceholder: "sk-or-v1-...",
    defaultBaseURL: "https://openrouter.ai/api/v1",
    description: "Bring your OpenRouter key. BYOK model usage does not consume Cryzo message credits.",
  },
  {
    id: "openai",
    name: "OpenAI",
    logoSlug: "openai",
    catalogId: "openai",
    apiKeyLabel: "OpenAI API key",
    apiKeyPlaceholder: "sk-...",
    defaultBaseURL: "https://api.openai.com/v1",
    description: "Use OpenAI models with your own API key and no Cryzo message-credit charge.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    logoSlug: "anthropic",
    catalogId: "anthropic",
    apiKeyLabel: "Anthropic API key",
    apiKeyPlaceholder: "sk-ant-...",
    defaultBaseURL: "https://api.anthropic.com/v1",
    native: "anthropic",
    description: "Use Claude models with your Anthropic API key.",
  },
  {
    id: "google",
    name: "Google Gemini",
    logoSlug: "googlegemini",
    catalogId: "google",
    apiKeyLabel: "Google AI API key",
    apiKeyPlaceholder: "AIza...",
    defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    native: "google",
    description: "Use Gemini models with a Google AI Studio API key.",
  },
  {
    id: "xai",
    name: "xAI",
    logoSlug: "xai",
    catalogId: "xai",
    apiKeyLabel: "xAI API key",
    defaultBaseURL: "https://api.x.ai/v1",
    description: "Use Grok models through xAI's OpenAI-compatible API.",
  },
  {
    id: "groq",
    name: "Groq",
    logoSlug: "groq",
    catalogId: "groq",
    apiKeyLabel: "Groq API key",
    defaultBaseURL: "https://api.groq.com/openai/v1",
    description: "Use low-latency hosted models through Groq.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    logoSlug: "deepseek",
    catalogId: "deepseek",
    apiKeyLabel: "DeepSeek API key",
    defaultBaseURL: "https://api.deepseek.com/v1",
    description: "Use DeepSeek models with your own key.",
  },
  {
    id: "mistral",
    name: "Mistral",
    logoSlug: "mistralai",
    catalogId: "mistral",
    apiKeyLabel: "Mistral API key",
    defaultBaseURL: "https://api.mistral.ai/v1",
    description: "Use Mistral models with your own key.",
  },
  {
    id: "together",
    name: "Together AI",
    catalogId: "togetherai",
    apiKeyLabel: "Together API key",
    defaultBaseURL: "https://api.together.xyz/v1",
    description: "Use open and commercial models through Together AI.",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    logoSlug: "cerebras",
    catalogId: "cerebras",
    apiKeyLabel: "Cerebras API key",
    defaultBaseURL: "https://api.cerebras.ai/v1",
    description: "Use Cerebras-hosted models with your key.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    logoSlug: "nvidia",
    catalogId: "nvidia",
    apiKeyLabel: "NVIDIA API key",
    apiKeyPlaceholder: "nvapi-...",
    defaultBaseURL: "https://integrate.api.nvidia.com/v1",
    description: "Use NVIDIA-hosted models with your own key.",
  },
  {
    id: "moonshotai",
    name: "Moonshot / Kimi",
    catalogId: "moonshotai",
    apiKeyLabel: "Moonshot API key",
    defaultBaseURL: "https://api.moonshot.ai/v1",
    description: "Use Kimi and Moonshot models with your own key.",
  },
  {
    id: "custom",
    name: "OpenAI-compatible",
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "Optional API key",
    custom: true,
    description: "Connect any OpenAI-compatible /v1 endpoint and enter its model ID.",
  },
  {
    id: "ollama",
    name: "Ollama",
    logoSlug: "ollama",
    defaultBaseURL: "http://127.0.0.1:11434/v1",
    local: true,
    description: "Connect a local Ollama server. Enable CORS for cryzo.me in Ollama.",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    defaultBaseURL: "http://127.0.0.1:1234/v1",
    local: true,
    description: "Connect LM Studio's local OpenAI-compatible server with CORS enabled.",
  },
];

export function getProvider(providerId: string) {
  return PROVIDERS.find((provider) => provider.id === providerId) || PROVIDERS[0];
}

function storageKey(providerId: string, suffix: string) {
  return `cryzo:model-provider:${providerId}:${suffix}`;
}

export function readDeviceProviderKey(providerId: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(storageKey(providerId, "api-key")) || "";
}

export function readSessionProviderKey(providerId: string) {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(storageKey(providerId, "api-key")) || "";
}

export function readRuntimeProviderKey(providerId: string) {
  return readSessionProviderKey(providerId) || readDeviceProviderKey(providerId);
}

export function storeDeviceProviderKey(providerId: string, value: string) {
  if (typeof window === "undefined") return;
  const key = storageKey(providerId, "api-key");
  const trimmed = value.trim();
  if (trimmed) localStorage.setItem(key, trimmed);
  else localStorage.removeItem(key);
}

export function storeSessionProviderKey(providerId: string, value: string) {
  if (typeof window === "undefined") return;
  const key = storageKey(providerId, "api-key");
  const trimmed = value.trim();
  if (trimmed) sessionStorage.setItem(key, trimmed);
  else sessionStorage.removeItem(key);
}

export function clearSessionProviderKey(providerId: string) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(storageKey(providerId, "api-key"));
}

export function readDeviceProviderBaseURL(providerId: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(storageKey(providerId, "base-url")) || "";
}

export function readSessionProviderBaseURL(providerId: string) {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(storageKey(providerId, "base-url")) || "";
}

export function readRuntimeProviderBaseURL(providerId: string) {
  return readSessionProviderBaseURL(providerId) || readDeviceProviderBaseURL(providerId);
}

export function storeDeviceProviderBaseURL(providerId: string, value: string) {
  if (typeof window === "undefined") return;
  const key = storageKey(providerId, "base-url");
  const trimmed = value.trim();
  if (trimmed) localStorage.setItem(key, trimmed);
  else localStorage.removeItem(key);
}

export function storeSessionProviderBaseURL(providerId: string, value: string) {
  if (typeof window === "undefined") return;
  const key = storageKey(providerId, "base-url");
  const trimmed = value.trim();
  if (trimmed) sessionStorage.setItem(key, trimmed);
  else sessionStorage.removeItem(key);
}

export function displayModelName(modelId: string) {
  if (modelId.startsWith("cryzo/")) return getManagedModel(modelId).name;
  const tail = modelId.split("/").pop() || modelId;
  return tail
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
