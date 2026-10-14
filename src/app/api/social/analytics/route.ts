import { Composio } from "@composio/core";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { composioSocialSessionOptions, type SocialToolkit } from "@/lib/server/composio-social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Metric = { key: string; label: string; value: number };
type Series = { key: string; label: string; points: Array<{ date: string; value: number }> };
type AccountAnalytics = {
  channel: string;
  accountId: string;
  accountName: string;
  metrics: Metric[];
  series: Series[];
  note?: string;
  updatedAt: number;
};

const TOOLKIT_BY_CHANNEL: Record<string, SocialToolkit> = {
  x: "twitter",
  facebook: "facebook",
  instagram: "instagram",
  youtube: "youtube",
  linkedin: "linkedin",
};

let composio: Composio | null = null;
function getComposio() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("Composio is not configured.");
  return (composio ??= new Composio({ apiKey }));
}

function resultData(value: any) {
  if (value && typeof value === "object" && "data" in value) return value.data;
  return value;
}

function titleize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalizeGraphInsights(payload: any) {
  const root = resultData(payload);
  const list = Array.isArray(root?.data) ? root.data : Array.isArray(root) ? root : [];
  const metrics: Metric[] = [];
  const series: Series[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const key = String(entry.name || entry.metric || entry.title || "");
    if (!key) continue;
    const values = Array.isArray(entry.values) ? entry.values : [];
    const points = values.flatMap((item: any) => {
      const value = numeric(item?.value);
      if (value === null) return [];
      return [{ date: String(item?.end_time || item?.date || ""), value }];
    });
    const totalValue = numeric(entry?.total_value?.value);
    const directValue = numeric(entry?.value);
    const value = totalValue ?? directValue ?? (points.length ? points[points.length - 1].value : null);
    if (value !== null) metrics.push({ key, label: titleize(key), value });
    if (points.length > 1) series.push({ key, label: titleize(key), points });
  }
  return { metrics, series };
}

function normalizeYouTube(payload: any) {
  const root = resultData(payload);
  const headers = Array.isArray(root?.columnHeaders) ? root.columnHeaders : Array.isArray(root?.column_headers) ? root.column_headers : [];
  const rows = Array.isArray(root?.rows) ? root.rows : [];
  if (!headers.length || !rows.length) return { metrics: [] as Metric[], series: [] as Series[] };
  const names = headers.map((header: any) => String(header?.name || header || ""));
  const dayIndex = names.findIndex((name: string) => /day|date/i.test(name));
  const metrics: Metric[] = [];
  const series: Series[] = [];
  names.forEach((name: string, index: number) => {
    if (!name || index === dayIndex) return;
    const values = rows.map((row: any[]) => numeric(row?.[index])).filter((value: number | null): value is number => value !== null);
    if (!values.length) return;
    metrics.push({ key: name, label: titleize(name), value: values.reduce((a: number, b: number) => a + b, 0) });
    if (dayIndex >= 0) {
      series.push({
        key: name,
        label: titleize(name),
        points: rows.flatMap((row: any[]) => {
          const value = numeric(row?.[index]);
          return value === null ? [] : [{ date: String(row?.[dayIndex] || ""), value }];
        }),
      });
    }
  });
  return { metrics, series };
}

function normalizeTwitter(payload: any) {
  const root = resultData(payload);
  const metrics = new Map<string, number>();
  const walk = (value: any) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const amount = numeric(child);
      if (amount !== null && /impression|engagement|like|retweet|repl|click|view|bookmark|follow|share/i.test(key)) {
        metrics.set(key, (metrics.get(key) || 0) + amount);
      } else if (child && typeof child === "object") walk(child);
    }
  };
  walk(root);
  return {
    metrics: [...metrics.entries()].slice(0, 10).map(([key, value]) => ({ key, label: titleize(key), value })),
    series: [] as Series[],
  };
}

function firstPage(value: any): { id: string; name: string } | null {
  const root = resultData(value);
  const candidates = Array.isArray(root?.data) ? root.data : Array.isArray(root) ? root : [];
  const page = candidates.find((item: any) => item && (typeof item.id === "string" || typeof item.id === "number"));
  return page ? { id: String(page.id), name: String(page.name || "Facebook Page") } : null;
}

async function execute(userId: string, accountId: string, toolkit: SocialToolkit, slug: string, args: Record<string, unknown>) {
  const session = await getComposio().create(userId, composioSocialSessionOptions(toolkit, accountId));
  const result = await session.execute(slug, args);
  if ((result as any)?.error) throw new Error(String((result as any).error));
  return result;
}

