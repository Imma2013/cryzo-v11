import { PROVIDERS } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

const MODELS_URL = "https://models.dev/api.json";

type CatalogModel = {
  id?: string;
  name?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  structured_output?: boolean;
  release_date?: string;
  last_updated?: string;
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
};

type CatalogProvider = {
  id?: string;
  name?: string;
  api?: string;
  env?: string[];
  models?: Record<string, CatalogModel>;
};

function normalizeProvider(providerId: string, provider: CatalogProvider) {
  const models = Object.entries(provider.models || {})
    .map(([modelId, model]) => ({
      id: model.id || modelId,
      name: model.name || modelId,
      reasoning: Boolean(model.reasoning),
      toolCall: Boolean(model.tool_call),
      attachments: Boolean(model.attachment),
      structuredOutput: Boolean(model.structured_output),
      releaseDate: model.release_date || null,
      lastUpdated: model.last_updated || null,
      context: model.limit?.context || null,
      output: model.limit?.output || null,
      inputCost: model.cost?.input ?? null,
      outputCost: model.cost?.output ?? null,
    }))
    .sort((a, b) => {
      const dateA = a.lastUpdated || a.releaseDate || "";
      const dateB = b.lastUpdated || b.releaseDate || "";
      return dateB.localeCompare(dateA) || a.name.localeCompare(b.name);
    });

  return {
    id: providerId,
    name: provider.name || providerId,
    api: provider.api || null,
    env: provider.env || [],
    models,
  };
}

export async function GET() {
  try {
    const response = await fetch(MODELS_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 30 },
    });
    if (!response.ok) {
      throw new Error(`models.dev returned ${response.status}`);
    }
    const catalog = (await response.json()) as Record<string, CatalogProvider>;
    const providers: Record<string, ReturnType<typeof normalizeProvider>> = {};

    for (const definition of PROVIDERS) {
      if (!definition.catalogId) continue;
      const provider = catalog[definition.catalogId];
      if (!provider) continue;
      providers[definition.id] = normalizeProvider(definition.id, provider);
    }

    return Response.json({
      source: MODELS_URL,
      fetchedAt: Date.now(),
      providers,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load model catalog",
        providers: {},
      },
      { status: 502 },
    );
  }
}
