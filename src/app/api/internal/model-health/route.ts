import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const expected = process.env.CRYZO_INTERNAL_API_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !supplied || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return new Response(null, { status: 404 });
  }
  try {
    const report = await readFile(join(process.cwd(), "managed-model-smoke.json"), "utf8");
    return new Response(report, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No deployment smoke report is available." }, { status: 404 });
  }
}
