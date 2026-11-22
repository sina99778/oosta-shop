"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { cartChangedEvent, isGuestCartChange, notifyCartChanged } from "@/lib/cart-events";
import { cartReviewRecovery, isInvoiceExpired } from "@/lib/cart-review";
import { useGuestCart } from "@/lib/guest-cart";
import { formatDate, formatPrice } from "@/lib/format";
import { planDisplayLabel } from "@/lib/product-variant";
import type { Locale } from "@/lib/i18n";
import type { CreateOrderResponse, PaymentMethod } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { GuestCartItems } from "./guest-cart-items";

type Notice = "UNAVAILABLE" | "PRICE_UNAVAILABLE" | "PRICE_INCREASE" | null;
type Line = {
  id: string;
  product: string;
  slug: string;
  label: string;
  notice: Notice;
  currency: string;
  amount: string | null;
  savedAmount: string;
  expiresAt: string;
  supplier: boolean;
};
type Invoice = {
  id: string;
  currency: string;
  items: { id: string; product: string; label: string; amount: string; notice: Notice }[];
  subtotal: string;
  discount: string;
  total: string;
  quoteId?: string;
  revision?: string;
  expiresAt: string;
  methods: { online: boolean; cardToCard: boolean };
};
const panel = "rounded-2xl border border-border bg-card p-5 sm:p-7";
const secondary =
  "inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4";
