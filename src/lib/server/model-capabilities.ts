import { getProvider } from "@/lib/ai/models";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

export type ModelCapabilities = {
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  source: "catalog" | "fallback";
};

/**
 * Generation must never wait on the multi-megabyte public model catalog.
 * The picker/catalog routes can load rich metadata independently; the hot
 * request path uses conservative capabilities and lets each provider apply
 * its own native defaults when the exact output limit is unknown.
 */
export async function resolveModelCapabilities(
  providerId: string,
  modelId: string,
): Promise<ModelCapabilities> {
  const definition = getProvider(providerId);
  const normalized = modelId.toLowerCase();

  const supportsVision =
    providerId === "google" ||
    providerId === "anthropic" ||
    providerId === "openai" ||
    providerId === "xai" ||
    /vision|multimodal|gemini|claude|gpt-4o|gpt-5/i.test(normalized);

  return {
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    supportsTools: definition.local ? false : true,
    supportsVision,
    source: "fallback",
  };
}
