export const SOCIAL_TOOLKITS = ["twitter", "facebook", "instagram", "youtube", "reddit", "tiktok"] as const;
export type SocialToolkit = typeof SOCIAL_TOOLKITS[number];

const ENV_NAMES: Record<SocialToolkit, string> = {
  twitter: "COMPOSIO_TWITTER_AUTH_CONFIG_ID",
  facebook: "COMPOSIO_FACEBOOK_AUTH_CONFIG_ID",
  instagram: "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID",
  youtube: "COMPOSIO_YOUTUBE_AUTH_CONFIG_ID",
  reddit: "COMPOSIO_REDDIT_AUTH_CONFIG_ID",
  tiktok: "COMPOSIO_TIKTOK_AUTH_CONFIG_ID",
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
