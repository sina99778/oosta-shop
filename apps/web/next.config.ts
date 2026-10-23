import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Origin of the API the browser talks to (same origin behind nginx in production,
// e.g. https://shop.example/api; http://localhost:4000 in development).
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").origin;
  } catch {
    return "";
  }
}
const publicOrigin = process.env.NEXT_PUBLIC_API_URL ?? "";

// Content-Security-Policy (no-nonce variant, see Next's CSP guide). Inline
// scripts stay allowed (Next's bootstrap + the pre-paint theme script), but the
// policy still blocks loading scripts from other hosts, plugins, framing the
// site (clickjacking), <base> hijacking and form posts to foreign origins.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Product images may be external URLs set by the admin.
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin()}${isDev ? " ws: http://localhost:*" : ""}`.trim(),
  // Blog video embeds.
  "frame-src https://www.youtube.com https://www.aparat.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(publicOrigin.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for Docker.
  output: "standalone",
  // Trace workspace dependencies from the monorepo root so the bundle is complete.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
