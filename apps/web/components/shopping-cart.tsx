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
import {
  AlertIcon,
  CardIcon,
  CheckIcon,
  CartEmpty,
  CheckoutSteps,
  ClockIcon,
  LineTile,
  LockIcon,
  ReceiptIcon,
  TrashIcon,
} from "./checkout-ui";
import styles from "./checkout.module.css";
import { cn } from "@/lib/cn";

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
    token: authToken,
    user,
    loading: authLoading,
    sessionError,
    retrySession,
    guestCartTransfer,
    retryGuestCartTransfer,
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
  const lines = data?.lines ?? [];
  const itemCount = lines.length + guestCart.length;
  const digits = new Intl.NumberFormat(fa ? "fa-IR" : "en-US");
  const supplierLines = lines.filter((line) => line.supplier);
  const reviewLinks = [...groups].map(([currency, [first, ...rest]]) => ({
    currency,
    count: rest.length + 1,
    subtotal: [first, ...rest].reduce((sum, line) => sum + Number(line.amount), 0),
    href:
      rest.length > 0
        ? {
            pathname: `/${locale}/cart/review/${first.id}`,
            query: { with: rest.map((line) => line.id).join(",") },
          }
        : { pathname: `/${locale}/cart/review/${first.id}` },
  }));
  const signedInEmpty = Boolean(token && data && lines.length === 0 && guestCart.length === 0);
  const guestEmpty = !authLoading && !sessionError && !user && guestCart.length === 0;
  const secureNote = (
    <p className={styles.secure}>
      <LockIcon size={14} />
      {fa
        ? "قیمت نهایی در فاکتور دوباره بررسی می‌شود"
        : "The final price is rechecked on the invoice"}
    </p>
  );
  return (
    <Container className={styles.page}>
      <CheckoutSteps locale={locale} current={1} />
      <header className={styles.head}>
        <div className={styles.headTitle}>
          <h1>{fa ? "سبد خرید" : "Shopping cart"}</h1>
          {itemCount > 0 && (
            <span className={styles.count}>
              {digits.format(itemCount)} {fa ? "قلم" : itemCount === 1 ? "item" : "items"}
            </span>
          )}
        </div>
        <Link href={`/${locale}/products`} className={styles.textLink}>
          {fa ? "← ادامهٔ انتخاب محصولات" : "Continue shopping →"}
        </Link>
      </header>
      <p className="mb-5 max-w-3xl text-sm leading-7 text-muted">
        {fa
          ? "هر گزینه تا ۲۴ ساعت در سبد می‌ماند. موجودی هنگام شروع پرداخت بررسی می‌شود. کالاهای فروشگاه را می‌توانی یکجا پرداخت کنی. کالاهای تأمین‌کننده فاکتور جدا دارند."
          : "Items stay in your cart for 24 hours. Stock is checked when payment starts. Store items can be paid for together. Supplier items have separate invoices."}
      </p>
      <div className={styles.notices}>
        {authLoading && <p role="status">{fa ? "در حال بررسی ورود…" : "Checking your session…"}</p>}
        {!authLoading && sessionError && (
          <div role="alert" className={styles.notice} data-tone="danger">
            <p>{fa ? "وضعیت ورود مشخص نشد." : "Your sign-in status could not be checked."}</p>
            <Button type="button" variant="outline" onClick={retrySession}>
              {fa ? "تلاش دوباره" : "Retry"}
            </Button>
          </div>
        )}
        {user?.role === "ADMIN" && (
          <p className={styles.notice}>
            {fa ? "برای خرید وارد حساب مشتری شو." : "Sign in with a customer account to shop."}
          </p>
        )}
        {token && guestCart.length > 0 && guestCartTransfer?.status === "moving" && (
          <p role="status" className={styles.notice}>
            {fa ? "در حال انتقال سبد مهمان…" : "Moving your guest cart…"}
          </p>
        )}
        {token && guestCartTransfer && guestCartTransfer.unavailable > 0 && (
          <p role="status" className={styles.notice}>
            {fa
              ? "پلن‌هایی که دیگر موجود نبودند از سبد مهمان حذف شدند."
              : "Items that were no longer available were removed from the guest cart."}
          </p>
        )}
        {token && guestCart.length > 0 && guestCartTransfer?.status !== "moving" && (
          <div role="status" className={styles.notice}>
            <p>
              {guestCartTransfer?.status === "full"
                ? fa
                  ? "سبد حساب پر است. اقلام باقی‌مانده در این مرورگر ذخیره‌اند. یک قلم از سبد حساب حذف کن و دوباره انتقال بده."
                  : "Your cart is full. The remaining items are saved in this browser. Remove an account cart item and retry."
                : guestCartTransfer?.status === "error"
                  ? fa
                    ? "انتقال بعضی اقلام کامل نشد. می‌توانی دوباره تلاش کنی."
                    : "Some items could not be moved. Try the transfer again."
                  : fa
                    ? "می‌توانی اقلام ذخیره‌شده در این مرورگر را به سبد حساب منتقل کنی."
                    : "You can move the items saved in this browser to your account cart."}
            </p>
            <Button type="button" variant="outline" onClick={retryGuestCartTransfer}>
              {fa ? "تلاش دوباره برای انتقال" : "Retry transfer"}
            </Button>
          </div>
        )}
        {error && (
          <div role="alert" className={styles.notice} data-tone="danger">
            <p>{failure(error, fa)}</p>
            <Button variant="outline" onClick={refetch}>
              {fa ? "تلاش دوباره" : "Retry"}
            </Button>
          </div>
        )}
        {message && (
          <p role="alert" className={styles.notice} data-tone="danger">
            {message}
          </p>
        )}
        {loading && !data && (
          <p role="status">{fa ? "در حال خواندن سبد…" : "Loading your cart…"}</p>
        )}
      </div>

      {(signedInEmpty || guestEmpty) && <CartEmpty locale={locale} />}

      {!authLoading && !sessionError && !user && guestCart.length > 0 && (
        <div className={styles.layout}>
          <section className={styles.card} aria-labelledby="cart-items-title">
            <div className={styles.cardHead}>
              <h2 id="cart-items-title">{fa ? "اقلام سبد" : "Cart items"}</h2>
              <span>{fa ? "قیمت" : "Price"}</span>
            </div>
            <GuestCartItems locale={locale} signedIn={false} />
          </section>
          <aside className={cn(styles.card, styles.summary, styles.aside)}>
            <h2>{fa ? "خلاصهٔ سفارش" : "Order summary"}</h2>
            <dl className={styles.rows}>
              <div>
                <dt>{fa ? "تعداد اقلام" : "Items"}</dt>
                <dd>{digits.format(guestCart.length)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-7 text-muted">
              {fa
                ? "برای دیدن فاکتور و پرداخت وارد حسابت شو؛ اقلام این مرورگر به سبد حسابت منتقل می‌شوند."
                : "Sign in to see your invoice and pay. Items saved in this browser move to your account cart."}
            </p>
            <div className={styles.cta}>
              <Link
                className="oosta-button inline-flex min-h-12 items-center px-5"
                href={{ pathname: `/${locale}/login`, query: { next: `/${locale}/cart` } }}
              >
                {fa ? "ورود برای تکمیل خرید" : "Sign in to check out"}
              </Link>
            </div>
            {secureNote}
          </aside>
        </div>
      )}

      {token && (lines.length > 0 || guestCart.length > 0) && (
        <div className={styles.layout}>
          <div className="grid min-w-0 gap-5">
            {lines.length > 0 && (
              <section className={styles.card} aria-labelledby="cart-items-title">
                <div className={styles.cardHead}>
                  <h2 id="cart-items-title">{fa ? "اقلام سبد" : "Cart items"}</h2>
                  <span>{fa ? "قیمت" : "Price"}</span>
                </div>
                <ul className={styles.lines}>
                  {lines.map((line) => (
                    <li key={line.id} className={styles.line}>
                      <LineTile name={line.product} />
                      <div className={styles.lineInfo}>
                        <Link href={`/${locale}/products/${line.slug}`}>
                          <bdi>{line.product}</bdi>
                        </Link>
                        <p>
                          <bdi>{planDisplayLabel(line.label, fa)}</bdi>
                        </p>
                        {line.notice && (
                          <p role="status" className={styles.lineAlert}>
                            <AlertIcon size={14} />
                            {alertText(line.notice, fa)}
                          </p>
                        )}
                      </div>
                      <div className={styles.lineEnd}>
                        {line.amount !== null && (
                          <span className={styles.linePrice}>
                            {formatPrice(Number(line.amount), line.currency, locale)}
                          </span>
                        )}
                        <button
                          type="button"
                          className={styles.iconButton}
                          disabled={!!removing}
                          aria-label={fa ? `حذف ${line.product} از سبد` : `Remove ${line.product}`}
                          onClick={() => void remove(line.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className={styles.lineActions}>
                        <span>
                          {fa ? "مهلت سبد" : "Cart expires"} ·{" "}
                          <time dateTime={line.expiresAt}>
                            {formatDate(line.expiresAt, locale)}
                          </time>
                        </span>
                        {line.amount !== null &&
                          (line.supplier || (groups.get(line.currency)?.length ?? 0) > 1) && (
                            <Link
                              className={styles.textLink}
                              href={`/${locale}/cart/review/${line.id}`}
                            >
                              {line.supplier
                                ? fa
                                  ? "بازبینی فاکتور جداگانه"
                                  : "Review separate invoice"
                                : fa
                                  ? "پرداخت فقط همین قلم"
                                  : "Pay for this item only"}
                            </Link>
                          )}
                        {line.notice === "UNAVAILABLE" && (
                          <Link
                            className={styles.textLink}
                            href={`/${locale}/products/${line.slug}`}
                          >
                            {fa ? "انتخاب پلن دیگر" : "Choose another plan"}
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {guestCartTransfer?.status !== "moving" && guestCart.length > 0 && (
              <section className={styles.card}>
                <GuestCartItems locale={locale} signedIn />
              </section>
            )}
          </div>
          <aside className={cn(styles.card, styles.summary, styles.aside)}>
            <h2>{fa ? "خلاصهٔ سفارش" : "Order summary"}</h2>
            <dl className={styles.rows}>
              <div>
                <dt>{fa ? "تعداد اقلام" : "Items"}</dt>
                <dd>{digits.format(lines.length)}</dd>
              </div>
              {reviewLinks.map((group) => (
                <div key={group.currency}>
                  <dt>{fa ? "جمع اقلام فروشگاه" : "Store items subtotal"}</dt>
                  <dd>{formatPrice(group.subtotal, group.currency, locale)}</dd>
                </div>
              ))}
              {supplierLines.length > 0 && (
                <div>
                  <dt>{fa ? "اقلام تأمین‌کننده" : "Supplier items"}</dt>
                  <dd>
                    {digits.format(supplierLines.length)} {fa ? "فاکتور جدا" : "separate invoices"}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-4 text-sm leading-7 text-muted">
              {fa
                ? "کد تخفیف و روش پرداخت در مرحلهٔ بازبینی فاکتور انتخاب می‌شود."
                : "Add a discount code and choose a payment method on the invoice."}
            </p>
            {reviewLinks.length > 0 && (
              <div className={styles.cta}>
                {reviewLinks.map((group) => (
                  <Link
                    key={group.currency}
                    href={group.href}
                    className="oosta-button inline-flex min-h-12 items-center px-5"
                  >
                    {group.count > 1
                      ? fa
                        ? `بازبینی فاکتور ${digits.format(group.count)} کالا`
                        : `Review invoice for ${group.count} items`
                      : fa
                        ? "بازبینی فاکتور"
                        : "Review invoice"}
                  </Link>
                ))}
              </div>
            )}
            {secureNote}
          </aside>
        </div>
      )}
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
  const [chosen, setChosen] = useState<PaymentMethod | null>(null);
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
  const methods: PaymentMethod[] = invoice
    ? [
        ...(invoice.methods.online ? (["online"] as const) : []),
        ...(invoice.methods.cardToCard ? (["card_to_card"] as const) : []),
      ]
    : [];
  const method = chosen && methods.includes(chosen) ? chosen : methods[0];
  return (
    <Container className={styles.page}>
      <CheckoutSteps locale={locale} current={2} />
      <header className={styles.head}>
        <div className={styles.headTitle}>
          <h1>{fa ? "بازبینی فاکتور" : "Review invoice"}</h1>
        </div>
        {invoice && (
          <p className={styles.meta}>
            <ClockIcon size={16} />
            <span>
              {fa ? "اعتبار فاکتور تا" : "Invoice valid until"}{" "}
              <time dateTime={invoice.expiresAt}>{formatDate(invoice.expiresAt, locale)}</time>
            </span>
          </p>
        )}
      </header>
      {message && (
        <div role="alert" className={cn(styles.notice, "mb-5")} data-tone="danger">
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
              <Link href={`/${locale}/products`} className={styles.textLink}>
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
      {!invoice && (
        <Link href={`/${locale}/cart`} className={styles.textLink}>
          {fa ? "بازگشت به سبد" : "Back to cart"}
        </Link>
      )}
      {invoice && (
        <div className={styles.layout}>
          <section className={styles.card} aria-labelledby="invoice-items-title">
            <div className={styles.cardHead}>
              <h2 id="invoice-items-title">{fa ? "اقلام فاکتور" : "Invoice items"}</h2>
              <span>
                {new Intl.NumberFormat(fa ? "fa-IR" : "en-US").format(invoice.items.length)}{" "}
                {fa ? "قلم" : invoice.items.length === 1 ? "item" : "items"}
              </span>
            </div>
            <ul className={styles.lines}>
              {invoice.items.map((item) => (
                <li key={item.id} className={styles.line}>
                  <LineTile name={item.product} />
                  <div className={styles.lineInfo}>
                    <h3>
                      <bdi>{item.product}</bdi>
                    </h3>
                    <p>
                      <bdi>{planDisplayLabel(item.label, fa)}</bdi>
                    </p>
                    {item.notice && (
                      <p role="status" className={styles.lineAlert}>
                        <AlertIcon size={14} />
                        {alertText(item.notice, fa)}
                      </p>
                    )}
                  </div>
                  <div className={styles.lineEnd}>
                    <span className={styles.linePrice}>{price(item.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className={cn(styles.notice, "mt-5")} data-tone="warn">
              <AlertIcon />
              <p>
                <strong>
                  {fa ? "قیمت یا موجودی عوض شده است؟" : "Did the price or stock change?"}
                </strong>{" "}
                {fa
                  ? "اگر مهلت فاکتور تمام شود یا قیمت تأمین‌کننده تغییر کند، «دریافت فاکتور تازه» را بزن؛ مبلغی از تو کسر نمی‌شود."
                  : "If the invoice expires or a supplier price changes, choose “Get fresh invoice”. Nothing is charged."}
              </p>
            </div>
          </section>

          <aside className={cn(styles.card, styles.summary, styles.aside)}>
            <form
              className={styles.discount}
              onSubmit={(e) => {
                e.preventDefault();
                void refresh(entered.trim().toUpperCase());
              }}
            >
              <label htmlFor="cart-discount">{fa ? "کد تخفیف" : "Discount code"}</label>
              <div className={styles.discountRow}>
                <Input
                  id="cart-discount"
                  value={entered}
                  onChange={(e) => setEntered(e.target.value)}
                  disabled={busy}
                  maxLength={48}
                  dir="ltr"
                />
                <Button variant="outline" type="submit" disabled={busy || !entered.trim()}>
                  {fa ? "اعمال کد" : "Apply"}
                </Button>
              </div>
              {applied && (
                <p role="status" className={styles.applied}>
                  <CheckIcon size={14} />
                  <span>
                    {fa ? "کد اعمال شد." : "Code applied."} <bdi dir="ltr">{applied}</bdi>
                  </span>
                  <button type="button" disabled={busy} onClick={() => void refresh("")}>
                    {fa ? "حذف کد" : "Remove code"}
                  </button>
                </p>
              )}
              <Link href={`/${locale}/dashboard/inbox`} className={styles.textLink}>
                {fa
                  ? "مشاهدهٔ کد هدیهٔ خرید اول در صندوق پیام"
                  : "Find your first-purchase gift code in your inbox"}
              </Link>
            </form>

            {methods.length > 0 ? (
              <fieldset className={styles.methods}>
                <legend>{fa ? "روش پرداخت را انتخاب کنید" : "Choose a payment method"}</legend>
                {invoice.methods.online && (
                  <label className={styles.method}>
                    <input
                      type="radio"
                      name="payment-method"
                      value="online"
                      checked={method === "online"}
                      onChange={() => setChosen("online")}
                    />
                    <span className={styles.methodIcon} aria-hidden="true">
                      <CardIcon />
                    </span>
                    <span>
                      <strong>
                        {fa ? "پرداخت آنلاین" : "Pay online"}
                        <span className={styles.fast}>{fa ? "سریع‌تر" : "Faster"}</span>
                      </strong>
                      <small>
                        {fa
                          ? "درگاه بانکی؛ تحویل بلافاصله پس از تأیید"
                          : "Bank gateway; delivered right after confirmation"}
                      </small>
                    </span>
                  </label>
                )}
                {invoice.methods.cardToCard && (
                  <label className={styles.method}>
                    <input
                      type="radio"
                      name="payment-method"
                      value="card_to_card"
                      checked={method === "card_to_card"}
                      onChange={() => setChosen("card_to_card")}
                    />
                    <span className={styles.methodIcon} aria-hidden="true">
                      <ReceiptIcon />
                    </span>
                    <span>
                      <strong>{fa ? "کارت‌به‌کارت" : "Card transfer"}</strong>
                      <small>
                        {fa
                          ? "واریز به کارت و ثبت رسید؛ تحویل پس از بررسی رسید"
                          : "Transfer and upload the receipt; delivered after review"}
                      </small>
                    </span>
                  </label>
                )}
              </fieldset>
            ) : (
              <p role="status" className="mb-4 text-sm">
                {fa ? "روش پرداخت فعالی وجود ندارد." : "No payment method is available."}
              </p>
            )}

            <dl className={styles.rows}>
              <div>
                <dt>{fa ? "جمع اقلام" : "Subtotal"}</dt>
                <dd>{price(invoice.subtotal)}</dd>
              </div>
              <div data-tone={Number(invoice.discount) > 0 ? "good" : undefined}>
                <dt>
                  {fa ? "تخفیف" : "Discount"}
                  {applied && (
                    <>
                      {" "}
                      (<bdi dir="ltr">{applied}</bdi>)
                    </>
                  )}
                </dt>
                <dd>{price(invoice.discount)}</dd>
              </div>
            </dl>
            <dl>
              <div className={styles.total}>
                <dt>{fa ? "مبلغ قابل پرداخت" : "Total due"}</dt>
                <dd>{price(invoice.total)}</dd>
              </div>
            </dl>
            {expired && !message && (
              <div role="alert" className={cn(styles.notice, "mt-4")} data-tone="danger">
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
            <div className={styles.cta}>
              {method && (
                <Button size="lg" disabled={busy || expired} onClick={() => void pay(method)}>
                  <LockIcon size={16} />
                  {method === "online"
                    ? fa
                      ? "تأیید و پرداخت آنلاین"
                      : "Confirm and pay online"
                    : fa
                      ? "تأیید و کارت‌به‌کارت"
                      : "Confirm and pay by card transfer"}
                </Button>
              )}
              <Link
                href={`/${locale}/cart`}
                className="oosta-button inline-flex min-h-11 items-center px-5"
                data-button-variant="ghost"
              >
                {fa ? "بازگشت به سبد" : "Back to cart"}
              </Link>
            </div>
          </aside>
        </div>
      )}
    </Container>
  );
}
