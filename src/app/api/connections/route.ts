import { Composio } from "@composio/core";
import {
  INITIAL_APP_CONNECTIONS,
  SELECTED_COMPOSIO_APPS,
  SELECTED_COMPOSIO_APP_SLUGS,
} from "@/lib/composio-apps";
import {
  getCachedConnections,
  invalidateConnectionsCache,
  setCachedConnections,
} from "@/lib/composio-connection-cache";

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

async function fetchSelectedToolkits(session: Awaited<ReturnType<Composio["create"]>>) {
  try {
    const result = await session.toolkits({
      toolkits: SELECTED_COMPOSIO_APP_SLUGS,
      limit: SELECTED_COMPOSIO_APP_SLUGS.length,
    });
    return result.items;
  } catch (error) {
    console.warn("Failed to fetch selected Composio toolkits in one request", error);
  }

  const batches = await Promise.allSettled(
    SELECTED_COMPOSIO_APP_SLUGS.map((slug) =>
      session.toolkits({ toolkits: [slug], limit: 1 }),
    ),
  );

  return batches.flatMap((batch) =>
    batch.status === "fulfilled" ? batch.value.items : [],
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const forceRefresh = searchParams.get("refresh") === "1";

  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const cached = getCachedConnections(userId);
  if (!forceRefresh && cached) {
    return Response.json(cached);
  }

  const session = await getComposio().create(userId);
  const items = await fetchSelectedToolkits(session);
  const bySlug = new Map(items.map((toolkit: any) => [toolkit.slug, toolkit]));

  const result = {
    toolkits: SELECTED_COMPOSIO_APPS.map((app) => {
      const toolkit = bySlug.get(app.slug) as any | undefined;

      if (!toolkit || toolkit.isNoAuth) {
        return {
          ...INITIAL_APP_CONNECTIONS.find((item) => item.slug === app.slug)!,
          logo: fallbackLogo(app.domain),
        };
      }

      return {
        slug: app.slug,
        name: toolkit.name || app.name,
        logo: proxiedLogo(toolkit.logo) ?? fallbackLogo(app.domain),
        isConnected: toolkit.connection?.isActive ?? false,
        connectedAccountId: toolkit.connection?.connectedAccount?.id,
        available: true,
      };
    }),
  };

  setCachedConnections(userId, result);
  return Response.json(result);
}

export async function POST(req: Request) {
  const { toolkit, userId }: { toolkit: string; userId?: string } =
    await req.json();
  const origin = new URL(req.url).origin;

  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  invalidateConnectionsCache(userId);
  const session = await getComposio().create(userId);
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: origin + "/chat/apps",
  });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
