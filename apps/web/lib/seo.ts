// Server-side helpers for SEO (metadata, JSON-LD, sitemap, robots).

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Server-side fetches must go straight to the API container over the Docker
// network (API_INTERNAL_URL=http://api:4000) — NEVER through the public domain.
// Routing them via the CDN hairpins web -> internet -> CDN edge -> same VPS; if
// the edge is slow or blocks the server's IP, every page render hangs and the
// whole site 504s.
const INTERNAL_API = process.env.API_INTERNAL_URL || API;

// Public site origin, derived from the dedicated web URL env, or API URL (…/api → …).
export function siteUrl(): string {
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || process.env.WEB_BASE_URL;
  if (webUrl) return webUrl.replace(/\/$/, "");

  const base = API.replace(/\/api\/?$/, "");
  return base || "http://localhost:3000";
}

// Public API origin — for URLs that ship to the BROWSER (og:image, <img src>).
export function apiOrigin(): string {
  return API;
}

// Cached by default (Next data cache, refreshed in the background every
// `revalidateSeconds`) so repeat page renders cost ~0 API round-trips.
// Pass 0 to bypass the cache (rarely needed — e.g. the sitemap).
export async function fetchJson<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  try {
    // Hard 5s cap: a slow/unreachable API degrades the page (defaults render)
    // instead of hanging the request until the gateway times out.
    const res = await fetch(`${INTERNAL_API}${path}`, {
      ...(revalidateSeconds > 0
        ? { next: { revalidate: revalidateSeconds } }
        : { cache: "no-store" as const }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
