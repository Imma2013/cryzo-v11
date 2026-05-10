import { Composio } from "@composio/core";

const composio = new Composio();

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await composio.create("user_123");
  const { items } = await session.toolkits({ limit: 50 });

  return Response.json({
    toolkits: items
      .filter((t: any) => !t.isNoAuth)
      .map((t: any) => ({
        slug: t.slug,
        name: t.name,
        logo: t.logo,
        isConnected: t.connection?.isActive ?? false,
        connectedAccountId: t.connection?.connectedAccount?.id,
      })),
  });
}

export async function POST(req: Request) {
  const { toolkit }: { toolkit: string } = await req.json();
  const origin = new URL(req.url).origin;
  const session = await composio.create("user_123");
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: origin + "/connections",
  });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
