import { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
export type JobAccess = { taskId: Id<"durableTasks">; internalSecret: string };
export function jobConvexClient(jobAccess: JobAccess): ConvexHttpClient {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const allowed = new Set([
    "cloudAdmin:ensureForConversation",
    "cloudAdmin:getOverview",
    "cloudAdmin:configureFromPublish",
    "artifacts:listByConversation",
    "conversations:updateProjectPlatforms",
  ]);
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "query" || prop === "mutation")
        return (fn: any, args: any) => {
          if (!allowed.has(getFunctionName(fn)))
            throw new Error("Job attempted an unscoped operation");
          return (target[prop] as any).call(target, fn, { ...args, jobAccess });
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
