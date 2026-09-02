"use client";

import { useMemo, useState } from "react";
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

const LOBE_ALIASES: Record<string, string> = {
  anthropic: "claude",
  claude: "claude",
  google: "gemini",
  googlegemini: "gemini",
  gemini: "gemini",
  xai: "xai",
  "x-ai": "xai",
  mistralai: "mistral",
  mistral: "mistral",
  togetherai: "together",
  together: "together",
  moonshotai: "kimi",
  moonshot: "kimi",
  kimi: "kimi",
  minimaxai: "minimax",
  minimax: "minimax",
  "meta-llama": "meta",
  meta: "meta",
  qwen: "qwen",
  deepseek: "deepseek",
  microsoft: "microsoft",
  cohere: "cohere",
  nvidia: "nvidia",
  cerebras: "cerebras",
  groq: "groq",
  openai: "openai",
  openrouter: "openrouter",
  ollama: "ollama",
  lmstudio: "lmstudio",
  zai: "zhipu",
  "z-ai": "zhipu",
  zhipu: "zhipu",
  "01-ai": "yi",
  zerooneai: "yi",
};

type LogoTreatment = "color" | "dark" | "monochrome" | "raw";

type LogoCandidate = {
  src: string;
  treatment: LogoTreatment;
};

const LOBE_SVG_CDN =
  "https://unpkg.com/@lobehub/icons-static-svg@1.94.0/icons";
const LOBE_PNG_CDN =
  "https://unpkg.com/@lobehub/icons-static-png@1.94.0";

function modelsDevLogoUrl(id: string) {
  return `https://models.dev/logos/${encodeURIComponent(id)}.svg`;
}

function lobeSlug(id: string) {
  const normalized = id.trim().toLowerCase();
  return LOBE_ALIASES[normalized] || normalized;
}

function logoCandidates(id?: string): LogoCandidate[] {
  if (!id) return [];
  const slug = lobeSlug(id);
  const encodedSlug = encodeURIComponent(slug);
  return [
    {
      src: `${LOBE_SVG_CDN}/${encodedSlug}-color.svg`,
      treatment: "color",
    },
    {
      src: `${LOBE_PNG_CDN}/dark/${encodedSlug}.png`,
      treatment: "dark",
    },
    {
      src: `${LOBE_SVG_CDN}/${encodedSlug}.svg`,
      treatment: "monochrome",
    },
    {
      src: modelsDevLogoUrl(id),
      treatment: "raw",
    },
  ];
}

function BrandImageCandidateList({
  candidates,
  fallback,
  size,
}: {
  candidates: LogoCandidate[];
  fallback: string;
  size: number;
}) {
  const [{ index, loaded }, setState] = useState({
    index: 0,
    loaded: false,
  });
  const candidate = candidates[index];

  return (
    <>
      <span
        className={`absolute inset-0 flex items-center justify-center ${loaded ? "invisible" : ""}`}
      >
        {fallback}
      </span>
      {candidate && (
        <img
          src={candidate.src}
          alt=""
          width={Math.max(16, size - 6)}
          height={Math.max(16, size - 6)}
          className={`relative z-10 block max-h-full max-w-full object-contain ${candidate.treatment === "monochrome" ? "brightness-0 invert" : ""} ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() =>
            setState((current) => ({ ...current, loaded: true }))
          }
          onError={() =>
            setState((current) => ({
              index: current.index + 1,
              loaded: false,
            }))
          }
        />
      )}
    </>
  );
}

function BrandImage({
  id,
  fallback,
  size,
}: {
  id?: string;
  fallback: string;
  size: number;
}) {
  const candidates = useMemo(() => logoCandidates(id), [id]);
  const candidateKey = candidates
    .map((candidate) => `${candidate.treatment}:${candidate.src}`)
    .join("|");

  return (
    <BrandImageCandidateList
      key={candidateKey}
      candidates={candidates}
      fallback={fallback}
      size={size}
    />
  );
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
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] font-semibold tracking-tight text-zinc-400"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <BrandImage id={id} fallback={fallback} size={size} />
    </span>
  );
}

function providerLogoId(provider: ProviderDefinition) {
  if (provider.id === "cryzo") return undefined;
  return provider.logoSlug || provider.catalogId || provider.id;
}

function modelLabId(provider: ProviderDefinition, modelId: string) {
  if (provider.id === "cryzo") {
    return getManagedModel(modelId).logoProviderId;
  }

  if (provider.id === "openrouter" && modelId.includes("/")) {
    const prefix = modelId.split("/")[0].trim().toLowerCase();
    const aliases: Record<string, string> = {
      "z-ai": "zhipu",
      zai: "zhipu",
      google: "gemini",
      meta: "meta",
      "meta-llama": "meta",
      anthropic: "claude",
      openai: "openai",
      mistralai: "mistral",
      microsoft: "microsoft",
      cohere: "cohere",
      qwen: "qwen",
      deepseek: "deepseek",
      moonshotai: "kimi",
      minimax: "minimax",
      minimaxai: "minimax",
      nvidia: "nvidia",
      "x-ai": "xai",
      xai: "xai",
      "01-ai": "yi",
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