async function loadAnalytics({
  userId,
  account,
  days,
  posts,
}: {
  userId: string;
  account: any;
  days: number;
  posts: any[];
}): Promise<AccountAnalytics> {
  const now = Date.now();
  const since = new Date(now - days * 86400000);
  const until = new Date(now);
  const toolkit = TOOLKIT_BY_CHANNEL[account.channel];
  if (!toolkit) {
    return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, metrics: [], series: [], note: "Analytics are not available for this channel.", updatedAt: now };
  }

  try {
    if (account.channel === "instagram") {
      const result = await execute(userId, account.connectedAccountId, toolkit, "INSTAGRAM_GET_USER_INSIGHTS", {
        since: Math.floor(since.getTime() / 1000),
        until: Math.floor(until.getTime() / 1000),
        metric: ["reach", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "views", "profile_views", "follower_count"],
        period: "day",
      });
      return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, ...normalizeGraphInsights(result), updatedAt: now };
    }

    if (account.channel === "facebook") {
      const pages = await execute(userId, account.connectedAccountId, toolkit, "FACEBOOK_LIST_MANAGED_PAGES", { limit: 25 });
      const page = firstPage(pages);
      if (!page) {
        return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, metrics: [], series: [], note: "No Facebook Page with insights permission was found. Reconnect Facebook with Page insights access.", updatedAt: now };
      }
      const result = await execute(userId, account.connectedAccountId, toolkit, "FACEBOOK_GET_PAGE_INSIGHTS", {
        page_id: page.id,
        since: since.toISOString().slice(0, 10),
        until: until.toISOString().slice(0, 10),
        period: "day",
      });
      return { channel: account.channel, accountId: account.connectedAccountId, accountName: page.name, ...normalizeGraphInsights(result), updatedAt: now };
    }

    if (account.channel === "youtube") {
      const result = await execute(userId, account.connectedAccountId, toolkit, "YOUTUBE_QUERY_ANALYTICS", {
        ids: "channel==MINE",
        startDate: since.toISOString().slice(0, 10),
        endDate: until.toISOString().slice(0, 10),
        metrics: "views,likes,comments,estimatedMinutesWatched,averageViewDuration,subscribersGained",
        dimensions: "day",
        sort: "day",
      });
      return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, ...normalizeYouTube(result), updatedAt: now };
    }

    if (account.channel === "x") {
      const ids = posts.flatMap((post: any) =>
        (post.deliveries || []).filter((delivery: any) => delivery.channel === "x" && delivery.remotePostId).map((delivery: any) => String(delivery.remotePostId)),
      ).slice(0, 100);
      if (!ids.length) {
        return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, metrics: [], series: [], note: "Publish through Cryzo first so X post IDs can be matched to analytics.", updatedAt: now };
      }
      const result = await execute(userId, account.connectedAccountId, toolkit, "TWITTER_GET_POST_ANALYTICS", {
        ids,
        start_time: since.toISOString(),
        end_time: until.toISOString(),
        granularity: "total",
        "analytics.fields": ["impressions", "engagements", "likes", "retweets", "replies", "url_clicks", "user_profile_clicks"],
      });
      return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, ...normalizeTwitter(result), updatedAt: now };
    }

    if (account.channel === "linkedin") {
      const organization = posts
        .map((post: any) => post.platformOptions?.linkedinAuthorUrn)
        .find((value: unknown) => typeof value === "string" && value.startsWith("urn:li:organization:"));
      if (!organization) {
        return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, metrics: [], series: [], note: "LinkedIn analytics are available for organization-page posts. Choose a company-page author when publishing to enable them.", updatedAt: now };
      }
      const result = await execute(userId, account.connectedAccountId, toolkit, "LINKEDIN_GET_SHARE_STATS", {
        organizational_entity: organization,
        time_intervals: `(timeRange:(start:${since.getTime()},end:${until.getTime()}),timeGranularityType:DAY)`,
      });
      return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, ...normalizeTwitter(result), updatedAt: now };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analytics request failed.";
    const note = account.channel === "x" && /403|enterprise|forbidden/i.test(message)
      ? "X impression analytics require an Enterprise API plan. Publishing can still work on lower X API tiers."
      : /scope|permission|insufficient|access/i.test(message)
        ? "Reconnect this account with analytics/insights permissions, then refresh."
        : message.slice(0, 240);
    return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, metrics: [], series: [], note, updatedAt: now };
  }

  return { channel: account.channel, accountId: account.connectedAccountId, accountName: account.name, metrics: [], series: [], note: "Analytics are not available for this account.", updatedAt: now };
}

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return Response.json({ error: "authentication_required" }, { status: 401 });

  try {
    const user = await fetchQuery(api.users.currentUser, {}, { token });
    if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
    const access = await fetchQuery(api.social.getAccess, { now: Date.now() }, { token });
    if (!access.canSchedule && !access.isAdmin) {
      return Response.json({ error: "analytics_requires_upgrade", requiredPlan: "starter" }, { status: 402 });
    }

    const url = new URL(req.url);
    const requestedDays = Number(url.searchParams.get("days") || "30");
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const channel = url.searchParams.get("channel") || "";
    const accountId = url.searchParams.get("accountId") || "";
    const refresh = url.searchParams.get("refresh") === "1";

    const allAccounts = await fetchQuery(api.social.listAccounts, {}, { token });
    const accounts = allAccounts.filter((account: any) =>
      (!channel || account.channel === channel) &&
      (!accountId || account.connectedAccountId === accountId) &&
      Boolean(TOOLKIT_BY_CHANNEL[account.channel]),
    );
    const posts = await fetchQuery(api.social.listPosts, {}, { token });

    const items: AccountAnalytics[] = [];
    for (const account of accounts) {
      const cached = await fetchQuery(api.social.getAnalyticsSnapshot, {
        connectedAccountId: account.connectedAccountId,
        days,
      }, { token });
      if (!refresh && cached && Date.now() - cached.updatedAt < 15 * 60_000) {
        items.push(cached.data as AccountAnalytics);
        continue;
      }
      const item = await loadAnalytics({
        userId: String(user._id),
        account,
        days,
        posts: posts as any[],
      });
      await fetchMutation(api.social.saveAnalyticsSnapshot, {
        connectedAccountId: account.connectedAccountId,
        channel: account.channel,
        days,
        data: item,
      }, { token });
      items.push(item);
    }

    return Response.json({ days, items, refreshedAt: Date.now() });
  } catch (error) {
    return Response.json({
      error: "analytics_failed",
      message: error instanceof Error ? error.message : "Unable to load analytics.",
    }, { status: 502 });
  }
}
