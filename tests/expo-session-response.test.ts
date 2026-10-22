import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sandbox } from "../src/lib/workspace/sandbox";
let session: typeof import("../src/lib/workspace/expo-phone-session");
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.stubGlobal("window", new EventTarget());
  session = await import("../src/lib/workspace/expo-phone-session");
});
afterEach(async () => { await session.releasePhoneSession("response-test"); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Expo network response handling", () => {
  it("uses the endpoint that bypasses old service workers and never exposes a JSON parser error", async () => {
    const request = vi.fn(async (_url: string, _init?: RequestInit) => new Response("Bad preview URL\n", { status: 400 }));
    vi.stubGlobal("fetch", request);
    const output = vi.fn(), runtime = { setPhoneRelay: vi.fn(async () => {}) } as unknown as Sandbox;
    expect(await session.preparePhoneSession("response-test", runtime, "auth", output)).toBeNull();
    expect(request.mock.calls[0]?.[0]).toBe("/api/expo/session");
    expect(session.phoneSnapshot("response-test").error).toContain("HTTP 400");
    expect(session.phoneSnapshot("response-test").error).not.toMatch(/Unexpected token|not valid JSON/);
    expect(runtime.setPhoneRelay).not.toHaveBeenCalled();
  });
  it("prints the same ready URL as the popover and clears it on disconnect", async () => {
    const deviceUrl = "exps://session.preview.test";
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return Response.json(body.operation === "status" ? { phase: "ready", deviceUrl } : {
        sessionId: "a".repeat(32), producerUrl: "wss://cryzo.test/api/expo/producer",
        publicOrigin: "https://session.preview.test", deviceUrl, expiresAt: Date.now() + 3600000,
      });
    }));
    const output = vi.fn(), runtime = { setPhoneRelay: vi.fn(async () => {}) } as unknown as Sandbox;
    await session.preparePhoneSession("response-test", runtime, "auth", output); await vi.advanceTimersByTimeAsync(0);
    expect(session.phoneSnapshot("response-test").data?.deviceUrl).toBe(deviceUrl);
    expect(output).toHaveBeenCalledWith(expect.stringContaining("Metro waiting on " + deviceUrl));
    await vi.advanceTimersByTimeAsync(12000); expect(output).toHaveBeenCalledTimes(1);
  });
});
