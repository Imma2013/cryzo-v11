import { Sandbox } from "@vercel/sandbox";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROJECT_DIR = "/vercel/sandbox/project";

function sandboxNameFor(conversationId: string) {
  const safe = conversationId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48);
  return `cryzo-${safe}`;
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(req: Request) {
  try {
    const authToken = bearer(req);
    if (!authToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { conversationId, project } = (await req.json()) as {
      conversationId?: string;
      project?: { ref?: string; name?: string; url?: string; publicKey?: string };
    };
    if (!conversationId || !project?.url || !project?.publicKey) {
      return Response.json({ error: "Missing conversation or Supabase project" }, { status: 400 });
    }

    const conversation = await fetchQuery(
      api.conversations.get,
      { id: conversationId as Id<"conversations"> },
      { token: authToken },
    );
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

    const sandbox = await Sandbox.getOrCreate({
      name: sandboxNameFor(conversationId),
      runtime: "node24",
      ports: [5173],
      timeout: 45 * 60 * 1000,
      persistent: true,
      snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
      networkPolicy: "allow-all",
      onCreate: async (created) => {
        await created.runCommand("mkdir", ["-p", PROJECT_DIR]);
      },
    });

    const env = [
      `VITE_SUPABASE_URL=${project.url}`,
      `VITE_SUPABASE_ANON_KEY=${project.publicKey}`,
      `VITE_SUPABASE_PUBLISHABLE_KEY=${project.publicKey}`,
      `VITE_CRYZO_SUPABASE_PROJECT_REF=${project.ref || ""}`,
      "",
    ].join("\n");

    await sandbox.writeFiles([
      { path: `${PROJECT_DIR}/.env.local`, content: Buffer.from(env, "utf8") },
    ]);

    return Response.json({ success: true, project: project.ref || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to configure Supabase runtime";
    return Response.json({ error: message }, { status: 500 });
  }
}
