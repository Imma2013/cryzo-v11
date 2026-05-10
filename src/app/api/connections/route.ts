import { Composio } from "@composio/core";

let composio: Composio | undefined;

function getComposio() {
  composio ??= new Composio();
  return composio;
}

export const dynamic = "force-dynamic";

type ToolkitConnectionState = {
  slug: string;
  name: string;
  logo?: string;
  isNoAuth: boolean;
  connection?: {
    isActive: boolean;
    connectedAccount?: {
      id: string;
    };
  };
};

function proxiedLogoUrl(logo?: string) {
  if (!logo) return undefined;

  return `/api/connections/logo?url=${encodeURIComponent(logo)}`;
}

export async function GET() {
  const session = await getComposio().create("user_123");
  const { items } = await session.toolkits({ limit: 50 });

  return Response.json({
    toolkits: (items as ToolkitConnectionState[])
      .filter((t) => !t.isNoAuth)
      .map((t) => ({
        slug: t.slug,
        name: t.name,
        logoUrl: proxiedLogoUrl(t.logo),
        isConnected: t.connection?.isActive ?? false,
        connectedAccountId: t.connection?.connectedAccount?.id,
      })),
  });
}

export async function POST(req: Request) {
  const { toolkit }: { toolkit: string } = await req.json();
  const origin = new URL(req.url).origin;
  const session = await getComposio().create("user_123");
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: origin + "/connections",
  });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
