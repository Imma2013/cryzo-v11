import { createVercelDeployment, type PublishFile } from "@/lib/publish/server";

export const dynamic = "force-dynamic";

type VercelPublishRequest = {
  token: string;
  projectName: string;
  files: PublishFile[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VercelPublishRequest;
    if (!body.token) return Response.json({ error: "Missing Vercel token" }, { status: 400 });

    const result = await createVercelDeployment(body);
    return Response.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vercel publish failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
