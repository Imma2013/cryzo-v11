import { Composio } from "@composio/core";
import { requireRequestUserId } from "@/lib/server/request-user";
import { invalidateConnectionsCache } from "@/lib/composio-connection-cache";
import { paginateApps, type CatalogApp } from "@/lib/catalog-pagination";
import { socialAuthConfig } from "@/lib/server/composio-social";

let composio: Composio | null = null;
function getComposio() { return composio ??= new Composio(); }
export const dynamic = "force-dynamic";
type Toolkit = { slug: string; name: string; no_auth?: boolean;
  meta?: { logo?: string; description?: string; categories?: { id?: string; slug?: string; name: string }[] } };
let cache: { items: Toolkit[]; expires: number; staleUntil: number } | undefined;
let pending: Promise<Toolkit[]> | undefined;

// Shared metadata is cached; connection identities are fetched for the authenticated user only.
async function catalog(): Promise<Toolkit[]> {
  if (cache && cache.expires > Date.now()) return cache.items;
  if (pending) return pending;
  pending = (async () => {
    try {
      const key = process.env.COMPOSIO_API_KEY;
      if (!key) throw new Error("Apps are not configured.");
      const all = new Map<string, Toolkit>(), seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const params = new URLSearchParams({ limit: "1000", sort_by: "alphabetically", managed_by: "all" });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch("https://backend.composio.dev/api/v3.1/toolkits?" + params, {
          headers: { "x-api-key": key }, signal: AbortSignal.timeout(15000), cache: "no-store",
        });
        if (!response.ok) throw new Error("The app catalog is temporarily unavailable.");
        const data = await response.json() as { items: Toolkit[]; next_cursor?: string };
        if (!Array.isArray(data.items)) throw new Error("Invalid app catalog response.");
        for (const item of data.items) all.set(item.slug, item);
        cursor = data.next_cursor || undefined;
        if (cursor && seen.has(cursor)) throw new Error("App catalog pagination stalled.");
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (!all.size) throw new Error("The app catalog returned no apps.");
      const items = [...all.values()];
      cache = { items, expires: Date.now() + 60_000, staleUntil: Date.now() + 300_000 };
      return items;
    } catch (error) {
      if (cache && cache.staleUntil > Date.now()) return cache.items;
      throw error;
    } finally { pending = undefined; }
  })();
  return pending;
}

export async function GET(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await catalog();
    const accounts = new Map<string, string>(), seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const result = await getComposio().connectedAccounts.list({ userIds: [userId], statuses: ["ACTIVE"], limit: 100, cursor });
      for (const account of result.items) accounts.set(account.toolkit.slug, account.id);
      cursor = result.nextCursor || undefined;
      if (cursor && seen.has(cursor)) throw new Error("Connection pagination stalled.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    const apps: CatalogApp[] = items.map(item => ({
      slug: item.slug, name: item.name, description: item.meta?.description ?? "",
      categories: (item.meta?.categories ?? []).map(category => ({ id: category.id ?? category.slug ?? category.name, name: category.name })),
      logo: item.meta?.logo ? "/api/connections/logo?url=" + encodeURIComponent(item.meta.logo) : undefined,
      requiresAuth: !item.no_auth, available: true,
      isConnected: accounts.has(item.slug), connectedAccountId: accounts.get(item.slug),
    }));
    const result = paginateApps(apps, new URL(req.url).searchParams);
    return Response.json({ ...result, toolkits: result.items });
  } catch (error) {
    console.warn("[connections/catalog]", error instanceof Error ? error.message : "Catalog unavailable");
    return Response.json({ error: "Unable to load apps. Please retry.", items: [], nextCursor: null, totalItems: 0 }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { toolkit, returnTo }: { toolkit?: string; returnTo?: string } = await req.json();
  if (!toolkit || toolkit.length > 120) {
    return Response.json({ error: "invalid_toolkit" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  invalidateConnectionsCache(userId);
  const social = socialAuthConfig(toolkit);
  if (social && !social.id) return Response.json({
    error: `${toolkit} is awaiting its Cryzo OAuth approval. Configure ${social.environmentName} in Vercel after creating the auth config in Composio.`,
  }, { status: 503 });
  const connectionRequest = social?.id
    ? await getComposio().connectedAccounts.link(userId, social.id, {
        callbackUrl: origin + (returnTo && /^\/chat\/[a-zA-Z0-9]+$/.test(returnTo) ? returnTo : "/chat/apps"),
      })
    : await (await getComposio().create(userId)).authorize(toolkit, {
    callbackUrl: origin + (returnTo && /^\/chat\/[a-zA-Z0-9]+$/.test(returnTo) ? returnTo : "/chat/apps"),
      });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
