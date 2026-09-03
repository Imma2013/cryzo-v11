import { generateText } from "ai";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { resolveServerModel } from "@/lib/server/model-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenFrom(req: Request) {
  const authorization = req.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const token = tokenFrom(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const subscription = await fetchQuery(
    api.billing.getSubscription,
    { userId: user._id },
    { token },
  );
  if (subscription.messageCreditsRemaining < 1) {
    return Response.json({ error: "no_message_credits" }, { status: 402 });
  }

  const { prompt, channels }: { prompt?: string; channels?: string[] } =
    await req.json();
  const request = prompt?.trim() || "";
  if (!request || request.length > 4000) {
    return Response.json({ error: "Describe the post you want." }, { status: 400 });
  }

  const resolved = await resolveServerModel({
    providerId: "cryzo",
    modelId: "cryzo/minimax-m3",
    credentialMode: "cryzo",
    authToken: token,
  });
  let text = "";
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await generateText({
        model: resolved.model,
        system:
          "You are Cryzo Social. Write a polished social post ready for review. Adapt naturally to the selected networks, keep claims grounded, avoid fake links and hashtags, and return only the post copy.",
        prompt: `Networks: ${(channels || []).join(", ")}\nRequest: ${request}`,
        maxOutputTokens: 900,
      });
      text = result.text.trim();
      if (text) break;
      lastError = new Error("The model returned an empty draft.");
    } catch (error) {
      lastError = error;
    }
    console.warn("[social-draft] retry", {
      requestId,
      attempt,
      modelId: resolved.modelId,
    });
  }

  if (!text) {
    console.error("[social-draft] failed", {
      requestId,
      modelId: resolved.modelId,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return Response.json(
      {
        error: `Cryzo could not create a draft. Try again and reference ${requestId} if it repeats.`,
        requestId,
      },
      { status: 502 },
    );
  }

  await fetchMutation(
    api.billing.deductMessageCredits,
    {
      userId: user._id,
      amount: 1,
      reason: "social_ai",
      description: "Generated social post",
      providerId: resolved.providerId,
      modelId: resolved.modelId,
    },
    { token },
  );

  return Response.json({ text, requestId });
}

