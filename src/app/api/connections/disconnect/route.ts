import { Composio } from "@composio/core";

let composio: Composio | undefined;

function getComposio() {
  composio ??= new Composio();
  return composio;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { connectedAccountId }: { connectedAccountId: string } = await req.json();
  await getComposio().connectedAccounts.delete(connectedAccountId);
  return Response.json({ success: true });
}
