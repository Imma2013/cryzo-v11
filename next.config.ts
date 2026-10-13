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
const runtimeEntrySources = ["/vivari/:path*", "/vv-devtools/:path*"];
const runtimeImmutableSources = ["/assets/:path*", "/vendor/:path*"];
const runtimeResourceHeaders = [
  ...isolationHeaders,
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/**/*": ["./managed-model-smoke.json", "./vendor/design-recipes/**/*"] },
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
      ...runtimeEntrySources.map((source) => ({
        source,
        headers: [...runtimeResourceHeaders, { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      })),
      ...runtimeImmutableSources.map((source) => ({
        source,
        headers: [...runtimeResourceHeaders, { key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
    ];
  },
};

export default nextConfig;
