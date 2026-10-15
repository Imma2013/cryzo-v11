export type Metric = {
  key: string; label: string; value: number;
  aggregation: "sum" | "latest" | "weighted-average" | "provider-total";
  window: "period" | "snapshot" | "lifetime"; unit: "count" | "seconds" | "minutes";
};
export type Series = { key: string; label: string; points: Array<{ date: string; value: number }> };
export type AnalyticsTarget = { id: string; name: string };
export type AccountAnalytics = {
  version: 2; channel: string; accountId: string; accountName: string; targetId: string;
  status: "ready" | "partial" | "target_required" | "permission_required" | "rate_limited" | "unsupported" | "error" | "stale";
  metrics: Metric[]; series: Series[]; note?: string; updatedAt: number;
  period: { from: string; to: string; timezone: "UTC" };
  targets?: AnalyticsTarget[]; retryAfter?: number;
};

// Unwrap the Composio envelope without discarding Graph's paging object.
export function analyticsData(payload: any): any {
  let data = payload;
  for (let i = 0; i < 4 && data?.data && typeof data.data === "object" &&
      !Array.isArray(data.data) && !data.rows && !data.elements; i++) data = data.data;
  return data;
}
export function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
export function labelFor(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
export function countMetric(key: string, value: number, window: Metric["window"] = "period"): Metric {
  return { key, label: labelFor(key), value, aggregation: "sum", unit: "count", window };
}
export function normalizeYouTube(payload: unknown): { metrics: Metric[]; series: Series[] } {
  const data = analyticsData(payload);
  const names: string[] = (data?.columnHeaders || data?.column_headers || []).map((header: any) => String(header.name || header));
  const rows: unknown[][] = data?.rows || [];
  const day = names.indexOf("day"), views = names.indexOf("views");
  const metrics: Metric[] = [], series: Series[] = [];
  names.forEach((key, index) => {
    if (index === day) return;
    const valid = rows.filter(row => numberValue(row[index]) !== null);
    if (!valid.length) return;
    let value = valid.reduce((sum, row) => sum + numberValue(row[index])!, 0);
    const average = key === "averageViewDuration" || key === "averageViewPercentage";
    if (average) {
      const weighted = valid.filter(row => views >= 0 && numberValue(row[views]) !== null);
      const weight = weighted.reduce((sum, row) => sum + numberValue(row[views])!, 0);
      if (!weight) return;
      value = weighted.reduce((sum, row) => sum + numberValue(row[index])! * numberValue(row[views])!, 0) / weight;
    }
    metrics.push({ ...countMetric(key, value), aggregation: average ? "weighted-average" : "sum",
      unit: key === "averageViewDuration" ? "seconds" : key === "estimatedMinutesWatched" ? "minutes" : "count" });
    if (day >= 0) series.push({ key, label: labelFor(key), points: valid.map(row => ({ date: String(row[day]), value: numberValue(row[index])! })) });
  });
  return { metrics, series };
}
export function normalizeGraph(payload: unknown): { metrics: Metric[]; series: Series[] } {
  const root = analyticsData(payload);
  const entries = Array.isArray(root?.data) ? root.data : Array.isArray(root) ? root : [];
  const metrics: Metric[] = [], series: Series[] = [];
  for (const entry of entries) {
    const key = String(entry?.name || "");
    if (!key) continue;
    const points = (entry.values || []).flatMap((item: any) => {
      const value = numberValue(item.value);
      return value === null ? [] : [{ date: String(item.end_time || item.date || ""), value }];
    });
    const total = numberValue(entry.total_value?.value) ?? numberValue(entry.value);
    const snapshot = ["page_follows", "followers_count", "following_count"].includes(key);
    // Unique reach cannot be added across days. Display the latest daily value
    // unless the provider supplied an actual range total.
    const unique = /reach|unique|accounts_engaged/.test(key);
    const value = total ?? (points.length ? (snapshot || unique ? points.at(-1)!.value : points.reduce((sum: number, point: { value: number }) => sum + point.value, 0)) : null);
    if (value === null) continue;
    metrics.push({ ...countMetric(key, value, snapshot ? "snapshot" : "period"),
      label: labelFor(key) + (unique && total === null ? " (Latest Day)" : ""),
      aggregation: total !== null ? "provider-total" : snapshot || unique ? "latest" : "sum" });
    if (points.length) series.push({ key, label: labelFor(key), points });
  }
  return { metrics, series };
}
export function normalizeLinkedIn(payload: unknown): { metrics: Metric[]; series: Series[] } {
  const root = analyticsData(payload), totals = new Map<string, number>(), series = new Map<string, Series>();
  for (const entry of root?.elements || []) {
    const stats = entry.totalShareStatistics || entry.shareStatistics || {};
    for (const key of ["impressionCount", "clickCount", "likeCount", "commentCount", "shareCount"]) {
      const value = numberValue(stats[key]);
      if (value === null) continue;
      totals.set(key, (totals.get(key) || 0) + value);
      const start = numberValue(entry.timeRange?.start);
      if (start !== null) {
        const line = series.get(key) || { key, label: labelFor(key), points: [] };
        line.points.push({ date: new Date(start).toISOString().slice(0, 10), value });
        series.set(key, line);
      }
    }
  }
  return { metrics: [...totals].map(([key, value]) => countMetric(key, value)), series: [...series.values()] };
}
export function deliveryPostIds(posts: any[], channel: string, accountId: string): string[] {
  return [...new Set<string>(posts.flatMap(post => (post.deliveries || [])
    .filter((delivery: any) => delivery.channel === channel && delivery.connectedAccountId === accountId &&
      delivery.status === "published" && delivery.remotePostId)
    .map((delivery: any) => String(delivery.remotePostId))))];
}
