import { spawnSync } from "node:child_process";

function run(command, args, quiet = false) {
  const result = spawnSync(command, args, { stdio: quiet ? "pipe" : "inherit", env: process.env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(quiet ? "Protected Convex configuration failed. Check deployment credentials." : command + " failed.");
}
function advisory(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env, encoding: "utf8" });
  if (result.status !== 0) console.warn("Managed model smoke check reported an operational issue; deployment will continue and the model remains retryable.");
}
run("npm", ["test"]);
if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production") run(process.execPath, ["scripts/smoke-apps.mjs"]);
if (process.env.VERCEL_ENV === "preview") {
  advisory(process.execPath, ["scripts/smoke-managed-models.mjs", ...(process.env.CRYZO_SMOKE_MODE === "critical" ? ["--critical-only"] : [])]);
  run("npm", ["run", "build"]);
} else if (process.env.VERCEL_ENV === "production") {
  if (!process.env.CONVEX_DEPLOY_KEY || !process.env.CRYZO_INTERNAL_API_SECRET) throw new Error("Production deployment credentials are missing.");
  advisory(process.execPath, ["scripts/smoke-managed-models.mjs"]);
  // Validate the frontend before changing the production backend.
  run("npm", ["run", "build"]);
  for (const name of ["CRYZO_INTERNAL_API_SECRET", "OPENROUTER_API_KEY", "COMPOSIO_TWITTER_AUTH_CONFIG_ID",
    "COMPOSIO_FACEBOOK_AUTH_CONFIG_ID", "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID", "COMPOSIO_YOUTUBE_AUTH_CONFIG_ID",
    "COMPOSIO_REDDIT_AUTH_CONFIG_ID", "COMPOSIO_TIKTOK_AUTH_CONFIG_ID"]) {
    if (process.env[name]) run(process.execPath, ["node_modules/convex/bin/main.js", "env", "set", name, process.env[name]], true);
  }
  run(process.execPath, ["node_modules/convex/bin/main.js", "deploy", "--cmd", "npm run build"]);
} else {
  run("npm", ["run", "build"]);
}
