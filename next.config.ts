import type { NextConfig } from "next";

const webContainerHeaders = [
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "require-corp",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/**/*": ["./managed-model-smoke.json"] },
  async headers() {
    return [
      {
        source: "/chat",
        headers: webContainerHeaders,
      },
      {
        source: "/chat/:path*",
        headers: webContainerHeaders,
      },
    ];
  },
};

export default nextConfig;