function alertText(notice: Notice, fa: boolean) {
  if (notice === "UNAVAILABLE")
    return fa
      ? "این گزینه دیگر موجود نیست یا مشخصاتش تغییر کرده است."
      : "This option sold out or its terms changed.";
  if (notice === "PRICE_UNAVAILABLE")
    return fa
      ? "قیمت فعلی قابل استعلام نیست. کمی بعد دوباره بررسی کن."
      : "The current price is unavailable. Check again shortly.";
  if (notice === "PRICE_INCREASE")
    return fa
      ? "قیمت این گزینه دست‌کم ۱۰۰ هزار تومان افزایش یافته است."
      : "The price increased by at least 100,000 toman.";
  return null;
}
function failure(error: unknown, fa: boolean) {
  if (error instanceof ApiError && error.code === "WELCOME_GIFT_USED")
    return fa
      ? "این هدیه برای اولین خرید است و اولین پرداختت قبلاً ثبت شده."
      : "This gift was only available for your first purchase.";
  if (error instanceof ApiError && error.code === "WELCOME_GIFT_PENDING")
    return fa
      ? "یک سفارش باز داری. وضعیت پرداختش را در داشبورد بررسی کن."
      : "You have an open order. Check its payment status in your dashboard.";
  if (error instanceof ApiError && error.code === "INVALID_DISCOUNT_CODE")
    return fa ? "کد تخفیف معتبر نیست." : "The discount code is invalid.";
  if (
    error instanceof ApiError &&
    ["CART_CHANGED", "SUPPLIER_QUOTE_EXPIRED"].includes(error.code ?? "")
  )
    return fa
      ? "قیمت یا موجودی عوض شده است. فاکتور تازه بگیر."
      : "Price or availability changed. Request a new invoice.";
  if (error instanceof ApiError && error.code === "BLU_STOCK_ORDER_OPEN")
    return fa
      ? "یک صورتحساب در انتظار پرداخت داری. آن را در داشبورد بررسی کن."
      : "An invoice is awaiting payment. Check your dashboard.";
  if (error instanceof ApiError && error.code === "NOT_FOUND")
    return fa
      ? "این کالا دیگر در سبد نیست یا مهلتش تمام شده است."
      : "This item is no longer in your cart or has expired.";
  if (error instanceof ApiError && error.code === "OUT_OF_STOCK")
    return fa
      ? "موجودی یکی از کالاها تغییر کرده است. به سبد برگرد و گزینه‌های موجود را بررسی کن."
      : "An item is no longer available. Go back to your cart and review the available options.";
  return fa
    ? "عملیات انجام نشد. وضعیت سفارش را بررسی کن و دوباره تلاش کن."
    : "The request failed. Check your orders before retrying.";
}
export function ShoppingCart({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const {
    token: authToken, user, loading: authLoading, sessionError, retrySession,
    guestCartTransfer, retryGuestCartTransfer,
  } = useAuth();
  const customer = user?.role === "USER";
  const token = customer ? authToken : null;
  const guestCart = useGuestCart();
  const { data, error, loading, refetch } = useApi<{ lines: Line[] }>(
    token ? "/cart" : null,
    token ?? undefined,
  );
  const [removing, setRemoving] = useState<string>();
  const [message, setMessage] = useState("");
  const groups = new Map<string, Line[]>();
  for (const line of data?.lines ?? []) {
    if (!line.supplier && line.amount !== null)
      groups.set(line.currency, [...(groups.get(line.currency) ?? []), line]);
  }
  useEffect(() => {
    if (!token) return;
    const refresh = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const timer = setInterval(refresh, 60000);
    const refreshCart = (event: Event) => {
      if (!isGuestCartChange(event)) refetch();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(cartChangedEvent, refreshCart);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(cartChangedEvent, refreshCart);
    };
  }, [token, refetch]);
  async function remove(id: string) {
    setRemoving(id);
    setMessage("");
    try {
      await api.del("/cart/items/" + id, token ?? undefined);
      notifyCartChanged();
    } catch (error) {
      setMessage(failure(error, fa));
    } finally {
      setRemoving(undefined);
    }
  }
  return (
    <Container className="max-w-4xl space-y-5 py-10 sm:py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">{fa ? "سبد خرید" : "Shopping cart"}</h1>
        <p className="text-sm leading-7 text-muted">
          {fa
            ? "هر گزینه تا ۲۴ ساعت در سبد می‌ماند. موجودی هنگام شروع پرداخت بررسی می‌شود. کالاهای فروشگاه را می‌توانی یکجا پرداخت کنی. کالاهای تأمین‌کننده فاکتور جدا دارند."
            : "Items stay in your cart for 24 hours. Stock is checked when payment starts. Store items can be paid for together. Supplier items have separate invoices."}
        </p>
      </header>
      {authLoading && <p role="status">{fa ? "در حال بررسی ورود…" : "Checking your session…"}</p>}
      {!authLoading && sessionError && (
        <p role="alert" className="flex flex-wrap items-center gap-3">
          {fa ? "وضعیت ورود مشخص نشد." : "Your sign-in status could not be checked."}
          <Button type="button" variant="outline" onClick={retrySession}>{fa ? "تلاش دوباره" : "Retry"}</Button>
        </p>
      )}
      {!authLoading && !sessionError && !user && <GuestCartItems locale={locale} signedIn={false} />}
      {user?.role === "ADMIN" && <p className={panel}>
        {fa ? "برای خرید وارد حساب مشتری شو." : "Sign in with a customer account to shop."}
      </p>}
      {token && guestCart.length > 0 && guestCartTransfer?.status === "moving" && (
        <p role="status">{fa ? "در حال انتقال سبد مهمان…" : "Moving your guest cart…"}</p>
      )}
      {token && guestCartTransfer && guestCartTransfer.unavailable > 0 && (
        <p role="status" className="rounded-xl border border-border p-3 text-sm">
          {fa ? "پلن‌هایی که دیگر موجود نبودند از سبد مهمان حذف شدند." :
            "Items that were no longer available were removed from the guest cart."}
        </p>
      )}
      {token && guestCart.length > 0 && guestCartTransfer?.status !== "moving" && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 p-3 text-sm">
          <p>{guestCartTransfer?.status === "full"
            ? fa ? "سبد حساب پر است. اقلام باقی‌مانده در این مرورگر ذخیره‌اند. یک قلم از سبد حساب حذف کن و دوباره انتقال بده."
                 : "Your cart is full. The remaining items are saved in this browser. Remove an account cart item and retry."
            : guestCartTransfer?.status === "error"
              ? fa ? "انتقال بعضی اقلام کامل نشد. می‌توانی دوباره تلاش کنی."
                   : "Some items could not be moved. Try the transfer again."
              : fa ? "می‌توانی اقلام ذخیره‌شده در این مرورگر را به سبد حساب منتقل کنی."
                   : "You can move the items saved in this browser to your account cart."}</p>
          <Button type="button" variant="outline" onClick={retryGuestCartTransfer}>
            {fa ? "تلاش دوباره برای انتقال" : "Retry transfer"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert">
          {failure(error, fa)}{" "}
          <Button variant="outline" onClick={refetch}>
            {fa ? "تلاش دوباره" : "Retry"}
          </Button>
        </p>
      )}
      {message && (
        <p role="alert" className="text-danger">
          {message}
        </p>
      )}
      {loading && !data && <p role="status">{fa ? "در حال خواندن سبد…" : "Loading your cart…"}</p>}
      {data?.lines.length === 0 && guestCart.length === 0 && (
        <p className={panel}>{fa ? "سبد خریدت خالی است." : "Your cart is empty."}</p>
      )}
      {[...groups]
        .filter(([, lines]) => lines.length > 1)
        .map(([currency, [first, ...rest]]) => (
          <Link
            key={currency}
            href={{
              pathname: `/${locale}/cart/review/${first.id}`,
              query: { with: rest.map((line) => line.id).join(",") },
            }}
            className="oosta-button inline-flex min-h-11 items-center px-5"
          >
            {fa
              ? `بازبینی فاکتور ${(rest.length + 1).toLocaleString("fa-IR")} کالا`
              : `Review invoice for ${rest.length + 1} items`}
          </Link>
        ))}
      {data?.lines.map((line) => (
        <article key={line.id} className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                className="font-semibold text-primary"
                href={`/${locale}/products/${line.slug}`}
              >
                <bdi>{line.product}</bdi>
              </Link>
              <p className="mt-1 break-words text-sm text-muted">
                <bdi>{planDisplayLabel(line.label, fa)}</bdi>
              </p>
            </div>
            {line.amount !== null && (
              <p className="font-semibold tabular-nums">
                {formatPrice(Number(line.amount), line.currency, locale)}
              </p>
            )}
          </div>
          <p className="mt-3 text-sm text-muted">
            {fa ? "مهلت سبد" : "Cart expires"} ·{" "}
            <time dateTime={line.expiresAt}>{formatDate(line.expiresAt, locale)}</time>
          </p>
          {line.notice && (
            <p
              role="status"
              className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"
            >
              {alertText(line.notice, fa)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {line.amount !== null && (
              <Link
                className="oosta-button inline-flex min-h-11 items-center px-5"
                href={`/${locale}/cart/review/${line.id}`}
              >
                {fa ? "بازبینی فاکتور" : "Review invoice"}
              </Link>
            )}
            {line.notice === "UNAVAILABLE" && (
              <Link className={secondary} href={`/${locale}/products/${line.slug}`}>
                {fa ? "انتخاب پلن دیگر" : "Choose another plan"}
              </Link>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!!removing}
              onClick={() => void remove(line.id)}
            >
              {fa ? "حذف از سبد" : "Remove"}
            </Button>
          </div>
        </article>
      ))}
      {token && guestCartTransfer?.status !== "moving" && <GuestCartItems locale={locale} signedIn />}
      <Link href={`/${locale}/products`} className={secondary}>
        {fa ? "ادامهٔ انتخاب محصولات" : "Continue shopping"}
      </Link>
    </Container>
  );
}

type CartReviewProps = {
  locale: Locale;
  id: string;
  extraIds: string[];
};

export function CartReview(props: CartReviewProps) {
  const { token } = useAuth();
  return token ? <CartReviewForm {...props} key={token} token={token} /> : null;
}

function CartReviewForm({ locale, id, extraIds, token }: CartReviewProps & { token: string }) {
  const fa = locale === "fa";
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice>();
  const [entered, setEntered] = useState("");
  const [applied, setApplied] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [expiredAt, setExpiredAt] = useState<string | null>(null);
  const running = useRef(false);
  const path = "/cart/items/" + encodeURIComponent(id);
  const expired = Boolean(invoice && expiredAt === invoice.expiresAt);
  const recovery = message ? cartReviewRecovery(errorCode, Boolean(invoice)) : null;

  useEffect(() => {
    let current = true;
    api
      .post<{ invoice: Invoice }>(path + "/review", { extraIds }, token)
      .then((data) => {
        if (current) {
          setInvoice(data.invoice);
          setErrorCode(null);
          setExpiredAt(null);
        }
      })
      .catch((error) => {
        if (current) {
          setErrorCode(error instanceof ApiError ? (error.code ?? null) : null);
          setMessage(failure(error, fa));
        }
      });
    return () => {
      current = false;
    };
  }, [path, token, fa, extraIds]);

  useEffect(() => {
    if (!invoice) return;
    const expiresAt = invoice.expiresAt;
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now());
    const timer = setTimeout(
      () => setExpiredAt(expiresAt),
      Number.isFinite(delay) ? Math.min(delay, 2147483647) : 0,
    );
    return () => clearTimeout(timer);
  }, [invoice]);

  function handleError(error: unknown) {
    const code = error instanceof ApiError ? (error.code ?? null) : null;
    if (
      code &&
      ["CART_CHANGED", "SUPPLIER_QUOTE_EXPIRED", "OUT_OF_STOCK", "NOT_FOUND"].includes(code)
    )
      setInvoice(undefined);
    setErrorCode(code);
    setMessage(failure(error, fa));
  }

  async function refresh(value: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    setErrorCode(null);
    try {
      const data = await api.post<{ invoice: Invoice }>(
        path + "/review",
        { extraIds, ...(value ? { code: value } : {}) },
        token,
      );
      setInvoice(data.invoice);
      setExpiredAt(null);
      setApplied(value);
      setEntered(value);
    } catch (error) {
      handleError(error);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function pay(method: PaymentMethod) {
    if (!invoice || running.current) return;
    if (isInvoiceExpired(invoice.expiresAt)) {
      setExpiredAt(invoice.expiresAt);
      setErrorCode("INVOICE_EXPIRED");
      setMessage(
        fa
          ? "مهلت این فاکتور تمام شد. برای ادامه، فاکتور تازه بگیر."
          : "This invoice expired. Request a fresh invoice to continue.",
      );
      return;
    }
    running.current = true;
    setBusy(true);
    setMessage("");
    setErrorCode(null);
    try {
      const result = await api.post<CreateOrderResponse>(
        path + "/pay",
        {
          method,
          subtotal: invoice.subtotal,
          total: invoice.total,
          quoteId: invoice.quoteId,
          revision: invoice.revision,
          extraIds,
          ...(applied ? { code: applied } : {}),
        },
        token,
      );
      notifyCartChanged();
      if (method === "card_to_card") {
        router.push(`/${locale}/checkout/card/${encodeURIComponent(result.order.id)}`);
      } else if (result.order.paymentStatus === "PAID") {
        router.push(`/${locale}/dashboard/orders/${encodeURIComponent(result.order.id)}`);
      } else {
        const url = new URL(result.payment?.redirectUrl ?? "");
        if (
          url.protocol !== "https:" &&
          !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
        )
          throw new Error();
        window.location.assign(url.href);
      }
    } catch (error) {
      handleError(error);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const price = (value: string) => formatPrice(Number(value), invoice?.currency ?? "IRR", locale);
  return (
    <Container className="max-w-3xl space-y-5 py-10 sm:py-16">
      <Link href={`/${locale}/cart`} className={secondary}>
        {fa ? "بازگشت به سبد" : "Back to cart"}
      </Link>
      <h1 className="text-3xl font-semibold sm:text-4xl">{fa ? "تأیید سفارش" : "Confirm order"}</h1>
      {message && (
        <div role="alert" className="space-y-3 rounded-xl border border-border p-4 text-sm">
          <p>{message}</p>
          {recovery === "refresh" && (
            <Button type="button" disabled={busy} onClick={() => void refresh(applied)}>
              {fa ? "دریافت فاکتور تازه" : "Get fresh invoice"}
            </Button>
          )}
          {recovery === "cart_or_products" && (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/${locale}/cart`}
                className="oosta-button inline-flex min-h-11 items-center px-5"
              >
                {fa ? "بازگشت به سبد خرید" : "Back to cart"}
              </Link>
              <Link href={`/${locale}/products`} className={secondary}>
                {fa ? "انتخاب پلن دیگر" : "Choose another plan"}
              </Link>
            </div>
          )}
          {recovery === "orders" && (
            <Link
              href={`/${locale}/dashboard#account-orders`}
              className="oosta-button inline-flex min-h-11 items-center px-5"
            >
              {fa ? "مشاهدهٔ سفارش‌ها" : "View orders"}
            </Link>
          )}
          {recovery === "retry" && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void refresh(applied)}
            >
              {fa ? "بازبینی دوباره" : "Review again"}
            </Button>
          )}
        </div>
      )}
      {!invoice && !message && (
        <p role="status">{fa ? "در حال آماده‌سازی فاکتور…" : "Preparing invoice…"}</p>
      )}
      {invoice && (
        <section className={panel}>
          <ul className="divide-y divide-border">
            {invoice.items.map((item) => (
              <li key={item.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">
                      <bdi>{item.product}</bdi>
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      <bdi>{planDisplayLabel(item.label, fa)}</bdi>
                    </p>
                  </div>
                  <p className="tabular-nums">{price(item.amount)}</p>
                </div>
                {item.notice && (
                  <p role="status" className="mt-3 rounded-xl bg-primary/5 p-3 text-sm">
                    {alertText(item.notice, fa)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              void refresh(entered.trim().toUpperCase());
            }}
          >
            <label htmlFor="cart-discount" className="mb-2 block text-sm font-medium">
              {fa ? "کد تخفیف" : "Discount code"}
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="cart-discount"
                value={entered}
                onChange={(e) => setEntered(e.target.value)}
                disabled={busy}
                maxLength={48}
                dir="ltr"
                className="w-full grow sm:w-48"
              />
              <Button variant="outline" type="submit" disabled={busy || !entered.trim()}>
                {fa ? "اعمال کد" : "Apply"}
              </Button>
              {applied && (
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() => void refresh("")}
                >
                  {fa ? "حذف کد" : "Remove code"}
                </Button>
              )}
            </div>
            {applied && (
              <p role="status" className="mt-2 text-sm text-primary">
                {fa ? "کد اعمال شد." : "Code applied."}
              </p>
            )}
            <Link href={`/${locale}/dashboard/inbox`} className={secondary}>
              {fa
                ? "مشاهدهٔ کد هدیهٔ خرید اول در صندوق پیام"
                : "Find your first-purchase gift code in your inbox"}
            </Link>
          </form>
          <dl className="mt-6 space-y-3 border-t border-border pt-5">
            <div className="flex justify-between">
              <dt>{fa ? "مبلغ کالا" : "Subtotal"}</dt>
              <dd>{price(invoice.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{fa ? "تخفیف" : "Discount"}</dt>
              <dd>{price(invoice.discount)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
              <dt>{fa ? "مبلغ قابل پرداخت" : "Total due"}</dt>
              <dd>{price(invoice.total)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted">
            {fa ? "اعتبار فاکتور تا" : "Invoice valid until"}{" "}
            <time dateTime={invoice.expiresAt}>{formatDate(invoice.expiresAt, locale)}</time>
          </p>
          {expired && !message && (
            <div role="alert" className="mt-4 space-y-3 rounded-xl border border-border p-4 text-sm">
              <p>
                {fa
                  ? "مهلت این فاکتور تمام شد. برای ادامه، فاکتور تازه بگیر."
                  : "This invoice expired. Request a fresh invoice to continue."}
              </p>
              <Button type="button" disabled={busy} onClick={() => void refresh(applied)}>
                {fa ? "دریافت فاکتور تازه" : "Get fresh invoice"}
              </Button>
            </div>
          )}
          <div className="mt-6 grid gap-3">
            {invoice.methods.cardToCard && (
              <Button disabled={busy || expired} onClick={() => void pay("card_to_card")}>
                {fa ? "تأیید و کارت‌به‌کارت" : "Confirm and pay by card transfer"}
              </Button>
            )}
            {invoice.methods.online && (
              <Button disabled={busy || expired} onClick={() => void pay("online")}>
                {fa ? "تأیید و پرداخت آنلاین" : "Confirm and pay online"}
              </Button>
            )}
            {!invoice.methods.cardToCard && !invoice.methods.online && (
              <p role="status">
                {fa ? "روش پرداخت فعالی وجود ندارد." : "No payment method is available."}
              </p>
            )}
          </div>
        </section>
      )}
    </Container>
  );
}
