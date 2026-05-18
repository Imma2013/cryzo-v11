import type { AppConnection } from "@/lib/composio-apps";

type CachedConnections = {
  data: { toolkits: AppConnection[] };
  ts: number;
};

const TTL = 15_000;
const cache = new Map<string, CachedConnections>();

export function getCachedConnections(userId: string) {
  const cached = cache.get(userId);
  if (!cached || Date.now() - cached.ts >= TTL) return null;
  return cached.data;
}

export function setCachedConnections(
  userId: string,
  data: CachedConnections["data"],
) {
  cache.set(userId, { data, ts: Date.now() });
}

export function invalidateConnectionsCache(userId: string) {
  cache.delete(userId);
}
