import { createHash, randomUUID } from "node:crypto";
import { startTask } from "@/lib/server/task-start";
import { handleMobileRequest } from "@/lib/server/mobile-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.operation !== "preview")
      return handleMobileRequest(
        new Request(req.url, {
          method: "POST",
          headers: req.headers,
          body: JSON.stringify(body),
          signal: req.signal,
        }),
      );
    const key =
      createHash("sha256")
        .update(
          JSON.stringify(
            [...(body.sourceFiles || [])].sort((a: any, b: any) =>
              a.path.localeCompare(b.path),
            ),
          ),
        )
        .digest("hex") + (body.forceRestart ? ":" + randomUUID() : "");
    return Response.json(await startTask(req, "expo", body, key), {
      status: 202,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to start Expo",
      },
      { status: 400 },
    );
  }
}
