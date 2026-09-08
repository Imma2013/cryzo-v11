import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { encryptProviderSecret } from "@/lib/server/provider-secrets";
import { assertPublicMcpUrl } from "@/lib/server/mcp-client";
import { decodeMcpOauthState } from "@/lib/server/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectResult(req: Request, status: "connected" | "error", message?: string) {
  const url = new URL("/chat/apps/mcp", new URL(req.url).origin);
  url.searchParams.set("oauth", status);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return Response.redirect(url, 302);
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const oauthError = requestUrl.searchParams.get("error");
  if (oauthError) {
    return redirectResult(
      req,
      "error",
      requestUrl.searchParams.get("error_description") || oauthError,
    );
  }

  try {
    const code = requestUrl.searchParams.get("code")?.trim();
    const stateValue = requestUrl.searchParams.get("state")?.trim();
    if (!code || !stateValue) throw new Error("Missing OAuth code or state.");

    const state = decodeMcpOauthState(stateValue);
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

    return redirectResult(req, "connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP OAuth failed.";
    return redirectResult(req, "error", message);
  }
}