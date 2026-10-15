import { startTask } from "@/lib/server/task-start";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = [...(body.messages || [])]
      .reverse()
      .find((m: any) => m.role === "user");
    if (!prompt?.id)
      return Response.json(
        { error: "A prompt ID is required." },
        { status: 400 },
      );
    return Response.json(await startTask(req, "generation", body, prompt.id), {
      status: 202,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not start build",
      },
      { status: 400 },
    );
  }
}
