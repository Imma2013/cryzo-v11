import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { encryptProviderSecret } from "@/lib/server/provider-secrets";
import { assertPublicMcpUrl } from "@/lib/server/mcp-client";
import { decodeMcpOauthState } from "@/lib/server/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectResult(req: Request, status: "connected" | "error", message?: string, serverId?: string) {
  const url = new URL("/chat/apps/mcp", new URL(req.url).origin);
  url.searchParams.set("oauth", status);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  if (serverId) url.searchParams.set("serverId", serverId);
  const response = NextResponse.redirect(url, 302);
  response.cookies.set("__Host-cryzo_mcp_oauth", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  try {
    const code = requestUrl.searchParams.get("code")?.trim();
    const nonce = requestUrl.searchParams.get("state")?.trim();
    const raw = req.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("__Host-cryzo_mcp_oauth="))?.split("=").slice(1).join("=");
    const binding = raw ? JSON.parse(decodeURIComponent(raw)) : null;
    if (!nonce || !binding?.nonce || nonce !== binding.nonce) throw new Error("OAuth session did not match. Reconnect from the same browser.");
    const state = decodeMcpOauthState(binding.state);
    if (new URL(state.redirectUri).origin !== requestUrl.origin) throw new Error("OAuth callback origin did not match.");
    const issuer = requestUrl.searchParams.get("iss");
    if ((state.issuerRequired && !issuer) || (issuer && issuer !== state.issuer)) throw new Error("OAuth authorization issuer did not match.");
    const oauthError = requestUrl.searchParams.get("error");
    if (oauthError) throw new Error(oauthError === "access_denied" ? "Authorization was cancelled. You can reconnect." : "The provider rejected authorization.");
    if (!code) throw new Error("Missing OAuth authorization code.");
    await assertPublicMcpUrl(state.tokenEndpoint);

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: state.redirectUri,
      code_verifier: state.verifier,
      client_id: state.clientId,
    });
    if (state.resource) form.set("resource", state.resource);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };
    if (state.clientSecret) {
      if (state.tokenEndpointAuthMethod === "client_secret_basic") {
        headers.Authorization = `Basic ${Buffer.from(`${state.clientId}:${state.clientSecret}`).toString("base64")}`;
      } else if (state.tokenEndpointAuthMethod !== "none") {
        form.set("client_secret", state.clientSecret);
      }
    }

    const response = await fetch(state.tokenEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
      headers,
      body: form,
    });
    const token = (await response.json().catch(() => null)) as
      | {
          access_token?: string;
          refresh_token?: string;
          token_type?: string;
          expires_in?: number;
          scope?: string;
          error?: string;
          error_description?: string;
        }
      | null;
    if (!response.ok || !token?.access_token) {
      throw new Error(
        token?.error_description || token?.error || `OAuth token exchange failed (${response.status}).`,
      );
    }

    const stored = JSON.stringify({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type || "Bearer",
      scope: token.scope,
      expires_at:
        typeof token.expires_in === "number"
          ? Date.now() + Math.max(0, token.expires_in - 30) * 1000
          : undefined,
      token_endpoint: state.tokenEndpoint,
      client_id: state.clientId,
      client_secret: state.clientSecret,
      token_endpoint_auth_method: state.tokenEndpointAuthMethod,
      resource: state.resource,
    });
    const encrypted = encryptProviderSecret(stored);
    await fetchMutation(
      (api as any).providerSecrets.upsert,
      {
        providerId: `mcp:${state.serverId}`,
        ...encrypted,
      },
      { token: state.authToken },
    );

    return redirectResult(req, "connected", undefined, state.serverId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP OAuth failed.";
    return redirectResult(req, "error", message);
  }
}