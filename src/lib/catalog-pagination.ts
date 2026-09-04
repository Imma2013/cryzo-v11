import type { AppConnection } from "./composio-apps";

export type CatalogApp = AppConnection & { description: string; categories: { id: string; name: string }[] };

export function paginateApps(apps: CatalogApp[], params: URLSearchParams) {
  const query = (params.get("query") ?? "").trim().toLowerCase().slice(0, 200);
  const category = params.get("category");
  const connection = params.get("connection");
  const filtered = apps.filter(app =>
    (!query || (app.name + " " + app.slug + " " + app.description).toLowerCase().includes(query)) &&
    (!category || app.categories.some(item => item.id === category)) &&
    (connection !== "connected" || app.isConnected) &&
    (connection !== "disconnected" || !app.isConnected)
  ).sort((a, b) => Number(b.isConnected) - Number(a.isConnected) || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  const raw = params.get("cursor") ?? "0";
  const offset = /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;
  const items = filtered.slice(offset, offset + 60);
  const categories = [...new Map(apps.flatMap(app => app.categories).map(item => [item.id, item])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return { items, nextCursor: offset + 60 < filtered.length ? String(offset + 60) : null, totalItems: filtered.length, categories };
}
