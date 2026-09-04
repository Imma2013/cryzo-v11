import { Composio } from "@composio/core";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { requireRequestUserId } from "@/lib/server/request-user";

const channels = { twitter: "x", facebook: "facebook", instagram: "instagram", youtube: "youtube", reddit: "reddit", tiktok: "tiktok", linkedin: "linkedin" } as const;
const composio = () => new Composio();
async function accounts(userId: string) {
  const items = [];
  let cursor: string | undefined;
  do {
    const result = await composio().connectedAccounts.list({ userIds: [userId], statuses: ["ACTIVE"], limit: 100, cursor });
    items.push(...result.items);
    cursor = result.nextCursor || undefined;
  } while (cursor);
  return items.filter(item => item.toolkit.slug in channels).map(item => ({
    id: item.id, channel: channels[item.toolkit.slug as keyof typeof channels], name: item.toolkit.slug,
  }));
}
export async function GET(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) return Response.json({ error: "Sign in first." }, { status: 401 });
  try { return Response.json({ items: await accounts(userId) }); }
  catch { return Response.json({ error: "Unable to load your social accounts. Retry connection." }, { status: 502 }); }
}
export async function POST(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { accountId, conversationId } = await req.json();
    const account = (await accounts(userId)).find(item => item.id === accountId);
    if (!account) return Response.json({ error: "Connect this account before adding it to a project." }, { status: 400 });
    const serviceKey = process.env.CRYZO_INTERNAL_API_SECRET;
    if (!serviceKey) throw new Error("Account binding is not configured.");
    await fetchMutation(api.social.bindAccount, { conversationId: conversationId as Id<"conversations">, channel: account.channel,
      connectedAccountId: account.id, name: account.name, serviceKey }, { token: req.headers.get("authorization")!.slice(7) });
    return Response.json({ success: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to add account." }, { status: 400 }); }
}
