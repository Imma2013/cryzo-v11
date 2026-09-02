import { Composio } from "@composio/core";
import { invalidateConnectionsCache } from "@/lib/composio-connection-cache";
import { requireRequestUserId } from "@/lib/server/request-user";

let composio: Composio | null = null;

function getComposio() {
  if (!composio) composio = new Composio();
  return composio;
}

export async function POST(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { connectedAccountId }: { connectedAccountId?: string } = await req.json();
  if (!connectedAccountId || connectedAccountId.length > 160) {
    return Response.json({ error: "invalid_connection" }, { status: 400 });
  }

  const session = await getComposio().create(userId);
  const catalog = await session.toolkits({ limit: 1000 });
  const ownsConnection = catalog.items.some(
    (toolkit: any) =>
      toolkit.connection?.connectedAccount?.id === connectedAccountId,
  );
  if (!ownsConnection) {
    return Response.json({ error: "connection_not_found" }, { status: 404 });
  }

  await getComposio().connectedAccounts.delete(connectedAccountId);
  invalidateConnectionsCache(userId);
  return Response.json({ success: true });
}
