import { spawnSync } from "node:child_process";

function run(command, args, quiet = false) {
  const result = spawnSync(command, args, { stdio: quiet ? "pipe" : "inherit", env: process.env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(quiet ? "Protected Convex configuration failed. Check deployment credentials." : command + " failed.");
}
run("npm", ["test"]);
if (process.env.VERCEL_ENV === "preview") {
  run(process.execPath, ["scripts/smoke-managed-models.mjs", ...(process.env.CRYZO_SMOKE_MODE === "critical" ? ["--critical-only"] : [])]);
  run("npm", ["run", "build"]);
} else if (process.env.VERCEL_ENV === "production") {
  if (!process.env.CONVEX_DEPLOY_KEY || !process.env.CRYZO_INTERNAL_API_SECRET) throw new Error("Production deployment credentials are missing.");
  // Validate the frontend before changing the production backend.
  run("npm", ["run", "build"]);
  run(process.execPath, ["node_modules/convex/bin/main.js", "env", "set", "CRYZO_INTERNAL_API_SECRET", process.env.CRYZO_INTERNAL_API_SECRET], true);
  run(process.execPath, ["node_modules/convex/bin/main.js", "deploy", "--cmd", "npm run build"]);
} else {
  run("npm", ["run", "build"]);
}
