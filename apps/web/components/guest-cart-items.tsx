"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { guestCartLifetime, removeGuestCartItem, useGuestCart } from "@/lib/guest-cart";
import { formatDate, formatPrice } from "@/lib/format";
import { planDisplayLabel } from "@/lib/product-variant";
import type { Locale } from "@/lib/i18n";
import type { IndicativePrice } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { IndicativePriceLabel } from "./indicative-price";
import { Button } from "./ui/button";
import { AlertIcon, LineTile, TrashIcon } from "./checkout-ui";
import styles from "./checkout.module.css";

type PublicPlan = {
  planId: string;
  product: string;
  slug: string;
  label: string;
  availability: "LOCAL_STOCK" | "SUPPLIER_STOCK" | "OUT_OF_STOCK" | "ON_REQUEST";
  currency: string;
  amount: number | null;
  indicativePrice: IndicativePrice | null;
};

export function GuestCartItems({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const entries = useGuestCart();
  const fa = locale === "fa";
  const params = new URLSearchParams({ planIds: entries.map((item) => item.planId).join(",") });
  const { data, loading, error, refetch } = useApi<{ items: PublicPlan[] }>(
    entries.length ? "/cart/guest-preview?" + params : null,
  );
  const [removeError, setRemoveError] = useState(false);
  const hasEntries = entries.length > 0;
  useEffect(() => {
    if (!hasEntries) return;
    const refresh = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [hasEntries, refetch]);

  if (!hasEntries) return null;
  const available = new Map(data?.items.map((plan) => [plan.planId, plan]));
  return (
    <div aria-label={signedIn ? undefined : fa ? "سبد مهمان" : "Guest cart"}>
      {signedIn && (
        <h2 className="text-lg font-bold">
          {fa ? "اقلام باقی‌مانده در این مرورگر" : "Items remaining in this browser"}
        </h2>
      )}
      {loading && (
        <p role="status" className="mt-3 text-sm text-muted">
          {fa ? "در حال بررسی اقلام سبد…" : "Checking your items…"}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {fa ? "خواندن قیمت و موجودی ممکن نشد." : "Price and availability could not be loaded."}
          <Button type="button" variant="outline" onClick={refetch}>
            {fa ? "تلاش دوباره" : "Retry"}
          </Button>
        </p>
      )}
      {removeError && (
        <p role="alert" className="mt-3 text-sm">
          {fa
            ? "تغییر سبد در این مرورگر ذخیره نشد."
            : "Changes could not be saved in this browser."}
        </p>
      )}
      <ul className={styles.lines}>
        {entries.map(({ planId, addedAt }) => {
          const plan = available.get(planId);
          const expiry = new Date(addedAt + guestCartLifetime).toISOString();
          const name = plan?.product ?? (fa ? "پلن ذخیره‌شده" : "Saved plan");
          return (
            <li key={planId} className={styles.line}>
              <LineTile name={name} />
              <div className={styles.lineInfo}>
                {plan ? (
                  <>
                    <Link
                      href={{
                        pathname: `/${locale}/products/${plan.slug}`,
                        query: { plan: planId },
                      }}
                    >
                      <bdi>{plan.product}</bdi>
                    </Link>
                    <p>
                      <bdi>{planDisplayLabel(plan.label, fa)}</bdi>
                    </p>
                  </>
                ) : (
                  <h3>
                    {data
                      ? fa
                        ? "این پلن دیگر در فروشگاه فعال نیست."
                        : "This plan is no longer listed."
                      : name}
                  </h3>
                )}
                {plan?.availability === "OUT_OF_STOCK" && (
                  <p className={styles.lineAlert}>
                    <AlertIcon size={14} />
                    {fa ? "در حال حاضر ناموجود است." : "Currently unavailable."}
                  </p>
                )}
              </div>
              <div className={styles.lineEnd}>
                {plan?.amount != null && (
                  <span className={styles.linePrice}>
                    {formatPrice(plan.amount, plan.currency, locale)}
                  </span>
                )}
                {plan && ["SUPPLIER_STOCK", "ON_REQUEST"].includes(plan.availability) && (
                  <span className="text-sm">
                    <IndicativePriceLabel price={plan.indicativePrice} locale={locale} />
                  </span>
                )}
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={fa ? `حذف ${name} از سبد` : `Remove ${name}`}
                  onClick={() => {
                    try {
                      removeGuestCartItem(planId, addedAt);
                      setRemoveError(false);
                    } catch {
                      setRemoveError(true);
                    }
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
              <div className={styles.lineActions}>
                <span>
                  {fa ? "مهلت سبد" : "Cart expires"} ·{" "}
                  <time dateTime={expiry}>{formatDate(expiry, locale)}</time>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
