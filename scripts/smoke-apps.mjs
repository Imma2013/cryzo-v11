import { paginateApps } from "../src/lib/catalog-pagination.ts";

const key = process.env.COMPOSIO_API_KEY;
if (!key) throw new Error("Composio server key is required for catalog verification.");
const apps = new Map(), cursors = new Set();
let cursor, expected;
do {
  const params = new URLSearchParams({ limit: "1000", sort_by: "alphabetically", managed_by: "all" });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch("https://backend.composio.dev/api/v3.1/toolkits?" + params, {
    headers: { "x-api-key": key }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Live app catalog returned HTTP " + response.status);
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error("Invalid live app catalog response.");
  expected = data.total_items ?? expected;
  for (const item of data.items) apps.set(item.slug, { slug: item.slug, name: item.name, description: item.meta?.description ?? "", categories: item.meta?.categories ?? [], isConnected: false, available: true });
  cursor = data.next_cursor;
  if (cursor && cursors.has(cursor)) throw new Error("Live app catalog pagination repeated a cursor.");
  if (cursor) cursors.add(cursor);
} while (cursor);
if (!apps.size || (expected && apps.size < expected)) throw new Error("Live catalog was incomplete.");
const all = [...apps.values()];
let loaded = 0, next;
do {
  const page = paginateApps(all, new URLSearchParams(next ? { cursor: next } : {}));
  if (page.items.length > 60) throw new Error("App page exceeds 60 items.");
  loaded += page.items.length;
  next = page.nextCursor;
} while (next);
if (loaded !== apps.size) throw new Error("Show more did not traverse the complete catalog.");
console.log("[apps-smoke]", JSON.stringify({ total: apps.size, pages: Math.ceil(loaded / 60), pageSize: 60, passed: true }));
