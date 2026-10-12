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

/** Decide the application target from user language, not a manual platform selector. */
export function inferProjectPlatforms(
  prompt: string,
  selected: readonly ProjectPlatform[] = DEFAULT_PROJECT_PLATFORMS,
  selectionTouched = false,
): ProjectPlatform[] {
  if (selectionTouched) return normalizeProjectPlatforms(selected); // Legacy conversations.
  const text = prompt.toLowerCase();
  const mentionsIos = /\b(ios|iphone|ipad|apple app|app store|swiftui|swift app|swift)\b/.test(text);
  const mentionsAndroid = /\b(android|google play|play store|jetpack compose|kotlin)\b/.test(text);
  const mobileExplicit = /\b(mobile app|phone app|native app|react native|expo|cross[- ]platform app|ios app|android app|iphone app)\b/.test(text);
  const webExplicit = /\b(website|web app|webapp|landing page|browser app|vite|react website|web site)\b/.test(text);
  if (webExplicit && !mobileExplicit && !/\b(?:ios app|android app|native app|swiftui|kotlin)\b/.test(text)) return ["web"];
  if (mentionsIos && mentionsAndroid) return ["ios", "android"];
  if (mentionsIos) return ["ios"];
  if (mentionsAndroid) return ["android"];
  if (mobileExplicit) return ["ios", "android"];
  if (webExplicit) return ["web"];
  // A request to build an "app" without a web qualifier means a phone app.
  if (/\b(?:make|build|create|develop|design|generate)\b[\s\S]{0,100}\bapp\b|\bapp\b[\s\S]{0,80}\b(?:for|that|to)\b/i.test(text)) return ["ios", "android"];
  return normalizeProjectPlatforms(selected);
}

/** Explicit native languages are recognized, not silently represented as Expo. */
export function requestedNativeLanguage(prompt: string): "swift" | "kotlin" | null {
  if (/\b(swiftui|swift)\b/i.test(prompt)) return "swift";
  if (/\b(kotlin|jetpack compose)\b/i.test(prompt)) return "kotlin";
  return null;
}

export function projectPlatformSummary(platforms?: readonly ProjectPlatform[] | null) {
  const normalized = normalizeProjectPlatforms(platforms);
  if (normalized.includes("web")) return "Web";
  if (normalized.length === 2) return "iOS + Android";
  return normalized[0] === "ios" ? "iOS" : "Android";
}
