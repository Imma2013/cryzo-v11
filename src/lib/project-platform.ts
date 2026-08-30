export type ProjectPlatform = "web" | "ios" | "android";

export const DEFAULT_PROJECT_PLATFORMS: ProjectPlatform[] = ["web"];

export function normalizeProjectPlatforms(
  platforms?: readonly ProjectPlatform[] | null,
): ProjectPlatform[] {
  const unique = Array.from(new Set(platforms || []));
  if (unique.includes("web")) return ["web"];

  const mobile = unique.filter(
    (platform): platform is "ios" | "android" =>
      platform === "ios" || platform === "android",
  );
  return mobile.length > 0 ? mobile : [...DEFAULT_PROJECT_PLATFORMS];
}

export function toggleProjectPlatform(
  current: readonly ProjectPlatform[],
  platform: ProjectPlatform,
): ProjectPlatform[] {
  if (platform === "web") return ["web"];

  const mobile = current.includes("web")
    ? []
    : current.filter(
        (item): item is "ios" | "android" =>
          item === "ios" || item === "android",
      );
  const next = mobile.includes(platform)
    ? mobile.filter((item) => item !== platform)
    : [...mobile, platform];

  return next.length > 0 ? next : [platform];
}

export function inferProjectPlatforms(
  prompt: string,
  selected: readonly ProjectPlatform[] = DEFAULT_PROJECT_PLATFORMS,
  selectionTouched = false,
): ProjectPlatform[] {
  if (selectionTouched) return normalizeProjectPlatforms(selected);

  const text = prompt.toLowerCase();
  const mentionsIos = /\b(ios|iphone|ipad|apple app|app store)\b/.test(text);
  const mentionsAndroid = /\b(android|google play|play store)\b/.test(text);
  const mentionsMobile =
    /\b(mobile app|phone app|native app|react native|expo app|cross[- ]platform app)\b/.test(
      text,
    );
  const mentionsWeb =
    /\b(website|web app|webapp|landing page|browser app|vite|react website)\b/.test(
      text,
    );

  if (mentionsIos && mentionsAndroid) return ["ios", "android"];
  if (mentionsIos) return ["ios"];
  if (mentionsAndroid) return ["android"];
  if (mentionsMobile) return ["ios", "android"];
  if (mentionsWeb) return ["web"];

  return normalizeProjectPlatforms(selected);
}

export function projectPlatformSummary(platforms?: readonly ProjectPlatform[] | null) {
  const normalized = normalizeProjectPlatforms(platforms);
  if (normalized.includes("web")) return "Web";
  if (normalized.length === 2) return "iOS + Android";
  return normalized[0] === "ios" ? "iOS" : "Android";
}
