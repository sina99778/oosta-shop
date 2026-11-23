"use client";

import { useCallback, useSyncExternalStore } from "react";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { IndicativePrice } from "@/lib/types";

export function IndicativePriceLabel({
  price,
  locale,
  from = false,
  compact = false,
}: {
  price?: IndicativePrice | null;
  locale: Locale;
  from?: boolean;
  compact?: boolean;
}) {
  const expiresAt = Date.parse(price?.expiresAt ?? "");
  const isFresh = useCallback(() => expiresAt > Date.now(), [expiresAt]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const remaining = expiresAt - Date.now();
      if (!(remaining > 0)) return () => {};
      const timer = window.setTimeout(onChange, remaining);
      return () => window.clearTimeout(timer);
    },
    [expiresAt],
  );
  // The server validates the supplied price before rendering; keep that snapshot stable during hydration.
  const fresh = useSyncExternalStore(subscribe, isFresh, () => Boolean(price));
  const fa = locale === "fa";
  if (!price || !fresh)
    return <small className="text-muted">{fa ? "قیمت با استعلام" : "Price on request"}</small>;

  return (
    <>
      <small className="block text-muted">
        {from
          ? fa
            ? "قیمت تقریبی از"
            : "Estimated price from"
          : fa
            ? "قیمت تقریبی"
            : "Estimated price"}
      </small>
      <strong className={from || compact ? undefined : "text-3xl font-bold"}>
        <bdi>{formatPrice(price.amount, price.currency, locale)}</bdi>
      </strong>
    </>
  );
}
