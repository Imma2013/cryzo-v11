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
  const token = tokenFrom(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const subscription = await fetchQuery(
    api.billing.getSubscription,
    { userId: user._id },
    { token },
  );
  if (subscription.plan === "free") {
    return Response.json(
      { error: "Social AI requires Starter or higher." },
      { status: 402 },
    );
  }
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
  const result = await generateText({
    model: resolved.model,
    system:
      "You are Cryzo Social. Write a polished social post ready for review. Adapt naturally to the selected networks, keep claims grounded, avoid fake links and hashtags, and return only the post copy.",
    prompt: `Networks: ${(channels || []).join(", ")}\nRequest: ${request}`,
    maxOutputTokens: 900,
  });

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

  return Response.json({ text: result.text });
}
