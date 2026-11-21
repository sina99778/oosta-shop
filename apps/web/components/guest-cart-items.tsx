"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { guestCartLifetime, removeGuestCartItem, useGuestCart } from "@/lib/guest-cart";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { IndicativePrice } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { IndicativePriceLabel } from "./indicative-price";
import { Button } from "./ui/button";

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

  if (!hasEntries)
    return signedIn ? null : (
      <p className="rounded-2xl border border-border bg-card p-5">
        {fa ? "سبد خریدت خالی است." : "Your cart is empty."}
      </p>
    );
  const available = new Map(data?.items.map((plan) => [plan.planId, plan]));
  return (
    <section className="space-y-3" aria-label={fa ? "سبد مهمان" : "Guest cart"}>
      {signedIn && (
        <h2 className="text-xl font-semibold">
          {fa ? "اقلام باقی‌مانده در این مرورگر" : "Items remaining in this browser"}
        </h2>
      )}
      {loading && <p role="status">{fa ? "در حال بررسی اقلام سبد…" : "Checking your items…"}</p>}
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-3">
          {fa ? "خواندن قیمت و موجودی ممکن نشد." : "Price and availability could not be loaded."}
          <Button type="button" variant="outline" onClick={refetch}>
            {fa ? "تلاش دوباره" : "Retry"}
          </Button>
        </p>
      )}
      {removeError && (
        <p role="alert">
          {fa
            ? "تغییر سبد در این مرورگر ذخیره نشد."
            : "Changes could not be saved in this browser."}
        </p>
      )}
      {entries.map(({ planId, addedAt }) => {
        const plan = available.get(planId);
        const expiry = new Date(addedAt + guestCartLifetime).toISOString();
        return (
          <article key={planId} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              {plan ? (
                <div>
                  <Link
                    className="font-semibold text-primary"
                    href={{
                      pathname: `/${locale}/products/${plan.slug}`,
                      query: { plan: planId },
                    }}
                  >
                    <bdi>{plan.product}</bdi>
                  </Link>
                  <p className="mt-1 break-words text-sm text-muted">
                    <bdi>{plan.label}</bdi>
                  </p>
                </div>
              ) : (
                <p>
                  {data
                    ? fa
                      ? "این پلن دیگر در فروشگاه فعال نیست."
                      : "This plan is no longer listed."
                    : fa
                      ? "پلن ذخیره‌شده"
                      : "Saved plan"}
                </p>
              )}
              {plan?.amount != null && (
                <p className="font-semibold tabular-nums">
                  {formatPrice(plan.amount, plan.currency, locale)}
                </p>
              )}
              {plan && ["SUPPLIER_STOCK", "ON_REQUEST"].includes(plan.availability) && (
                <div>
                  <IndicativePriceLabel price={plan.indicativePrice} locale={locale} />
                </div>
              )}
            </div>
            {plan?.availability === "OUT_OF_STOCK" && (
              <p className="mt-2 text-sm text-muted">
                {fa ? "در حال حاضر ناموجود است." : "Currently unavailable."}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {fa ? "مهلت سبد" : "Cart expires"} ·{" "}
                <time dateTime={expiry}>
                  {formatDate(expiry, locale)} ·{" "}
                  {new Date(expiry).toLocaleTimeString(fa ? "fa-IR" : "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  try {
                    removeGuestCartItem(planId, addedAt);
                    setRemoveError(false);
                  } catch {
                    setRemoveError(true);
                  }
                }}
              >
                {fa ? "حذف از سبد" : "Remove"}
              </Button>
            </div>
          </article>
        );
      })}
      {!signedIn && (
        <Link
          className="oosta-button inline-flex min-h-11 items-center px-5"
          href={{
            pathname: `/${locale}/login`,
            query: { next: `/${locale}/cart` },
          }}
        >
          {fa ? "ورود برای تکمیل خرید" : "Sign in to check out"}
        </Link>
      )}
    </section>
  );
}
