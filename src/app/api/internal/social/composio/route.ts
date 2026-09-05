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

type GatewayRequest = ExecuteRequest | UploadRequest;

let composio: Composio | null = null;

function getComposio() {
  return (composio ??= new Composio());
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

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.COMPOSIO_API_KEY) {
    return Response.json(
      { error: "Composio is not configured in the Vercel runtime." },
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
    return Response.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Composio execution failed.";
    console.error("[social/composio-gateway]", {
      operation: body.operation,
      toolkit: body.toolkit,
      toolSlug: body.toolSlug,
      error: message,
    });
    return Response.json({ error: message }, { status: 502 });
  }
}
