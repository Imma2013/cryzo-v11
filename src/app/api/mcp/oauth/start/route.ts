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
    const oauth = await beginMcpOAuth(server.url, redirectUri);
    const state = encodeMcpOauthState({
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

    const authorizationUrl = new URL(oauth.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", oauth.clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", oauth.challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    if (oauth.resource) authorizationUrl.searchParams.set("resource", oauth.resource);

    return Response.json({ authorizationUrl: authorizationUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start MCP OAuth.";
    return Response.json({ error: message }, { status: 400 });
  }
}