import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { requireRequestUserId } from "@/lib/server/request-user";

export async function POST(req: Request) {
  if (!await requireRequestUserId(req)) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const token = req.headers.get("authorization")!.slice(7);
    const form = await req.formData();
    const file = form.get("file");
    const conversationId = String(form.get("conversationId") || "") as Id<"conversations">;
    if (!(file instanceof File) || file.size > 4_000_000 || !/^(image|video)\//.test(file.type)) {
      return Response.json({ error: "Use an image or video below 4 MB." }, { status: 400 });
    }
    await fetchQuery(api.artifacts.listByConversation, { conversationId }, { token });
    const serviceKey = process.env.CRYZO_INTERNAL_API_SECRET;
    if (!serviceKey) throw new Error("Media uploads are not configured.");
    const upload = await fetchMutation(api.social.generateUploadUrl, {}, { token });
    const result = await fetch(upload, { method: "POST", headers: { "Content-Type": file.type }, body: file, signal: AbortSignal.timeout(30_000) });
    if (!result.ok) throw new Error("Upload failed.");
    const { storageId } = await result.json();
    await fetchMutation(api.social.registerMedia, { conversationId, storageId, contentType: file.type, name: file.name, serviceKey }, { token });
    const url = await fetchQuery(api.social.mediaUrl, { storageId }, { token });
    return Response.json({ storageId, url });
  } catch { return Response.json({ error: "Unable to upload media to this project." }, { status: 400 }); }
}
