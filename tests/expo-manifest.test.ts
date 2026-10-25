import {describe, expect, it} from "vitest";
import {inspectExpoManifest} from "../src/lib/server/expo-manifest";
const origin = "https://session.preview.cryzo.me";
const manifest = (url: string, sdkVersion = "58.0.0") => ({launchAsset: {url}, extra: {expoClient: {sdkVersion}}});
describe("Expo native manifest readiness", () => {
  it("resolves SDK 58 relative URLs against the public manifest origin", () => {
    for (const path of ["index.bundle?platform=ios", "/index.bundle?platform=android", origin + "/index.bundle?platform=ios"]) {
      expect(inspectExpoManifest(manifest(path), origin)).toMatchObject({phase: "ready", sdkVersion: "58.0.0", supportedSdk: 58, bundleUrl: new URL(path, origin + "/").href});
    }
  });
  it("reports the scanned-phone incompatibility instead of advertising readiness", () => {
    expect(inspectExpoManifest(manifest("index.bundle", "57.0.0"), origin)).toMatchObject({phase: "error", sdkVersion: "57.0.0"});
    expect(inspectExpoManifest(manifest("index.bundle", "57.0.0"), origin).message).toContain("SDK 58");
    expect(inspectExpoManifest({bundleUrl: "index.bundle"}, origin).phase).toBe("connecting");
  });
  it("rejects foreign origins, credentials, loopback and deceptive prefix matches", () => {
    for (const url of ["http://localhost:8081/index.bundle", "//foreign.test/index.bundle", origin + ".evil.test/index.bundle", "https://a:b@session.preview.cryzo.me/index.bundle", "javascript:alert(1)"])
      expect(inspectExpoManifest(manifest(url), origin).phase).toBe("error");
  });
});
