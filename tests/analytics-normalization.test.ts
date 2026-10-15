import { describe, expect, it } from "vitest";
import { analyticsData, deliveryPostIds, normalizeGraph, normalizeLinkedIn, normalizeYouTube } from "@/lib/server/social-analytics";
import { analyticsTargets } from "@/lib/server/social-targets";
describe("provider analytics", () => {
  it("weights average view duration by views, rather than summing it", () => {
    const result = normalizeYouTube({ data: { columnHeaders: [{ name: "day" }, { name: "views" }, { name: "averageViewDuration" }],
      rows: [["2026-10-01", 10, 20], ["2026-10-02", 30, 40]] } });
    expect(result.metrics.find(metric => metric.key === "views")?.value).toBe(40);
    expect(result.metrics.find(metric => metric.key === "averageViewDuration")).toMatchObject({ value: 35, aggregation: "weighted-average", unit: "seconds" });
  });
  it("distinguishes unique daily reach, additive events and follower snapshots", () => {
    const values = [{ end_time: "2026-10-01", value: 10 }, { end_time: "2026-10-02", value: 20 }];
    const result = normalizeGraph({ data: { data: [
      { name: "reach", values }, { name: "views", values }, { name: "page_follows", values }, { name: "likes", total_value: { value: 0 } }, { name: "missing", values: [] },
    ] } });
    expect(result.metrics.find(metric => metric.key === "reach")).toMatchObject({ value: 20, aggregation: "latest" });
    expect(result.metrics.find(metric => metric.key === "views")?.value).toBe(30);
    expect(result.metrics.find(metric => metric.key === "page_follows")).toMatchObject({ value: 20, window: "snapshot" });
    expect(result.metrics.find(metric => metric.key === "likes")?.value).toBe(0);
    expect(result.metrics.some(metric => metric.key === "missing")).toBe(false);
  });
  it("does not double count nested LinkedIn totals or sum engagement ratios", () => {
    const result = normalizeLinkedIn({ data: { elements: [
      { totalShareStatistics: { impressionCount: 50, engagement: 0.3, uniqueImpressionsCount: 30 }, timeRange: { start: 1790812800000 } },
      { totalShareStatistics: { impressionCount: 75, engagement: 0.5 }, timeRange: { start: 1790899200000 } },
    ] } });
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0].value).toBe(125);
    expect(result.series[0].points).toHaveLength(2);
  });
  it("matches post IDs to their actual connected account", () => {
    const posts = [{ deliveries: [
      { channel: "x", connectedAccountId: "a", status: "published", remotePostId: "1" },
      { channel: "x", connectedAccountId: "b", status: "published", remotePostId: "2" },
      { channel: "x", status: "published", remotePostId: "3" },
      { channel: "x", connectedAccountId: "a", status: "failed", remotePostId: "4" },
    ] }];
    expect(deliveryPostIds(posts, "x", "a")).toEqual(["1"]);
  });
  it("paginates managed Pages without returning access tokens or choosing the first", async () => {
    const calls: Record<string, unknown>[] = [];
    const targets = await analyticsTargets("facebook", async (_slug, args) => {
      calls.push(args);
      return { data: args.after ? { data: [{ id: "2", name: "Second" }] } : {
        data: [{ id: "1", name: "First", access_token: "must-not-return" }], paging: { next: "ignored", cursors: { after: "next" } },
      } };
    });
    expect(calls).toHaveLength(2);
    expect(targets).toEqual([{ id: "1", name: "First" }, { id: "2", name: "Second" }]);
    expect(analyticsData({ data: { data: [], paging: { next: "n" } } }).paging.next).toBe("n");
  });
});
