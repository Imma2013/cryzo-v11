export const SOCIAL_TOOLKITS = ["twitter", "facebook", "instagram", "youtube", "reddit", "tiktok", "linkedin"] as const;
export type SocialToolkit = typeof SOCIAL_TOOLKITS[number];

// Marketing currently exposes only the networks we want to actively support.
// The other integrations remain wired so they can be re-enabled without a
// schema migration or reconnect flow.
export const ACTIVE_MARKETING_TOOLKITS = ["facebook", "instagram", "youtube", "linkedin"] as const;
export type ActiveMarketingToolkit = typeof ACTIVE_MARKETING_TOOLKITS[number];

export const ACTIVE_MARKETING_CHANNELS = ["facebook", "instagram", "youtube", "linkedin"] as const;

export const MANAGED_SOCIAL_TOOLKITS = ["facebook", "instagram", "youtube", "reddit", "linkedin"] as const;
export const CUSTOM_SOCIAL_TOOLKITS = ["twitter", "tiktok"] as const;

export function supportsManagedSocialAuth(toolkit: string) {
  return MANAGED_SOCIAL_TOOLKITS.includes(
    toolkit as (typeof MANAGED_SOCIAL_TOOLKITS)[number],
  );
}

export function requiresCustomSocialAuth(toolkit: string) {
  return CUSTOM_SOCIAL_TOOLKITS.includes(
    toolkit as (typeof CUSTOM_SOCIAL_TOOLKITS)[number],
  );
}

export function isActiveMarketingToolkit(toolkit: string) {
  return ACTIVE_MARKETING_TOOLKITS.includes(
    toolkit as (typeof ACTIVE_MARKETING_TOOLKITS)[number],
  );
}

const ENV_NAMES: Record<SocialToolkit, string> = {
  twitter: "COMPOSIO_TWITTER_AUTH_CONFIG_ID",
  facebook: "COMPOSIO_FACEBOOK_AUTH_CONFIG_ID",
  instagram: "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID",
  youtube: "COMPOSIO_YOUTUBE_AUTH_CONFIG_ID",
  reddit: "COMPOSIO_REDDIT_AUTH_CONFIG_ID",
  tiktok: "COMPOSIO_TIKTOK_AUTH_CONFIG_ID",
  linkedin: "COMPOSIO_LINKEDIN_AUTH_CONFIG_ID",
};

export function socialAuthConfig(toolkit: string) {
  if (!SOCIAL_TOOLKITS.includes(toolkit as SocialToolkit)) return null;
  const environmentName = ENV_NAMES[toolkit as SocialToolkit];
  return { environmentName, id: process.env[environmentName]?.trim() || null };
}

export function composioSocialSessionOptions(toolkit: string, connectedAccountId?: string) {
  const auth = socialAuthConfig(toolkit);
  return {
    toolkits: [toolkit],
    ...(auth?.id ? { authConfigs: { [toolkit]: auth.id } } : {}),
    ...(connectedAccountId ? { connectedAccounts: { [toolkit]: connectedAccountId } } : {}),
  };
}
