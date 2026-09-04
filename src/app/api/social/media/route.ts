import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { requireRequestUserId } from "@/lib/server/request-user";

export async function POST(req: Request) {
  if (!await requireRequestUserId(req)) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const token = req.headers.get("authorization")!.slice(7);
    const body = await req.json() as { conversationId?: Id<"conversations">; storageId?: Id<"_storage">; contentType?: string; name?: string };
    const conversationId = body.conversationId!;
    if (!conversationId) throw new Error("A project is required.");
    await fetchQuery(api.artifacts.listByConversation, { conversationId }, { token });
    if (!body.storageId) {
      const uploadUrl = await fetchMutation(api.social.generateUploadUrl, {}, { token });
      return Response.json({ uploadUrl });
    }
    if (!body.contentType?.match(/^(image|video)\//) || !body.name || body.name.length > 180) throw new Error("Invalid media.");
    const serviceKey = process.env.CRYZO_INTERNAL_API_SECRET;
    if (!serviceKey) throw new Error("Media uploads are not configured.");
    await fetchMutation(api.social.registerMedia, { conversationId, storageId: body.storageId, contentType: body.contentType, name: body.name, serviceKey }, { token });
    const url = await fetchQuery(api.social.mediaUrl, { storageId: body.storageId }, { token });
    return Response.json({ storageId: body.storageId, url });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to upload media to this project." }, { status: 400 }); }
}
