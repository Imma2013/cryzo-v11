import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { encryptProviderSecret } from "@/lib/server/provider-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const connections = await fetchQuery(
      (api as any).providerSecrets.list,
      {},
      { token },
    );
    return Response.json({
      configured: Boolean(process.env.CRYZO_SECRETS_KEY?.trim()),
      connections,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load credentials" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as {
      providerId?: string;
      apiKey?: string;
      baseURL?: string;
    };
    const providerId = body.providerId?.trim();
    const apiKey = body.apiKey?.trim();
    if (!providerId || !apiKey) {
      return Response.json({ error: "Provider and API key are required" }, { status: 400 });
    }
    const encrypted = encryptProviderSecret(apiKey);
    await fetchMutation(
      (api as any).providerSecrets.upsert,
      {
        providerId,
        ...encrypted,
        baseUrl: body.baseURL?.trim() || undefined,
      },
      { token },
    );
    return Response.json({ success: true, providerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save credential";
    const status = message.includes("CRYZO_SECRETS_KEY") ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as { providerId?: string };
    const providerId = body.providerId?.trim();
    if (!providerId) {
      return Response.json({ error: "Provider is required" }, { status: 400 });
    }
    await fetchMutation(
      (api as any).providerSecrets.remove,
      { providerId },
      { token },
    );
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to remove credential" },
      { status: 500 },
    );
  }
}
