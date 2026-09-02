import { getProvider } from "@/lib/ai/models";
import { resolveAccountProviderSecret } from "@/lib/server/provider-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isPrivateHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1" || normalized.endsWith(".local")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      providerId?: string;
      credentialMode?: "device" | "account";
      apiKey?: string;
      baseURL?: string;
    };
    const provider = getProvider(body.providerId || "");
    if (provider.id === "cryzo" || provider.local) {
      return Response.json({ error: "This provider is tested directly in the browser." }, { status: 400 });
    }

    let apiKey = body.apiKey?.trim() || "";
    let baseURL = body.baseURL?.trim() || provider.defaultBaseURL || "";
    if (body.credentialMode === "account") {
      const authorization = req.headers.get("authorization");
      const authToken = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";
      if (!authToken) {
        return Response.json({ error: "Your Cryzo session is still loading." }, { status: 401 });
      }
      const saved = await resolveAccountProviderSecret(authToken, provider.id);
      if (body.apiKey?.trim()) apiKey = body.apiKey.trim();
      else apiKey = saved?.apiKey || "";
      if (!body.baseURL?.trim()) baseURL = saved?.baseURL || baseURL;
    }

    if (!provider.custom && !apiKey) {
      return Response.json({ error: "Enter or save an API key first." }, { status: 400 });
    }
    if (!baseURL) {
      return Response.json({ error: "Enter a base URL first." }, { status: 400 });
    }

    const endpoint = new URL(`${baseURL.replace(/\/$/, "")}/models`);
    if (!["https:", "http:"].includes(endpoint.protocol) || isPrivateHost(endpoint.hostname)) {
      return Response.json({ error: "Private or local URLs must be tested from your device." }, { status: 400 });
    }

    const headers: Record<string, string> =
      provider.native === "anthropic"
        ? {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          }
        : apiKey
          ? { Authorization: `Bearer ${apiKey}` }
          : {};

    const response = await fetch(endpoint, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: unknown[]; error?: { message?: string }; message?: string }
      | null;

    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message;
      throw new Error(detail || `${provider.name} returned HTTP ${response.status}`);
    }

    const count = Array.isArray(payload?.data) ? payload.data.length : 0;
    return Response.json({
      ok: true,
      message: count
        ? `Connected to ${provider.name} · ${count} models available`
        : `Connected to ${provider.name} successfully`,
    });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "The provider did not respond within 15 seconds."
        : error instanceof Error
          ? error.message
          : "Connection test failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
