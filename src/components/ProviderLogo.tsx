import type { ProviderDefinition } from "@/lib/ai/models";

const FALLBACK_MARKS: Record<string, string> = {
  cryzo: "C",
  moonshotai: "K",
  custom: "<>" ,
  lmstudio: "LM",
  together: "T",
};

export function ProviderLogo({
  provider,
  size = 28,
}: {
  provider: ProviderDefinition;
  size?: number;
}) {
  if (provider.logoSlug) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-white"
        style={{ width: size, height: size }}
      >
        {/* Simple Icons provides monochrome official provider marks. Keeping this
            as a normal img avoids adding a heavy icon package to every build. */}
        <img
          src={`https://cdn.simpleicons.org/${provider.logoSlug}/111111`}
          alt=""
          aria-hidden="true"
          width={Math.max(14, size - 10)}
          height={Math.max(14, size - 10)}
          className="block object-contain"
        />
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-[10px] font-semibold tracking-tight text-zinc-100"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {FALLBACK_MARKS[provider.id] || provider.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
