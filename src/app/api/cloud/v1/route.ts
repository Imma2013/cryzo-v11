import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() });
}

function convexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Cryzo Cloud is not configured");
  return new ConvexHttpClient(url);
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      appId?: string;
      kind?: "auth" | "database";
      operation?: string;
      email?: string;
      password?: string;
      name?: string;
      entityName?: string;
      recordId?: string;
      data?: unknown;
    };
    if (!body.appId || !body.kind || !body.operation) {
      return json({ error: "appId, kind and operation are required" }, 400);
    }

    const client = convexClient();
    const sessionToken = bearer(req) || undefined;

    if (body.kind === "auth") {
      if (body.operation === "signup") {
        if (!body.email || !body.password) {
          return json({ error: "email and password are required" }, 400);
        }
        const result = await client.action(api.cloudAuth.signUp, {
          appId: body.appId as any,
          email: body.email,
          password: body.password,
          name: body.name,
        });
        return json(result);
      }
      if (body.operation === "signin") {
        if (!body.email || !body.password) {
          return json({ error: "email and password are required" }, 400);
        }
        const result = await client.action(api.cloudAuth.signIn, {
          appId: body.appId as any,
          email: body.email,
          password: body.password,
        });
        return json(result);
      }
      if (body.operation === "me") {
        if (!sessionToken) return json({ user: null });
        const user = await client.action(api.cloudAuth.me, {
          appId: body.appId as any,
          token: sessionToken,
        });
        return json({ user });
      }
      if (body.operation === "signout") {
        if (sessionToken) {
          await client.action(api.cloudAuth.signOut, {
            appId: body.appId as any,
            token: sessionToken,
          });
        }
        return json({ success: true });
      }
      return json({ error: "Unknown auth operation" }, 400);
    }

    const allowed = new Set(["list", "get", "create", "update", "delete"]);
    if (!allowed.has(body.operation)) {
      return json({ error: "Unknown database operation" }, 400);
    }
    if (!body.entityName) return json({ error: "entityName is required" }, 400);

    const result = await client.action(api.cloudRuntime.database, {
      appId: body.appId as any,
      operation: body.operation as any,
      entityName: body.entityName,
      recordId: body.recordId as any,
      data: body.data,
      sessionToken,
    });
    return json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cryzo Cloud request failed";
    const status = message.includes("integration credits")
      ? 402
      : message.includes("Authentication")
        ? 401
        : message.includes("Forbidden")
          ? 403
          : message.includes("not found") || message.includes("Unknown entity")
            ? 404
            : message.includes("required") || message.includes("valid") || message.includes("Password")
              ? 400
              : 500;
    return json({ error: message }, status);
  }
}
