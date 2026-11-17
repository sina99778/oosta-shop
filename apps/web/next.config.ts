import path from "node:path";
import type { NextConfig } from "next";

// Origin of the API as seen by the browser (same origin behind nginx in
// production: https://domain/api; http://localhost:4000 in development).
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").origin;
  } catch {
    return "";
  }
})();
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. 'unsafe-inline' scripts are required by Next.js
// hydration and the pre-paint theme script (no nonce pipeline); everything else
// is locked down: no plugins, no framing of the site, no foreign form targets.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Product images may be external https URLs set by the admin.
  `img-src 'self' data: blob: https: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isDev ? " ws:" : ""}`,
  // Blog video embeds (Markdown `!video`).
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.aparat.com",
  `media-src 'self' https: ${apiOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .replace(/\s+/g, " ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Ignored by browsers over plain HTTP, enforced once the site is served over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for Docker.
  output: "standalone",
  // Trace workspace dependencies from the monorepo root so the bundle is complete.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
