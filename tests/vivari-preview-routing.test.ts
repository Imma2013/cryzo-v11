import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
// @ts-expect-error The build helper is also executed directly by Node.
import { patchVivariPreview } from "../scripts/vivari-preview-patch.mjs";
const original = readFileSync("node_modules/@vivari/core/dist/assets/sw.js", "utf8");
function worker(source: string, clientUrl = "https://cryzo.test/chat/project") {
  const handlers: Record<string, (event: any) => void> = {};
  const network = vi.fn(async () => Response.json({ network: true }));
  const cache = { match: async () => undefined, put: async () => {} };
  runInNewContext(source, {
    self: {
      location: new URL("https://cryzo.test/sw.js"),
      clients: { get: async () => ({ url: clientUrl, frameType: "top-level" }), matchAll: async () => [] },
      addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler; },
    },
    URL, Request, Response, Headers, TextEncoder, TextDecoder, console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    caches: { open: async () => cache }, fetch: network,
  });
  return {
    async request(path: string) {
      let response: Promise<Response> | undefined;
      handlers.fetch({ request: new Request("https://cryzo.test" + path), clientId: "ide", respondWith: (value: Promise<Response>) => { response = Promise.resolve(value); } });
      return response ? await response : null;
    },
    network,
  };
}
describe("Vivari preview routing and Cryzo APIs", () => {
  it("reproduces the reported Bad preview URL before applying the fix", async () => {
    const response = await worker(original).request("/api/preview/expo/session");
    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Bad preview URL");
  });
  it("leaves both canonical and compatibility APIs to the network", async () => {
    const instance = worker(patchVivariPreview(original, "1.1.1"));
    expect(await instance.request("/api/expo/session")).toBeNull();
    expect(await instance.request("/api/preview/expo/session")).toBeNull();
    expect(await instance.request("/api/preview/expo/t/" + "a".repeat(32))).toBeNull();
  });
  it("lets an existing unpatched worker pass the new session endpoint to the network", async () => {
    const instance = worker(original);
    const response = await instance.request("/api/expo/session");
    expect(await response?.json()).toEqual({ network: true });
    expect(instance.network).toHaveBeenCalled();
  });
  it("still routes a real numeric runtime preview to Vivari", async () => {
    const response = await worker(patchVivariPreview(original, "1.1.1")).request("/preview/8081/");
    // No kernel in this fixture, proving the virtual preview handler was used.
    expect(response).not.toBeNull();
    expect(await response?.text()).not.toContain("Bad preview URL");
  });
  it("preserves a generated app's absolute API requests inside the virtual runtime", async () => {
    const instance = worker(patchVivariPreview(original, "1.1.1"), "https://cryzo.test/preview/8081/");
    const response = await instance.request("/api/my-app-endpoint");
    expect(response).not.toBeNull();
    expect(instance.network).not.toHaveBeenCalled();
  });
  it("fails closed when the pinned worker contract changes", () => {
    expect(() => patchVivariPreview(original, "2.0.0")).toThrow();
    expect(() => patchVivariPreview("", "1.1.1")).toThrow();
  });
});
