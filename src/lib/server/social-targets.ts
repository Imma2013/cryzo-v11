import { analyticsData, type AnalyticsTarget } from "./social-analytics";
export type SocialExecute = (slug: string, args: Record<string, unknown>) => Promise<any>;

export async function analyticsTargets(channel: string, execute: SocialExecute): Promise<AnalyticsTarget[]> {
  const targets = new Map<string, AnalyticsTarget>();
  const seen = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    if (channel === "facebook") {
      const root = analyticsData(await execute("FACEBOOK_LIST_MANAGED_PAGES", { user_id: "me", fields: "id,name", limit: 100, ...(after ? { after } : {}) }));
      for (const entry of root?.data || []) if (entry.id && entry.name) targets.set(String(entry.id), { id: String(entry.id), name: String(entry.name) });
      if (!root?.paging?.next) return [...targets.values()];
      const cursor = root.paging.cursors?.after;
      if (!cursor || seen.has(cursor)) throw new Error("Facebook target pagination could not complete.");
      seen.add(cursor); after = cursor;
    } else if (channel === "linkedin") {
      const root = analyticsData(await execute("LINKEDIN_GET_COMPANY_INFO", { role: "ADMINISTRATOR", state: "APPROVED", start: page * 100, count: 100 }));
      const entries = root?.elements || [];
      for (const entry of entries) {
        const id = String(entry.organization || entry.organizationalTarget || "");
        if (/^urn:li:organization:\d+$/.test(id)) targets.set(id, { id, name: String(entry["organization~"]?.localizedName || entry.name || "Organization " + id.split(":").at(-1)) });
      }
      if (entries.length < 100 || (root.paging?.total != null && (page + 1) * 100 >= root.paging.total)) return [...targets.values()];
    } else return [];
  }
  throw new Error("Too many publishing targets to list in one request. Narrow the connected account.");
}
