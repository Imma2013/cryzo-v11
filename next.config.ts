import type { NextConfig } from "next";

// Cryzo's in-browser runtime (Vivari) needs SharedArrayBuffer, which browsers only
// expose to cross-origin isolated documents.
const isolationHeaders = [
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "require-corp",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
];

// Static runtime files written to public/ by scripts/sync-vivari-assets.mjs. Worker
// scripts started from an isolated page must carry the same policy.
const runtimeAssetSources = ["/vivari/:path*", "/assets/:path*", "/vendor/:path*", "/vv-devtools/:path*"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/**/*": ["./managed-model-smoke.json"] },
  async headers() {
    return [
      {
        source: "/chat",
        headers: isolationHeaders,
      },
      {
        source: "/chat/:path*",
        headers: isolationHeaders,
      },
      {
        // The preview Service Worker proxies /preview/<port>/… to the dev server
        // running in the tab, so it must be allowed to claim the whole origin.
        source: "/sw.js",
        headers: [
          ...isolationHeaders,
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      ...runtimeAssetSources.map((source) => ({ source, headers: isolationHeaders })),
    ];
  },
};

export default nextConfig;
