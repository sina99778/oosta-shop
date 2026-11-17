"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { PlanDetail, CreateOrderResponse } from "@/lib/types";
import { availabilityOf } from "@/lib/product-availability";
type Quote = {
  planId: string;
  amount: number;
  range: { min: number; max: number };
  currency: string;
  expiresAt: string;
  id?: string;
  kind: "INDICATIVE" | "FIRM";
  checkoutEnabled: boolean;
  methods?: { online: boolean; cardToCard: boolean };
  fx?: null | {
    source: "NAVASAN_FREE";
    sampled: true;
    fetchedAt: string;
    updatedAt: string;
    refreshIntervalHours: number;
  };
};
export function canBuyFirmQuote(
  quote: Quote | null,
  planId: string,
  now = Date.now(),
): quote is Quote & { id: string } {
  return (
    !!quote &&
    quote.kind === "FIRM" &&
    quote.checkoutEnabled === true &&
    typeof quote.id === "string" &&
    quote.id.length > 0 &&
    quote.planId === planId &&
    quote.currency === "IRR" &&
    Number.isSafeInteger(quote.amount) &&
    quote.amount > 0 &&
    Date.parse(quote.expiresAt) > now
  );
}
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
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
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
    if (inFlight.current) return;
    if (!token) {
      onLogin();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      const result = await api.post<{ quote: Quote }>(
        "/supplier-quotes",
        { planId: plan.id, quantity: 1 },
        token,
      );
      if (!active.current) return;
      if (Date.parse(result.quote.expiresAt) > Date.now()) setQuote(result.quote);
      else setError(fa ? "استعلام منقضی شد؛ دوباره تلاش کن" : "Quote expired. Please retry.");
    } catch (e) {
      if (active.current) setError(quoteErrorMessage(e, fa));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function buy(method: "online" | "card_to_card") {
    if (!token || inFlight.current || !canBuyFirmQuote(quote, plan.id)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.post<CreateOrderResponse>(
        "/supplier-checkout/orders",
        { quoteId: quote.id, method },
        token,
      );
      if (!active.current) return;
      if (["PAID", "PAID_PENDING_FULFILLMENT"].includes(result.order.paymentStatus)) {
        router.push(`/${locale}/dashboard`);
        return;
      }
      if (method === "card_to_card" && result.cardToCard) {
        router.push(`/${locale}/checkout/card/${encodeURIComponent(result.order.id)}`);
        return;
      }
      const url = new URL(result.payment?.redirectUrl ?? "");
      if (
        url.protocol !== "https:" &&
        !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
      )
        throw Error("Invalid payment redirect");
      window.location.assign(url.href);
    } catch (error) {
      if (!active.current) return;
      if (
        error instanceof ApiError &&
        ["SUPPLIER_QUOTE_EXPIRED", "PAYMENT_INITIALIZATION_FAILED"].includes(error.code ?? "")
      )
        setQuote(null);
      setError(
        error instanceof ApiError && error.code === "PAYMENT_INITIALIZING"
          ? fa
            ? "درگاه در حال آماده‌شدن است؛ کمی بعد همین خرید را دوباره امتحان کن."
            : "Payment is initializing. Retry this same purchase shortly."
          : fa
            ? "پرداخت آغاز نشد؛ وضعیت سفارش را بررسی کن و دوباره تلاش کن."
            : "Payment could not start. Check your orders before retrying.",
      );
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="mt-5 space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <p className="text-sm leading-7">
        {quote?.kind === "FIRM" && quote.checkoutEnabled
          ? fa
            ? "قیمت برای همین پلن و حساب تو ثبت شده است؛ تأمین و تحویل پس از تأیید پرداخت آغاز می‌شود."
            : "This price is bound to your account and plan. Fulfillment starts after payment is verified."
          : fa
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
              ? quote.kind === "FIRM"
                ? "این مبلغ تا پایان اعتبار قیمت برای خرید ثبت شده است."
                : "این قیمت برآوردی است و تا پایان اعتبار استعلام نمایش داده می‌شود."
              : quote.kind === "FIRM"
                ? "This purchase price is valid until the quote expires."
                : "This price is an estimate until the quote expires."}
          </p>
          {canBuyFirmQuote(quote, plan.id) && quote.methods?.online && (
            <Button
              type="button"
              onClick={() => buy("online")}
              disabled={busy}
              className="mt-3 w-full"
            >
              {busy
                ? fa
                  ? "در حال آماده‌سازی پرداخت…"
                  : "Preparing payment…"
                : fa
                  ? "تأیید قیمت و پرداخت"
                  : "Confirm price and pay"}
            </Button>
          )}
          {canBuyFirmQuote(quote, plan.id) && quote.methods?.cardToCard && (
            <Button
              type="button"
              onClick={() => buy("card_to_card")}
              disabled={busy}
              className="mt-3 w-full"
            >
              {busy
                ? fa
                  ? "در حال ساخت صورتحساب…"
                  : "Preparing invoice…"
                : fa
                  ? "کارت‌به‌کارت با مبلغ یکتا"
                  : "Card transfer with a unique amount"}
            </Button>
          )}
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
