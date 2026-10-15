import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { resolveAccountProviderSecret } from "@/lib/server/provider-secrets";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { requireRequestUserId } from "@/lib/server/request-user";
import {
  beginMcpOAuth,
  encodeMcpOauthState,
} from "@/lib/server/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(req: Request) {
  try {
    const authToken = bearer(req);
    const userId = await requireRequestUserId(req);
    if (!authToken || !userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { serverId?: string };
    const serverId = body.serverId?.trim();
    if (!serverId) {
      return Response.json({ error: "MCP server is required." }, { status: 400 });
    }

    const server = await fetchQuery(
      (api as any).mcpServers.get,
      { serverId: serverId as any },
      { token: authToken },
    );
    if (!server) {
      return Response.json({ error: "MCP server not found." }, { status: 404 });
    }

    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/mcp/oauth/callback`;
    const saved = await resolveAccountProviderSecret(authToken, "mcp:" + serverId);
    let configured;
    try { configured = saved?.apiKey ? JSON.parse(saved.apiKey) : undefined; } catch { /* legacy bearer */ }
    const oauth = await beginMcpOAuth(server.url, redirectUri, configured);
    const state = encodeMcpOauthState({
      issuer: oauth.issuer, issuerRequired: oauth.issuerRequired, scope: oauth.scope,
      serverId,
      userId,
      authToken,
      verifier: oauth.verifier,
      redirectUri,
      tokenEndpoint: oauth.tokenEndpoint,
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      tokenEndpointAuthMethod: oauth.tokenEndpointAuthMethod,
      resource: oauth.resource,
      createdAt: Date.now(),
    });

    const nonce = randomBytes(24).toString("base64url");
    const authorizationUrl = new URL(oauth.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", oauth.clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", nonce);
    authorizationUrl.searchParams.set("code_challenge", oauth.challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    if (oauth.scope) authorizationUrl.searchParams.set("scope", oauth.scope);
    if (oauth.resource) authorizationUrl.searchParams.set("resource", oauth.resource);

    const response = NextResponse.json({ authorizationUrl: authorizationUrl.toString() });
    response.cookies.set("__Host-cryzo_mcp_oauth", JSON.stringify({ nonce, state }), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start MCP OAuth.";
    return Response.json({ error: message }, { status: 400 });
  }
}