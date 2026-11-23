"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { gaPageViewFields, isGaTrackablePath, parseGaMeasurementId } from "@/lib/google-analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

export function GoogleAnalytics() {
  const id = parseGaMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const pathname = usePathname();
  const configured = useRef(false);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fields = gaPageViewFields(window.location.pathname, window.location.origin, document.referrer);
    window[`ga-disable-${id}`] = !fields;
    if (!fields) {
      lastSent.current = null;
      return;
    }
    if (lastSent.current === fields.page_path) return;

    window.dataLayer ??= [];
    window.gtag ??= function () {
      // eslint-disable-next-line prefer-rest-params -- Match the standard Google tag queue format.
      window.dataLayer?.push(arguments);
    };
    window.gtag("set", fields);
    if (!configured.current) {
      configured.current = true;
      window.gtag("js", new Date());
      window.gtag("config", id, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
    }
    lastSent.current = fields.page_path;
    window.gtag("event", "page_view", fields);
  }, [id, pathname]);

  if (!id || !isGaTrackablePath(pathname)) return null;
  return (
    <Script
      id="oosta-ga-src"
      src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
      strategy="afterInteractive"
      referrerPolicy="no-referrer"
    />
  );
}
