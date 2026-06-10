"use client";

// Fire-and-forget page-view beacon for the first-party analytics shown in the
// admin's Telegram bot. No cookies, nothing stored client-side; admin pages are
// skipped here and re-filtered server-side.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { assetUrl } from "@/lib/api";

export function Track() {
  const pathname = usePathname();

  useEffect(() => {
    // Skip only the admin SECTION — public slugs like /fa/blog/admin-tips must track.
    if (!pathname || /^\/(en|fa)\/admin(\/|$)/.test(pathname)) return;
    fetch(assetUrl("/track"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
