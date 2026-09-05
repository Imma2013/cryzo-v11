import { getProvider } from "@/lib/ai/models";

const MODELS_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

type CatalogModel = {
  id?: string;
  tool_call?: boolean;
  attachment?: boolean;
  limit?: { context?: number; output?: number };
};

type CatalogProvider = {
  models?: Record<string, CatalogModel>;
};

type Catalog = Record<string, CatalogProvider>;

export type ModelCapabilities = {
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  source: "catalog" | "fallback";
};

let cachedCatalog: { at: number; value: Catalog } | undefined;
let pendingCatalog: Promise<Catalog> | undefined;

async function loadCatalog(): Promise<Catalog> {
  if (cachedCatalog && Date.now() - cachedCatalog.at < CACHE_TTL_MS) {
    return cachedCatalog.value;
  }
  if (pendingCatalog) return pendingCatalog;

  pendingCatalog = fetch(MODELS_URL, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json" },
  })
    .then(async response => {
      if (!response.ok) throw new Error(`Model catalog returned HTTP ${response.status}`);
      const value = (await response.json()) as Catalog;
      cachedCatalog = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pendingCatalog = undefined;
    });

  return pendingCatalog;
}

function fallbackCapabilities(): ModelCapabilities {
  return {
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    supportsTools: true,
    supportsVision: false,
    source: "fallback",
  };
}

function findModel(provider: CatalogProvider | undefined, modelId: string) {
  if (!provider?.models) return undefined;
  if (provider.models[modelId]) return provider.models[modelId];
  return Object.entries(provider.models).find(
    ([key, model]) => key === modelId || model.id === modelId,
  )?.[1];
}

export async function resolveModelCapabilities(
  providerId: string,
  modelId: string,
): Promise<ModelCapabilities> {
  const definition = getProvider(providerId);
  if (!definition.catalogId || !modelId) return fallbackCapabilities();

  try {
    const catalog = await loadCatalog();
    const model = findModel(catalog[definition.catalogId], modelId);
    if (!model) return fallbackCapabilities();

    const contextWindow = Number(model.limit?.context);
    const maxOutputTokens = Number(model.limit?.output);
    return {
      contextWindow:
        Number.isFinite(contextWindow) && contextWindow > 0
          ? contextWindow
          : DEFAULT_CONTEXT_WINDOW,
      maxOutputTokens:
        Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
          ? maxOutputTokens
          : DEFAULT_MAX_OUTPUT_TOKENS,
      supportsTools: model.tool_call !== false,
      supportsVision: Boolean(model.attachment),
      source: "catalog",
    };
  } catch (error) {
    console.warn(
      "[model-capabilities] catalog lookup failed",
      error instanceof Error ? error.message : String(error),
    );
    return fallbackCapabilities();
  }
}
