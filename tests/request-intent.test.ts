import { describe, expect, it } from "vitest";
import { requestIntent, transientProviderFailure } from "../src/lib/ai/request-intent";

describe("execution intent", () => {
  it.each(["hello", "Hello!", "what model is this", "How does this work?", "thanks", "a bookstore"])("does not execute %s", text => {
    expect(requestIntent(text, "build")).toBe("discuss");
  });
  it.each(["Make a website for a bookstore", "Can you fix the header?", "Add a contact form", "continue"])("builds on %s", text => {
    expect(requestIntent(text, "build")).toBe("build");
  });
  it("never builds in plan mode", () => expect(requestIntent("Build a store", "plan")).toBe("discuss"));
  it("only retries transient errors", () => {
    expect(transientProviderFailure(new Error("429 rate limited"))).toBe(true);
    expect(transientProviderFailure(new Error("401 invalid key"))).toBe(false);
    expect(transientProviderFailure(new Error("400 unsupported reasoning"))).toBe(false);
  });
});
