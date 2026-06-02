// Server-side helpers for SEO (metadata, JSON-LD, sitemap, robots).

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Public site origin, derived from the API URL (…/api → …).
export function siteUrl(): string {
  const base = API.replace(/\/api\/?$/, "");
  return base || "http://localhost:3000";
}

export function apiOrigin(): string {
  return API;
}

export async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
