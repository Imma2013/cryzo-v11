import type { UIMessage } from "ai";
import type { ProjectPlatform } from "@/lib/project-platform";
import { inferProjectPlatforms } from "@/lib/project-platform";
import { ConvexHttpClient } from "convex/browser";
import { start } from "workflow/api";
import { api } from "../../../convex/_generated/api";
import {
  encryptProviderSecret,
  resolveAccountProviderSecret,
} from "./provider-secrets";
import { runCryzoTask } from "@/workflows/cryzo-task";
import type { Id } from "../../../convex/_generated/dataModel";

export type TaskRequest = {
  conversationId: string;
  messages?: UIMessage[];
  projectPlatforms?: ProjectPlatform[];
  authToken?: string;
  convexAuthToken?: string;
  modelCredentialMode?: "cryzo" | "device" | "account";
  modelProvider?: string;
  modelApiKey?: string;
  modelBaseUrl?: string;
  sourceFiles?: Array<{ path: string; content: string }>;
  forceRestart?: boolean;
  [key: string]: unknown;
};

export async function startTask(
  req: Request,
  kind: "generation" | "expo",
  body: TaskRequest,
  key: string,
) {
  const token =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    body.convexAuthToken ||
    body.authToken;
  if (!token) throw new Error("Sign in to continue.");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(token);
  const conversation = await client.query(api.conversations.get, {
    id: body.conversationId as Id<"conversations">,
  });
  if (!conversation) throw new Error("Conversation not found");
  const internalSecret = process.env.CRYZO_INTERNAL_API_SECRET;
  if (!internalSecret)
    throw new Error("Background jobs are not configured on the server.");
  const payload = {
    ...body,
    userId: conversation.userId,
    projectPlatforms: body.projectPlatforms || conversation.projectPlatforms,
  };
  if (kind === "generation") {
    const prompts = body.messages?.filter((m) => m.role === "user") || [];
    const firstText = (prompts[0]?.parts || [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ");
    if (
      prompts.length === 1 &&
      /mobile app|phone app|native app|react native|expo|ios app|android app|iphone app|build an app|make an app|create an app/i.test(
        firstText,
      )
    ) {
      payload.projectPlatforms = inferProjectPlatforms(firstText);
      await client.mutation(api.conversations.updateProjectPlatforms, {
        id: conversation._id,
        projectPlatforms: payload.projectPlatforms,
      });
    }
    if (body.modelCredentialMode === "account") {
      const secret = await resolveAccountProviderSecret(
        token,
        body.modelProvider || "cryzo",
      );
      if (!secret)
        throw new Error("Save an API key for this provider, then retry.");
      payload.modelApiKey = secret.apiKey;
      payload.modelBaseUrl = secret.baseURL || body.modelBaseUrl;
      payload.modelCredentialMode = "device";
    }
    await client.mutation(api.messages.saveAll, {
      conversationId: conversation._id,
      messages: (body.messages || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          clientMessageId: m.id,
          role: m.role as "user" | "assistant",
          content: (m.parts || [])
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(""),
          partsJson: JSON.stringify(
            (m.parts || []).filter((p) => p.type !== "text"),
          ),
        })),
    });
  }
  delete payload.authToken;
  delete payload.convexAuthToken;
  const task = await client.mutation(api.durableTasks.enqueue, {
    conversationId: conversation._id,
    kind,
    key,
    ...encryptProviderSecret(JSON.stringify(payload)),
  });
  if (task.created) {
    try {
      const run = await start(runCryzoTask, [task.id]);
      await client.mutation(api.durableTasks.update, {
        id: task.id,
        internalSecret,
        runId: run.runId,
        phase: "Queued",
      });
    } catch {
      await client.mutation(api.durableTasks.update, {
        id: task.id,
        internalSecret,
        status: "failed",
        phase: "Could not start",
        error: "Background processing could not start. Please retry.",
      });
      throw new Error("Background processing could not start. Please retry.");
    }
  }
  return task;
}
