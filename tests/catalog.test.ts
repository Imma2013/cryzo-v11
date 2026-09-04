import { describe, expect, it } from "vitest";
import { paginateApps, type CatalogApp } from "../src/lib/catalog-pagination";

const apps: CatalogApp[] = Array.from({ length: 564 }, (_, i) => ({
  slug: "app-" + i, name: "App " + String(i).padStart(3, "0"),
  description: i % 2 ? "Marketing toolkit" : "Development toolkit",
  available: true, isConnected: i === 520,
  categories: [{ id: i % 2 ? "marketing" : "development", name: i % 2 ? "Marketing" : "Development" }],
}));

describe("live catalog pagination", () => {
  it("walks every page without truncating to a curated set", () => {
    let cursor: string | null = "0";
    const slugs: string[] = [];
    do {
      const result = paginateApps(apps, new URLSearchParams({ cursor }));
      expect(result.items.length).toBeLessThanOrEqual(60);
      expect(result.totalItems).toBe(564);
      slugs.push(...result.items.map(item => item.slug));
      cursor = result.nextCursor;
    } while (cursor);
    expect(new Set(slugs).size).toBe(564);
    expect(slugs[0]).toBe("app-520");
  });
  it("searches the entire catalog before pagination", () => {
    const result = paginateApps(apps, new URLSearchParams({ query: "App 563" }));
    expect(result.items.map(item => item.slug)).toEqual(["app-563"]);
  });
  it("combines category and connection filters", () => {
    const result = paginateApps(apps, new URLSearchParams({ category: "development", connection: "connected" }));
    expect(result.totalItems).toBe(1);
    expect(result.items[0].slug).toBe("app-520");
  });
  it("handles invalid cursors and empty search results", () => {
    expect(paginateApps(apps, new URLSearchParams({ cursor: "-20" })).items).toHaveLength(60);
    expect(paginateApps(apps, new URLSearchParams({ query: "absent" })).nextCursor).toBeNull();
  });
});
