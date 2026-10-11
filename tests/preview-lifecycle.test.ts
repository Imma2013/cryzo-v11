import { describe, expect, it } from "vitest";
import { canReuseLivePreview } from "@/lib/workspace/preview-lifecycle";

describe("Safari tab background lifecycle", () => {
  it("preserves the server, URL and iframe after a healthy focus event", () => {
    expect(canReuseLivePreview({ previewUrl: "/preview/5173", hasProcess: true, filesystemHealthy: true })).toBe(true);
  });
  it("restarts only when the server, files or URL have been lost", () => {
    expect(canReuseLivePreview({ previewUrl: "/preview/5173", hasProcess: false, filesystemHealthy: true })).toBe(false);
    expect(canReuseLivePreview({ previewUrl: "/preview/5173", hasProcess: true, filesystemHealthy: false })).toBe(false);
    expect(canReuseLivePreview({ previewUrl: null, hasProcess: true, filesystemHealthy: true })).toBe(false);
  });
});
