// Locale routing (Next.js 16: "Proxy" replaces Middleware). Redirects any path
// without a locale prefix to the visitor's preferred (or default) locale.

import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "@/lib/i18n";

function getLocale(request: NextRequest): string {
  const header = request.headers.get("accept-language");
  if (header) {
    for (const part of header.split(",")) {
      const code = part.split(";")[0]?.trim().split("-")[0]?.toLowerCase();
      if (code && (locales as readonly string[]).includes(code)) return code;
    }
  }
  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return;

  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Skip Next internals, API, and any file with an extension (static assets).
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
