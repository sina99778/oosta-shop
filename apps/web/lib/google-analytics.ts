const GA_MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;
const PUBLIC_GA_ROUTE = /^\/(?:en|fa)(?:\/(?:products|blog)(?:\/[a-z0-9-]+)?|\/p\/[a-z0-9-]+)?\/?$/;

/** Validate GA4 measurement ID format to block empty or malformed values. */
export function parseGaMeasurementId(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed && GA_MEASUREMENT_ID.test(trimmed) ? trimmed : null;
}

/** True only for public storefront routes; private/recovery paths stay unmeasured by GA. */
export function isGaTrackablePath(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && PUBLIC_GA_ROUTE.test(pathname);
}

export function gaPageViewFields(pathname: string, origin: string, referrer: string) {
  if (!isGaTrackablePath(pathname)) return null;
  let referrerOrigin = origin;
  if (referrer) {
    try {
      const source = new URL(referrer);
      if (source.protocol === "https:" || source.protocol === "http:") {
        referrerOrigin = source.origin;
      }
    } catch {
      // Ignore malformed referrers and keep the storefront origin.
    }
  }
  return {
    page_path: pathname,
    page_location: `${origin}${pathname}`,
    page_referrer: `${referrerOrigin}/`,
    page_title: pathname,
  };
}
