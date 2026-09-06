import { timingSafeEqual } from "node:crypto";
import { Composio } from "@composio/core";
import {
  SOCIAL_TOOLKITS,
  composioSocialSessionOptions,
  type SocialToolkit,
} from "@/lib/server/composio-social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExecuteRequest = {
  operation: "execute";
  userId: string;
  toolkit: SocialToolkit;
  connectedAccountId: string;
  toolSlug: string;
  arguments: Record<string, unknown>;
};

type UploadRequest = {
  operation: "upload";
  toolkit: SocialToolkit;
  toolSlug: string;
  file: string;
};

type SchemaRequest = {
  operation: "schema";
  toolkit: SocialToolkit;
  toolSlug: string;
};

type GatewayRequest = ExecuteRequest | UploadRequest | SchemaRequest;

let composio: Composio | null = null;

function getComposio() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("Composio is not configured in the Vercel runtime. Set COMPOSIO_API_KEY for the Vercel Production environment.");
  return (composio ??= new Composio({ apiKey }));
}

function composioApiKey() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("Composio is not configured in the Vercel runtime. Set COMPOSIO_API_KEY for the Vercel Production environment.");
  return apiKey;
}

function publicErrorMessage(message: string, toolkit?: SocialToolkit) {
  const depleted = /credits depleted|http_depleted|["']?status["']?\s*:\s*402|payment required/i.test(message);
  if (depleted && toolkit === "twitter") {
    return "X publishing is unavailable because the connected X developer app has no API credits. Add X API credits, then retry this network.";
  }
  if (depleted) {
    return "The connected provider has no delivery credits available. Refill the provider balance, then retry this network.";
  }
  if (/no composio api key|api key.*not provided/i.test(message)) {
    return "Composio is not configured in the Vercel runtime. Set COMPOSIO_API_KEY for the Vercel Production environment.";
  }
  return message;
}

function normalizeComposioResult(value: unknown, toolkit?: SocialToolkit): unknown {
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const normalizeHeaders = (headers: unknown) => {
    if (headers instanceof Headers) return Object.fromEntries(headers.entries());
    return headers;
  };

  const normalized: Record<string, unknown> = { ...record };
  if ("headers" in normalized) normalized.headers = normalizeHeaders(normalized.headers);
  if (normalized.response && typeof normalized.response === "object") {
    normalized.response = {
      ...(normalized.response as Record<string, unknown>),
      headers: normalizeHeaders((normalized.response as Record<string, unknown>).headers),
    };
  }
  if (typeof normalized.error === "string" && normalized.error) {
    normalized.error = publicErrorMessage(normalized.error, toolkit);
  }
  return normalized;
}

function authorized(request: Request) {
  const expected = process.env.CRYZO_INTERNAL_API_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

function isToolkit(value: unknown): value is SocialToolkit {
  return (
    typeof value === "string" &&
    SOCIAL_TOOLKITS.includes(value as SocialToolkit)
  );
}

function validSlug(value: unknown) {
  return (
    typeof value === "string" &&
    /^[A-Z][A-Z0-9_]{2,160}$/.test(value)
  );
}

async function fetchToolSchema(toolSlug: string) {
  const response = await fetch(
    `https://backend.composio.dev/api/v3.1/tools/${encodeURIComponent(toolSlug)}?toolkit_versions=latest`,
    {
      cache: "no-store",
      headers: {
        "x-api-key": composioApiKey(),
      },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message || "")
        : "";
    throw new Error(message || `Unable to load Composio tool schema (${response.status}).`);
  }
  return payload;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.COMPOSIO_API_KEY?.trim()) {
    return Response.json(
      { error: "Composio is not configured in the Vercel runtime. Set COMPOSIO_API_KEY for the Vercel Production environment." },
      { status: 503 },
    );
  }

  let body: GatewayRequest;
  try {
    body = (await request.json()) as GatewayRequest;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isToolkit(body.toolkit) || !validSlug(body.toolSlug)) {
    return Response.json({ error: "Invalid social action." }, { status: 400 });
  }

  try {
    if (body.operation === "schema") {
      return Response.json({ result: await fetchToolSchema(body.toolSlug) });
    }

    if (body.operation === "upload") {
      if (
        typeof body.file !== "string" ||
        body.file.length > 10_000 ||
        !/^https:\/\//.test(body.file)
      ) {
        return Response.json({ error: "Invalid media URL." }, { status: 400 });
      }
      const result = await getComposio().files.upload({
        file: body.file,
        toolSlug: body.toolSlug,
        toolkitSlug: body.toolkit,
      });
      return Response.json({ result });
    }

    if (
      body.operation !== "execute" ||
      typeof body.userId !== "string" ||
      !body.userId ||
      body.userId.length > 200 ||
      typeof body.connectedAccountId !== "string" ||
      !body.connectedAccountId ||
      body.connectedAccountId.length > 200 ||
      !body.arguments ||
      typeof body.arguments !== "object" ||
      Array.isArray(body.arguments)
    ) {
      return Response.json({ error: "Invalid execution request." }, { status: 400 });
    }

    const session = await getComposio().create(
      body.userId,
      composioSocialSessionOptions(body.toolkit, body.connectedAccountId),
    );
    const result = await session.execute(body.toolSlug, body.arguments);
    return Response.json({ result: normalizeComposioResult(result, body.toolkit) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Composio execution failed.";
    console.error("[social/composio-gateway]", {
      operation: body.operation,
      toolkit: body.toolkit,
      toolSlug: body.toolSlug,
      error: message,
    });
    return Response.json({ error: publicErrorMessage(message, body.toolkit) }, { status: 502 });
  }
}
