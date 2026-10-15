import { Composio } from "@composio/core";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { composioSocialSessionOptions, type SocialToolkit } from "@/lib/server/composio-social";
import { analyticsData, countMetric, deliveryPostIds, normalizeGraph, normalizeLinkedIn, normalizeYouTube, numberValue, type AccountAnalytics, type Metric } from "@/lib/server/social-analytics";
import { analyticsTargets, type SocialExecute } from "@/lib/server/social-targets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const toolkits: Record<string, SocialToolkit> = { x: "twitter", facebook: "facebook", instagram: "instagram", youtube: "youtube", linkedin: "linkedin", tiktok: "tiktok" };

function base(account: any, days: number): AccountAnalytics {
  const to = new Date(), from = new Date(to);
  from.setUTCHours(0, 0, 0, 0); from.setUTCDate(from.getUTCDate() - days + 1);
  return { version: 2, channel: account.channel, accountId: account.connectedAccountId, accountName: account.name,
    targetId: account.analyticsTargetId || "", status: "ready", metrics: [], series: [], updatedAt: Date.now(),
    period: { from: from.toISOString(), to: to.toISOString(), timezone: "UTC" } };
}
function failure(item: AccountAnalytics, error: unknown): AccountAnalytics {
  const message = error instanceof Error ? error.message : String(error);
  const rate = /429|rate.?limit|throttl|code.?[:= ]+(4|17|613)\b/i.test(message);
  const permission = /401|403|scope|permission|forbidden|expired|access.?denied/i.test(message);
  return { ...item, status: rate ? "rate_limited" : permission ? "permission_required" : "error",
    note: rate ? "The provider rate limit was reached. Try again in a minute." : permission
      ? "Reconnect this account with analytics permissions. Some metrics also require provider API access."
      : "The provider could not return analytics. Retry or check the account connection.",
    retryAfter: Date.now() + 60_000 };
}
function sumFields(rows: any[], keys: string[], window: Metric["window"]): Metric[] {
  return keys.flatMap(key => {
    const values = rows.map(row => numberValue(row?.[key])).filter((value): value is number => value !== null);
    return values.length ? [countMetric(key, values.reduce((sum, value) => sum + value, 0), window)] : [];
  });
}
async function report(item: AccountAnalytics, posts: any[], execute: SocialExecute): Promise<AccountAnalytics> {
  const { channel, targetId } = item;
  if (channel === "facebook" || channel === "linkedin") {
    const targets = await analyticsTargets(channel, execute);
    item.targets = targets;
    if (!targetId || !targets.some(target => target.id === targetId)) return { ...item, status: "target_required",
      note: targets.length ? "Choose the Page or organization to report on." : "No managed Pages or organizations were returned. Reconnect with admin and insights permissions." };
    item.accountName = targets.find(target => target.id === targetId)!.name;
  }
  const start = new Date(item.period.from), end = new Date(item.period.to);
  if (channel === "youtube") {
    const rows: any[] = []; let headers: any[] = [];
    for (let offset = 1; offset <= 1000; offset += 200) {
      const data = analyticsData(await execute("YOUTUBE_QUERY_ANALYTICS", { ids: "channel==MINE",
        startDate: item.period.from.slice(0, 10), endDate: item.period.to.slice(0, 10),
        metrics: "views,likes,comments,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",
        dimensions: "day", sort: "day", startIndex: offset, maxResults: 200 }));
      headers = data.columnHeaders || data.column_headers || headers;
      rows.push(...(data.rows || []));
      if ((data.rows || []).length < 200) break;
      if (offset === 801) throw new Error("YouTube reporting pagination exceeded its limit.");
    }
    return { ...item, ...normalizeYouTube({ columnHeaders: headers, rows }) };
  }
  if (channel === "facebook") return { ...item, ...normalizeGraph(await execute("FACEBOOK_GET_PAGE_INSIGHTS", {
    page_id: targetId, since: item.period.from, until: item.period.to, period: "day",
    metrics: "page_follows,page_daily_follows_unique,page_daily_unfollows_unique,page_media_view,page_post_engagements,page_video_views" })) };
  if (channel === "linkedin") return { ...item, ...normalizeLinkedIn(await execute("LINKEDIN_GET_SHARE_STATS", {
    organizational_entity: targetId,
    time_intervals: "(timeRange:(start:" + start.getTime() + ",end:" + end.getTime() + "),timeGranularityType:DAY)",
  })) };
  if (channel === "instagram") {
    const metrics: Metric[] = [], series: AccountAnalytics["series"] = [];
    item.metrics = metrics; item.series = series;
    for (let since = start.getTime(); since < end.getTime(); since += 30 * 86400000) {
      const until = Math.min(end.getTime(), since + 30 * 86400000);
      const data = normalizeGraph(await execute("INSTAGRAM_GET_USER_INSIGHTS", {
        since: Math.floor(since / 1000), until: Math.floor(until / 1000), period: "day",
        metric: ["views", "likes", "comments", "shares", "saves"], metric_type: "total_value",
      }));
      for (const metric of data.metrics) {
        const existing = metrics.find(value => value.key === metric.key);
        if (existing) existing.value += metric.value; else metrics.push(metric);
      }
    }
    const reach = normalizeGraph(await execute("INSTAGRAM_GET_USER_INSIGHTS", {
      since: Math.floor(Math.max(start.getTime(), end.getTime() - 30 * 86400000) / 1000),
      until: Math.floor(end.getTime() / 1000), period: "day", metric: ["reach"], metric_type: "time_series",
    }));
    metrics.push(...reach.metrics); series.push(...reach.series);
    return { ...item, metrics, series };
  }
  if (channel === "x") {
    const ids = deliveryPostIds(posts, "x", item.accountId).filter(id => /^\d{1,19}$/.test(id));
    if (!ids.length) return { ...item, status: "partial", note: "No published posts matched this account. Publish through Cryzo to collect post metrics." };
    const totals: any[] = [];
    try {
      for (let offset = 0; offset < ids.length; offset += 100) {
        const data = analyticsData(await execute("TWITTER_GET_POST_ANALYTICS", { ids: ids.slice(offset, offset + 100),
          start_time: item.period.from, end_time: item.period.to, granularity: "total",
          "analytics.fields": ["impressions", "engagements", "likes", "retweets", "replies", "url_clicks"] }));
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [data];
        totals.push(...rows.map((row: any) => row.metrics || row.total || row));
      }
      return { ...item, metrics: sumFields(totals, ["impressions", "engagements", "likes", "retweets", "replies", "url_clicks"], "period") };
    } catch (error) {
      if (!/403|enterprise|forbidden/i.test(error instanceof Error ? error.message : String(error))) throw error;
      const publicRows: any[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const data = analyticsData(await execute("TWITTER_POST_LOOKUP_BY_POST_IDS", {
          ids: ids.slice(offset, offset + 100), tweet_fields: ["public_metrics", "created_at"],
        }));
        publicRows.push(...(Array.isArray(data?.data) ? data.data : []).map((row: any) => row.public_metrics || {}));
      }
      return { ...item, status: "partial", metrics: sumFields(publicRows,
        ["like_count", "reply_count", "retweet_count", "quote_count", "bookmark_count", "impression_count"], "lifetime"),
        note: "Public lifetime post counters are shown. X's date-range impression analytics require Enterprise API access." };
    }
  }
  if (channel === "tiktok") {
    let accountNote = "";
    try {
      const user = analyticsData(await execute("TIKTOK_GET_USER_STATS", { fields: ["follower_count", "following_count", "likes_count", "video_count"] }));
      item.metrics = sumFields([user.user || user], ["follower_count", "following_count", "likes_count", "video_count"], "snapshot")
        .map(metric => ({ ...metric, aggregation: "latest" }));
    } catch { accountNote = " Account counters were unavailable; reconnect with profile statistics permissions."; }
    const videos: any[] = []; let cursor: number | undefined;
    const seen = new Set<number>(); let complete = false;
    for (let page = 0; page < 50; page++) {
      const data = analyticsData(await execute("TIKTOK_LIST_VIDEOS", { max_count: 20, ...(cursor ? { cursor } : {}) }));
      const rows = data.videos || [];
      videos.push(...rows.filter((row: any) => Number(row.create_time) * 1000 >= start.getTime() && Number(row.create_time) * 1000 <= end.getTime()));
      if (!data.has_more || rows.some((row: any) => Number(row.create_time) * 1000 < start.getTime())) { complete = true; break; }
      const next = numberValue(data.cursor);
      if (next === null || seen.has(next)) break;
      seen.add(next); cursor = next;
    }
    item.metrics.push(...sumFields(videos, ["view_count", "like_count", "comment_count", "share_count"], "lifetime"));
    return { ...item, status: "partial", note: "Account counters are current snapshots. Available video counters are lifetime totals for public videos published in the selected range; private videos are excluded." +
      (complete ? "" : " Video history is incomplete; only the fetched subset is included.") + accountNote };
  }
  return { ...item, status: "unsupported", note: "This provider does not expose analytics through the current connection." };
}

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return Response.json({ error: "authentication_required" }, { status: 401 });
  try {
    const user = await fetchQuery(api.users.currentUser, {}, { token });
    if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
    const access = await fetchQuery(api.social.getAccess, { now: Date.now() }, { token });
    if (!access.canSchedule && !access.isAdmin) return Response.json({ error: "analytics_requires_upgrade", requiredPlan: "starter" }, { status: 402 });
    const params = new URL(req.url).searchParams, requestedDays = Number(params.get("days") || 30);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30, channel = params.get("channel"), accountId = params.get("accountId");
    const accounts = (await fetchQuery(api.social.listAccounts, {}, { token })).filter((account: any) =>
      (!channel || account.channel === channel) && (!accountId || account.connectedAccountId === accountId));
    const posts = await fetchQuery(api.social.listPosts, {}, { token });
    const composio = new Composio();
    const items: AccountAnalytics[] = [];
    for (let offset = 0; offset < accounts.length; offset += 3) {
      items.push(...await Promise.all(accounts.slice(offset, offset + 3).map(async (account: any) => {
        let item = base(account, days);
        const cached = await fetchQuery(api.social.getAnalyticsSnapshot, { connectedAccountId: account.connectedAccountId, days, targetId: item.targetId }, { token });
        const previous = cached?.data?.version === 2 ? cached.data as AccountAnalytics : null;
        if (previous && ((previous.retryAfter || 0) > Date.now() || (params.get("refresh") !== "1" && Date.now() - previous.updatedAt < 15 * 60_000))) return previous;
        try {
          if (!toolkits[account.channel]) return { ...item, status: "unsupported" as const, note: "Analytics are unavailable for this channel." };
          const session = await composio.create(String(user._id), composioSocialSessionOptions(toolkits[account.channel], account.connectedAccountId));
          const execute: SocialExecute = async (slug, args) => {
            const result = await session.execute(slug, args);
            if (result.error || (result as any).successful === false) throw new Error(String(result.error || "Provider rejected analytics."));
            const payload = analyticsData(result);
            if (payload?.error && payload.error.code !== "ok" && (typeof payload.error === "string" || payload.error.code || payload.error.message)) {
              throw new Error(typeof payload.error === "string" ? payload.error : `${payload.error.code || ""}: ${payload.error.message || "Provider rejected analytics."}`);
            }
            return result;
          };
          item = await report(item, posts, execute);
          if (!item.metrics.length && item.status === "ready") item = { ...item, status: "partial", note: "The provider returned no metrics for this period. Missing data is not zero." };
        } catch (error) {
          const failed = failure(item, error);
          item = item.metrics.length ? { ...item, status: "partial", note: failed.note, retryAfter: failed.retryAfter }
            : previous?.metrics.length ? { ...previous, status: "stale", note: failed.note, retryAfter: failed.retryAfter } : failed;
        }
        await fetchMutation(api.social.saveAnalyticsSnapshot, { connectedAccountId: account.connectedAccountId,
          channel: account.channel, days, targetId: item.targetId, data: item }, { token }).catch(() => {});
        return item;
      })));
    }
    return Response.json({ days, items, refreshedAt: Date.now() });
  } catch {
    return Response.json({ error: "analytics_failed", message: "Unable to load analytics. Check your connection and retry." }, { status: 502 });
  }
}
