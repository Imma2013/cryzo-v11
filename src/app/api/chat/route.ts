import { openai } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";

let composio: Composio<VercelProvider>;
function getComposio() {
  if (!composio) composio = new Composio<VercelProvider>({ provider: new VercelProvider() });
  return composio;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { messages, userId, composioSessionId } = await req.json() as {
    messages: UIMessage[];
    userId: string;
    composioSessionId: string | null;
  };

  const client = getComposio();
  const session = composioSessionId
    ? await client.use(composioSessionId)
    : await client.create(userId || "anonymous");

  const tools = await session.tools();

  const result = streamText({
    model: openai("gpt-5.4"),
    system:
      "You are a helpful AI assistant with access to many tools and services via Composio. When a user asks you to perform actions (send emails, create GitHub issues, post Slack messages, etc.), use the available tools. If a tool requires authentication, provide the user with the authorization link.",
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "x-composio-session-id": session.sessionId,
    },
  });
}
