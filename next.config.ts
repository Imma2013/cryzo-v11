import type { NextConfig } from "next";

// Cryzo previews now execute in remote Vercel Sandboxes. The app no longer
// needs cross-origin isolation headers required by in-browser WebContainers,
// which also makes embedding the sandbox preview straightforward on Safari/iOS.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/**/*": ["./managed-model-smoke.json"] },
};

export default nextConfig;
