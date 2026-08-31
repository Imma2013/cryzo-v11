import type { ProviderDefinition } from "@/lib/ai/models";
import { getManagedModel } from "@/lib/ai/managed-models";

const FALLBACK_MARKS: Record<string, string> = {
  cryzo: "C",
  moonshotai: "K",
  custom: "<>",
  lmstudio: "LM",
  together: "T",
  togetherai: "T",
  openrouter: "OR",
  openai: "OA",
  anthropic: "A",
  google: "G",
  googlegemini: "G",
  minimax: "MM",
  qwen: "Q",
  deepseek: "DS",
};

function modelsDevLogoUrl(id: string) {
  return `https://models.dev/logos/${encodeURIComponent(id)}.svg`;
}

function logoFrame({
  id,
  fallback,
  size,
}: {
  id?: string;
  fallback: string;
  size: number;
}) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 text-[10px] font-semibold tracking-tight text-zinc-200"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute inset-0 flex items-center justify-center">
        {fallback}
      </span>
      {id ? (
        <img
          src={modelsDevLogoUrl(id)}
          alt=""
          width={Math.max(14, size - 9)}
          height={Math.max(14, size - 9)}
          className="relative z-10 block object-contain [filter:brightness(0)_invert(1)]"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}

function providerLogoId(provider: ProviderDefinition) {
  if (provider.id === "cryzo") return undefined;
  return provider.catalogId || provider.id;
}

function modelLabId(provider: ProviderDefinition, modelId: string) {
  if (provider.id === "cryzo") {
    return getManagedModel(modelId).logoProviderId;
  }

  // OpenRouter model IDs normally begin with the model lab, e.g.
  // openai/gpt-5, anthropic/claude, qwen/qwen3. This gives each model row the
  // actual lab mark instead of showing the OpenRouter logo for everything.
  if (provider.id === "openrouter" && modelId.includes("/")) {
    const prefix = modelId.split("/")[0].trim().toLowerCase();
    const aliases: Record<string, string> = {
      "z-ai": "zai",
      google: "google",
      meta: "meta",
      "meta-llama": "meta",
      moonshotai: "moonshotai",
      minimax: "minimax",
    };
    return aliases[prefix] || prefix;
  }

  return providerLogoId(provider);
}

export function ProviderLogo({
  provider,
  size = 28,
}: {
  provider: ProviderDefinition;
  size?: number;
}) {
  const id = providerLogoId(provider);
  const fallback =
    FALLBACK_MARKS[provider.catalogId || provider.id] ||
    FALLBACK_MARKS[provider.id] ||
    provider.name.slice(0, 2).toUpperCase();
  return logoFrame({ id, fallback, size });
}

export function ModelLogo({
  provider,
  modelId,
  size = 28,
}: {
  provider: ProviderDefinition;
  modelId: string;
  size?: number;
}) {
  const id = modelLabId(provider, modelId);
  const fallback =
    FALLBACK_MARKS[id || ""] ||
    (provider.id === "cryzo"
      ? getManagedModel(modelId).providerName.slice(0, 2).toUpperCase()
      : provider.name.slice(0, 2).toUpperCase());
  return logoFrame({ id, fallback, size });
}
