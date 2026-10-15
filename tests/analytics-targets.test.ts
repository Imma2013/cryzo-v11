import { describe, expect, it, vi } from "vitest";
import { analyticsTargets } from "@/lib/server/social-targets";
describe("analytics reporting targets", () => {
  it("accepts numeric LinkedIn organization URNs and excludes unrelated identities", async () => {
    expect(await analyticsTargets("linkedin", vi.fn(async () => ({ data: { elements: [
      { organization: "urn:li:organization:123", "organization~": { localizedName: "Example" } },
      { organization: "urn:li:person:456" },
    ] } })))).toEqual([{ id: "urn:li:organization:123", name: "Example" }]);
  });
  it("paginates managed Facebook Pages without returning Page access tokens", async () => {
    const execute = vi.fn(async (_slug, args) => ({ data: {
      data: [{ id: args.after ? "2" : "1", name: args.after ? "Second" : "First", access_token: "private" }],
      ...(args.after ? {} : { paging: { next: "https://graph.example.test/next", cursors: { after: "cursor" } } }),
    } }));
    expect(await analyticsTargets("facebook", execute)).toEqual([{ id: "1", name: "First" }, { id: "2", name: "Second" }]);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
