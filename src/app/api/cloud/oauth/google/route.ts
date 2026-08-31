import { createHmac, timingSafeEqual } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../../convex/_generated/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OAuthState = {
  appId: string;
  returnOrigin: string;
  createdAt: number;
};

function googleClientId() {
  return process.env.CRYZO_GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "";
}

function googleClientSecret() {
  return process.env.CRYZO_GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "";
}

function convexClient() {
  const deployment = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!deployment) throw new Error("Cryzo Cloud is not configured");
  return new ConvexHttpClient(deployment);
}

function normalizeReturnOrigin(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Invalid return origin");
  }
  return parsed.origin;
}

function encodeState(value: OAuthState, secret: string) {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeState(value: string, secret: string): OAuthState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  if (!decoded.appId || !decoded.returnOrigin || Date.now() - decoded.createdAt > 10 * 60 * 1000) {
    throw new Error("OAuth state expired");
  }
  decoded.returnOrigin = normalizeReturnOrigin(decoded.returnOrigin);
  return decoded;
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "unsafe-none",
    },
  });
}

function popupResult(targetOrigin: string, payload: unknown) {
  const safeTarget = JSON.stringify(targetOrigin);
  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  return htmlResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cryzo sign in</title></head><body style="margin:0;background:#0b0b0d;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><p>Finishing sign in…</p><script>try{window.opener&&window.opener.postMessage(${safePayload},${safeTarget});}finally{window.close();}</script></body></html>`);
}

export async function GET(req: Request) {
  try {
    const clientId = googleClientId();
    const clientSecret = googleClientSecret();
    if (!clientId || !clientSecret) {
      return htmlResponse("Cryzo managed Google sign-in is not configured.", 503);
    }

    const url = new URL(req.url);
    const callbackUrl = `${url.origin}/api/cloud/oauth/google`;
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (!code && !stateParam) {
      const appId = url.searchParams.get("appId")?.trim();
      const returnOriginRaw = url.searchParams.get("returnOrigin")?.trim();
      if (!appId || !returnOriginRaw) {
        return htmlResponse("Missing appId or returnOrigin.", 400);
      }
      const returnOrigin = normalizeReturnOrigin(returnOriginRaw);
      const state = encodeState({ appId, returnOrigin, createdAt: Date.now() }, clientSecret);
      const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorize.searchParams.set("client_id", clientId);
      authorize.searchParams.set("redirect_uri", callbackUrl);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("scope", "openid email profile");
      authorize.searchParams.set("prompt", "select_account");
      authorize.searchParams.set("state", state);
      return Response.redirect(authorize.toString(), 302);
    }

    if (!stateParam) return htmlResponse("Missing OAuth state.", 400);
    const state = decodeState(stateParam, clientSecret);
    if (oauthError) {
      return popupResult(state.returnOrigin, {
        type: "cryzo-cloud-google-auth",
        ok: false,
        error: oauthError,
      });
    }
    if (!code) return htmlResponse("Missing Google authorization code.", 400);

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const tokenData = (await tokenResponse.json()) as { id_token?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenData.id_token) {
      throw new Error(tokenData.error_description || "Google token exchange failed");
    }

    const result = await convexClient().action(api.cloudAuth.signInGoogle, {
      appId: state.appId as any,
      idToken: tokenData.id_token,
    });

    return popupResult(state.returnOrigin, {
      type: "cryzo-cloud-google-auth",
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sign-in failed";
    return htmlResponse(`<p style="font-family:system-ui;padding:24px">${message.replace(/[<&>]/g, "")}</p>`, 400);
  }
}
