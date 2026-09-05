import { Composio } from "@composio/core";
import { requireRequestUserId } from "@/lib/server/request-user";
import { composioSocialSessionOptions } from "@/lib/server/composio-social";

export const dynamic = "force-dynamic";

type Target = {
  id: string;
  name: string;
  username?: string;
};

function records(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(records);
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(records)];
}

function textValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return undefined;
}

async function activeAccount(
  composio: Composio,
  userId: string,
  accountId: string,
  toolkit: "facebook" | "instagram",
) {
  let cursor: string | undefined;
  do {
    const page = await composio.connectedAccounts.list({
      userIds: [userId],
      statuses: ["ACTIVE"],
      limit: 100,
      cursor,
    });
    const match = page.items.find(
      (account) =>
        account.id === accountId && account.toolkit.slug === toolkit,
    );
    if (match) return match;
    cursor = page.nextCursor || undefined;
  } while (cursor);
  return null;
}

export async function GET(request: Request) {
  const userId = await requireRequestUserId(request);
  if (!userId) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  const search = new URL(request.url).searchParams;
  const channel = search.get("channel");
  const accountId = search.get("accountId")?.trim();
  if (
    (channel !== "facebook" && channel !== "instagram") ||
    !accountId ||
    accountId.length > 200
  ) {
    return Response.json({ error: "Choose a connected social account." }, { status: 400 });
  }

  try {
    const composio = new Composio();
    const account = await activeAccount(composio, userId, accountId, channel);
    if (!account) {
      return Response.json({ error: "That social account is not connected to you." }, { status: 403 });
    }

    const session = await composio.create(
      userId,
      composioSocialSessionOptions(channel, accountId),
    );

    if (channel === "facebook") {
      const result = await session.execute("FACEBOOK_LIST_MANAGED_PAGES", {
        user_id: "me",
        limit: 100,
        fields: "id,name,category,tasks,link,picture",
      });
      if (result.error) throw new Error(result.error);
      const seen = new Set<string>();
      const items: Target[] = records(result.data)
        .map((record) => {
          const id = textValue(record, ["id", "page_id"]);
          const name = textValue(record, ["name", "page_name"]);
          return id && /^\d+$/.test(id) && name ? { id, name } : null;
        })
        .filter((item): item is Target => Boolean(item))
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      return Response.json({ items });
    }

    const result = await session.execute("INSTAGRAM_GET_USER_INFO", {
      ig_user_id: "me",
    });
    if (result.error) throw new Error(result.error);
    const targetRecord = records(result.data).find((record) => {
      const id = textValue(record, ["id", "ig_id", "user_id"]);
      return Boolean(id && /^\d+$/.test(id));
    });
    const id = targetRecord && textValue(targetRecord, ["id", "ig_id", "user_id"]);
    if (!id) {
      throw new Error("Instagram did not return a Business or Creator account ID.");
    }
    const username = textValue(targetRecord, ["username"]);
    const name = textValue(targetRecord, ["name"]) || (username ? `@${username}` : "Instagram account");
    return Response.json({ items: [{ id, name, username }] satisfies Target[] });
  } catch (error) {
    console.warn("[social/targets]", error instanceof Error ? error.message : "Target lookup failed");
    return Response.json(
      {
        error:
          channel === "facebook"
            ? "Could not load managed Facebook Pages. Reconnect Facebook with Pages permissions."
            : "Could not resolve an Instagram Business or Creator account. Check that it is linked to a Facebook Page.",
      },
      { status: 502 },
    );
  }
}
