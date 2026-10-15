import { generateChatResponse } from "@/lib/server/chat-handler";
import { startTask } from "@/lib/server/task-start";
import { taskStream } from "@/lib/server/task-stream";
import { shouldMutateProject } from "@/lib/server/build-routing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = [...(body.messages || [])]
      .reverse()
      .find((m: any) => m.role === "user");
    const text = (prompt?.parts || [])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join(" ");
    if (
      body.chatMode !== "plan" &&
      shouldMutateProject(
        text,
        /automatic project repair|generated project failed/i.test(text),
      )
    ) {
      if (!prompt?.id)
        return Response.json(
          { error: "A prompt ID is required." },
          { status: 400 },
        );
      const task = await startTask(req, "generation", body, prompt.id);
      return taskStream(
        task,
        body.convexAuthToken ||
          body.authToken ||
          req.headers.get("authorization")?.replace(/^Bearer /, ""),
        req.signal,
      );
    }
    return generateChatResponse(
      new Request(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(body),
        signal: req.signal,
      }),
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not start build",
      },
      { status: 400 },
    );
  }
}
