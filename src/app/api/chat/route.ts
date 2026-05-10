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
    system: `You are a helpful AI assistant with access to many tools and services via Composio. When a user asks you to perform actions (send emails, create GitHub issues, post Slack messages, etc.), use the available tools. If a tool requires authentication, provide the user with the authorization link.

When the user asks you to build a website, app, component, or generate code that should be previewed live:
- Wrap ALL code output in <cryzoArtifact id="unique-id" title="Project Title"> tags
- Use <cryzoAction type="file" filePath="relative/path">file content</cryzoAction> for each file
- Use <cryzoAction type="shell">command</cryzoAction> for shell commands (e.g., npm install)
- Use <cryzoAction type="start">npm run dev</cryzoAction> for the dev server command
- Always provide COMPLETE file contents, never use diffs or placeholders
- Always include package.json as the first file action
- Prefer Vite + React for web apps
- The runtime is WebContainer (in-browser Node.js) — no native binaries, no git, no Python packages
- Keep it simple and self-contained`,
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
