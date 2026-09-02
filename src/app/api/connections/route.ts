import { Composio } from "@composio/core";
import {
  INITIAL_APP_CONNECTIONS,
  SELECTED_COMPOSIO_APPS,
} from "@/lib/composio-apps";
import {
  getCachedConnections,
  invalidateConnectionsCache,
  setCachedConnections,
} from "@/lib/composio-connection-cache";
import { requireRequestUserId } from "@/lib/server/request-user";

let composio: Composio | null = null;

function getComposio() {
  if (!composio) composio = new Composio();
  return composio;
}

export const dynamic = "force-dynamic";

function proxiedLogo(logo?: string) {
  if (!logo) return undefined;
  return `/api/connections/logo?url=${encodeURIComponent(logo)}`;
}

function fallbackLogo(domain?: string) {
  if (!domain) return undefined;
  return proxiedLogo(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
}

async function fetchAllToolkits(session: Awaited<ReturnType<Composio["create"]>>) {
  const result = await session.toolkits({ limit: 1000 });
  return result.items || [];
}

export async function GET(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const cached = getCachedConnections(userId);
  if (!forceRefresh && cached) return Response.json(cached);

  try {
    const session = await getComposio().create(userId);
    const items = await fetchAllToolkits(session);
    const known = new Map(SELECTED_COMPOSIO_APPS.map((app) => [app.slug, app]));

    const toolkits = items
      .map((toolkit: any) => {
        const fallback = known.get(toolkit.slug);
        const requiresAuth = !toolkit.isNoAuth;
        return {
          slug: toolkit.slug,
          name: toolkit.name || fallback?.name || toolkit.slug,
          domain: fallback?.domain,
          logo: proxiedLogo(toolkit.logo) ?? fallbackLogo(fallback?.domain),
          isConnected: requiresAuth
            ? toolkit.connection?.isActive ?? false
            : true,
          connectedAccountId: toolkit.connection?.connectedAccount?.id,
          available: true,
          requiresAuth,
        };
      })
      .sort((a: any, b: any) => {
        if (a.isConnected !== b.isConnected) return a.isConnected ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const result = {
      toolkits: toolkits.length > 0 ? toolkits : INITIAL_APP_CONNECTIONS,
    };
    setCachedConnections(userId, result);
    return Response.json(result);
  } catch (error) {
    console.error("[connections/catalog]", error);
    return Response.json({ toolkits: INITIAL_APP_CONNECTIONS });
  }
}

export async function POST(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { toolkit }: { toolkit?: string } = await req.json();
  if (!toolkit || toolkit.length > 120) {
    return Response.json({ error: "invalid_toolkit" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  invalidateConnectionsCache(userId);
  const session = await getComposio().create(userId);
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: origin + "/chat/apps",
  });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
