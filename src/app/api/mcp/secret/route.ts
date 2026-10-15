import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { mcpCredentialHeaders } from "@/lib/server/mcp-config";
import { encryptProviderSecret } from "@/lib/server/provider-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(req: Request) {
  try {
    const token = bearer(req);
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await req.json()) as { serverId?: string; secret?: string; headerName?: string; headerPrefix?: string; oauthClientId?: string; oauthClientSecret?: string };
    const serverId = body.serverId?.trim();
    const secret = body.secret?.trim();
    if (!serverId || (!secret && !body.oauthClientId?.trim())) {
      return Response.json({ error: "Server and credential are required." }, { status: 400 });
    }
    const server = await fetchQuery(
      (api as any).mcpServers.get,
      { serverId: serverId as any },
      { token },
    );
    if (!server) return Response.json({ error: "MCP server not found." }, { status: 404 });

    const credential = body.oauthClientId?.trim()
      ? { client_id: body.oauthClientId.trim(), client_secret: body.oauthClientSecret?.trim() || undefined,
          token_endpoint_auth_method: body.oauthClientSecret?.trim() ? "client_secret_basic" : "none" }
      : { access_token: secret, header_name: body.headerName?.trim() || "Authorization", header_prefix: body.headerPrefix };
    if ("access_token" in credential) mcpCredentialHeaders(credential);
    const encrypted = encryptProviderSecret(JSON.stringify(credential));
    await fetchMutation(
      (api as any).providerSecrets.upsert,
      {
        providerId: `mcp:${serverId}`,
        ...encrypted,
      },
      { token },
    );
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save MCP credential.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const token = bearer(req);
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await req.json()) as { serverId?: string };
    const serverId = body.serverId?.trim();
    if (!serverId) return Response.json({ error: "Server is required." }, { status: 400 });
    await fetchMutation(
      (api as any).providerSecrets.remove,
      { providerId: `mcp:${serverId}` },
      { token },
    );
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove MCP credential.";
    return Response.json({ error: message }, { status: 400 });
  }
}
