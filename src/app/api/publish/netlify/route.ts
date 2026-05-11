import { createNetlifyDeploy, type PublishFile } from "@/lib/publish/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NetlifyPublishRequest = {
  token: string;
  siteId?: string;
  siteName: string;
  files: PublishFile[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NetlifyPublishRequest;
    if (!body.token) return Response.json({ error: "Missing Netlify token" }, { status: 400 });

    const result = await createNetlifyDeploy(body);
    return Response.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Netlify publish failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
