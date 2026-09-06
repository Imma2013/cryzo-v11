import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_MARKETING_TOOLKITS,
  SOCIAL_TOOLKITS,
  composioSocialSessionOptions,
  isActiveMarketingToolkit,
  socialAuthConfig,
} from "../src/lib/server/composio-social";

const originalLinkedInConfig = process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID;

afterEach(() => {
  if (originalLinkedInConfig === undefined) {
    delete process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID;
  } else {
    process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID = originalLinkedInConfig;
  }
});

describe("social Composio configuration", () => {
  it("keeps every wired social integration available for future re-enabling", () => {
    expect(SOCIAL_TOOLKITS).toEqual([
      "twitter",
      "facebook",
      "instagram",
      "youtube",
      "reddit",
      "tiktok",
      "linkedin",
    ]);
  });

  it("exposes only funded/supported networks in the current Marketing product", () => {
    expect(ACTIVE_MARKETING_TOOLKITS).toEqual([
      "facebook",
      "instagram",
      "youtube",
      "linkedin",
    ]);
    expect(isActiveMarketingToolkit("linkedin")).toBe(true);
    expect(isActiveMarketingToolkit("twitter")).toBe(false);
    expect(isActiveMarketingToolkit("reddit")).toBe(false);
    expect(isActiveMarketingToolkit("tiktok")).toBe(false);
  });

  it("uses the custom LinkedIn auth config and exact connected account", () => {
    process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID = "ac_linkedin";
    expect(socialAuthConfig("linkedin")).toEqual({
      environmentName: "COMPOSIO_LINKEDIN_AUTH_CONFIG_ID",
      id: "ac_linkedin",
    });
    expect(
      composioSocialSessionOptions("linkedin", "ca_linkedin"),
    ).toEqual({
      toolkits: ["linkedin"],
      authConfigs: { linkedin: "ac_linkedin" },
      connectedAccounts: { linkedin: "ca_linkedin" },
    });
  });
});
