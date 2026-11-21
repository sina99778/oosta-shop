import path from "node:path";
import type { NextConfig } from "next";
import { PRODUCT_REDIRECTS } from "./lib/catalog-editorial";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for Docker.
  output: "standalone",
  // Trace workspace dependencies from the monorepo root so the bundle is complete.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async redirects() {
    return Object.entries(PRODUCT_REDIRECTS).map(([from, to]) => ({
      source: `/:locale(en|fa)/products/${from}`,
      destination: `/:locale/products/${to}`,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      {
        source: "/:locale(en|fa)/:recovery(forgot-password|reset-password)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
