"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { PlanDetail } from "@/lib/types";
import { availabilityOf } from "@/lib/product-availability";
type Quote = {
  planId: string;
  amount: number;
  range: { min: number; max: number };
  currency: string;
  expiresAt: string;
  kind: "INDICATIVE";
  checkoutEnabled: false;
  fx?: null | {
    source: "NAVASAN_FREE";
    sampled: true;
    fetchedAt: string;
    updatedAt: string;
    refreshIntervalHours: number;
  };
};
export function quoteErrorMessage(error: unknown, fa: boolean) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return fa ? "برای استعلام دوباره وارد حسابت شو." : "Sign in again to request a quote.";
    if (error.status === 429)
      return fa
        ? "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کن."
        : "Too many requests. Please try again shortly.";
    if (error.code === "PRICING_UNAVAILABLE")
      return fa
        ? "قیمت‌گذاری موقتاً در دسترس نیست؛ کمی بعد دوباره استعلام بگیر."
        : "Pricing is temporarily unavailable. Please request a quote again shortly.";
    if (error.code === "NO_CURRENT_OFFER")
      return fa
        ? "این ترکیب فعلاً نزد تأمین‌کننده موجود نیست؛ گزینهٔ دیگری انتخاب کن."
        : "This configuration is currently unavailable. Choose another option.";
  }
  return fa ? "استعلام انجام نشد؛ دوباره تلاش کن." : "Unable to request a quote. Please retry.";
}
export function SupplierQuotePanel({
  plan,
  token,
  locale,
  onLogin,
}: {
  plan: PlanDetail;
  token: string | null;
  locale: Locale;
  onLogin: () => void;
}) {
  const fa = locale === "fa";
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!quote) return;
    const timeout = setTimeout(
      () => {
        setQuote(null);
        setError(
          fa
            ? "اعتبار قیمت تمام شد؛ دوباره استعلام بگیر."
            : "The price has expired. Request a new quote.",
        );
      },
      Math.max(0, Date.parse(quote.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [quote, fa]);
  async function inquire() {
    if (!token) {
      onLogin();
      return;
    }
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      const result = await api.post<{ quote: Quote }>(
        "/supplier-quotes",
        { planId: plan.id, quantity: 1 },
        token,
      );
      if (Date.parse(result.quote.expiresAt) > Date.now()) setQuote(result.quote);
      else setError(fa ? "استعلام منقضی شد؛ دوباره تلاش کن" : "Quote expired. Please retry.");
    } catch (e) {
      setError(quoteErrorMessage(e, fa));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-5 space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <p className="text-sm leading-7">
        {fa
          ? "خرید مستقیم این پلن فعلاً فعال نیست. قیمت و موجودی را می‌توانی استعلام بگیری."
          : "Direct checkout is currently disabled for this plan. You can check price and stock."}
      </p>
      <Button type="button" onClick={inquire} disabled={busy} className="w-full">
        {busy
          ? fa
            ? "در حال استعلام…"
            : "Checking…"
          : availabilityOf(plan) === "OUT_OF_STOCK"
            ? fa
              ? "بررسی دوبارهٔ موجودی و قیمت"
              : "Recheck stock and price"
            : fa
              ? "استعلام قیمت"
              : "Check price"}
      </Button>
      {error && (
        <p role="alert" className="text-sm leading-6 text-danger">
          {error}
        </p>
      )}
      {quote && (
        <div role="status">
          <p className="text-lg font-semibold tabular-nums">
            {formatPrice(quote.range.min, quote.currency, locale)}
            {quote.range.max !== quote.range.min &&
              ` — ${formatPrice(quote.range.max, quote.currency, locale)}`}
          </p>
          {quote.fx?.sampled && (
            <p className="mt-2 text-xs leading-6 text-muted">
              {fa
                ? "برآورد با نرخ نمونه‌برداری‌شدهٔ نوسان؛ زمان نرخ منبع: "
                : "Estimate using a sampled Navasan rate; source time: "}
              <time>{new Date(quote.fx.updatedAt).toLocaleString(fa ? "fa-IR" : "en-US")}</time>
              {fa
                ? " — دریافت مشترک هر ۸ ساعت؛ نرخ لحظه‌ای نیست."
                : " — Shared refresh every 8 hours; not a live rate."}
            </p>
          )}
          <p className="mt-2 text-xs leading-6 text-muted">
            {fa
              ? "این قیمت برآوردی است و تا پایان اعتبار استعلام نمایش داده می‌شود."
              : "This price is an estimate until the quote expires."}
          </p>
        </div>
      )}
      <p className="text-xs leading-6 text-muted">
        {fa
          ? "انتخاب نوع، ضمانت یا شیوهٔ تحویل جدید به استعلام تازه نیاز دارد"
          : "Changing configuration requires a fresh price inquiry"}
      </p>
    </section>
  );
}
