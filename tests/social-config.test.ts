import { afterEach, describe, expect, it } from "vitest";
import {
  SOCIAL_TOOLKITS,
  composioSocialSessionOptions,
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
  it("supports every Marketing network", () => {
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
