"use client";

import { usePathname, useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const labels: Record<Locale, string> = { en: "EN", fa: "فا" };

export function LocaleSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(locale: Locale) {
    if (locale === current) return;
    const segments = pathname.split("/");
    segments[1] = locale; // replace the locale segment
    // Preserve the query string (e.g. ?category=…) so filters survive a language
    // switch. Read it at click time from the live URL — using the useSearchParams
    // hook here would force every page (this is in the global header) into a CSR
    // bail-out needing a Suspense boundary.
    const query = typeof window !== "undefined" ? window.location.search : "";
    router.push((segments.join("/") || `/${locale}`) + query);
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => switchTo(locale)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            locale === current
              ? "bg-primary text-primary-foreground"
              : "text-muted hover:text-foreground",
          )}
        >
          {labels[locale]}
        </button>
      ))}
    </div>
  );
}
