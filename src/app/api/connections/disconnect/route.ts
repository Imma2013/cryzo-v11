import { Composio } from "@composio/core";
import { invalidateConnectionsCache } from "@/lib/composio-connection-cache";

let composio: Composio | null = null;

function getComposio() {
  if (!composio) composio = new Composio();
  return composio;
}

export async function POST(req: Request) {
  const { connectedAccountId, userId }: { connectedAccountId: string; userId?: string } =
    await req.json();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await getComposio().connectedAccounts.delete(connectedAccountId);
  invalidateConnectionsCache(userId);
  return Response.json({ success: true });
}
