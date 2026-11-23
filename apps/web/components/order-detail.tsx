"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { notifyCartChanged } from "@/lib/cart-events";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CredentialField } from "@/components/credential-field";
import { QueryError } from "@/components/query-error";
import { AccountFrame } from "@/components/account-frame";
import { orderStatusTone } from "@/components/dashboard-orders";
import styles from "./account.module.css";
import { planDisplayLabel, variantDescription } from "@/lib/product-variant";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Credential, OrderDetail as OrderDetailDto, OrderItemDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function OrderDetail({
  locale,
  orderId,
  dict,
}: {
  locale: Locale;
  orderId: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const { data, loading, error, refetch } = useApi<{ order: OrderDetailDto }>(
    token ? `/orders/${orderId}` : null,
    token ?? undefined,
  );
  const d = dict.dashboard;
  const statusMap = d.status as Record<string, string>;
  const fa = locale === "fa";

  if (loading) {
    return (
      <Container className="py-20 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }
  if (error || data?.order.id !== orderId) {
    return (
      <AccountFrame locale={locale} title={d.orderNo} section="orders">
        {error?.status === 404 ? (
          <p className={styles.panel}>
            {fa ? "این سفارش در حساب تو پیدا نشد." : "This order was not found in your account."}
          </p>
        ) : (
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        )}
      </AccountFrame>
    );
  }

  const order = data.order;
  const shortId = order.id.slice(-8);
  const supportLink = `/${locale}/support?order=${encodeURIComponent(shortId)}#new-ticket`;
  const cardPending =
    order.paymentProvider === "CARD_TO_CARD" &&
    ["PENDING", "PENDING_REVIEW", "REJECTED"].includes(order.paymentStatus);
  const expired =
    order.bluInvoice?.expired ||
    order.bluInvoice?.remainingMs === 0 ||
    order.manualSupplier?.remainingMs === 0 ||
    (order.paymentStatus === "PENDING" && order.cartPayment?.remainingMs === 0);

  const providerLabel =
    order.paymentProvider === "ZARINPAL"
      ? fa
        ? "پرداخت آنلاین (زرین‌پال)"
        : "Online payment (Zarinpal)"
      : order.paymentProvider === "CARD_TO_CARD"
        ? fa
          ? "کارت‌به‌کارت"
          : "Card transfer"
        : order.paymentProvider === "MANUAL"
          ? fa
            ? "ثبت دستی"
            : "Recorded manually"
          : null;

  return (
    <AccountFrame
      locale={locale}
      section="orders"
      title={
        <span className={styles.orderTitle}>
          <span>
            {d.orderNo} <bdi>#{shortId}</bdi>
          </span>
          <Badge tone={orderStatusTone(order.paymentStatus)}>
            {statusMap[order.paymentStatus] ?? order.paymentStatus}
          </Badge>
        </span>
      }
      detail={
        <>
          {fa ? "ثبت: " : "Placed: "}
          <time dateTime={order.createdAt}>{formatDate(order.createdAt, locale)}</time>
          {providerLabel && <> · {providerLabel}</>}
        </>
      }
      action={
        <Link href={supportLink} className={styles.action}>
          {fa ? "پشتیبانی این سفارش" : "Get help with this order"}
        </Link>
      }
    >
      <div className={styles.columns}>
        <div className={styles.stack}>
          {order.isSupplierQa && (
            <Card className="mt-5 border-primary" role="status">
              <p className="font-semibold">
                {order.supplierQaKind === "REAL_STOCK"
                  ? locale === "fa"
                    ? "خرید آزمایشی محصول واقعی"
                    : "Operator-funded real-product test"
                  : locale === "fa"
                    ? "آزمایش اتصال تأمین‌کننده؛ اشتراک واقعی نیست"
                    : "Supplier integration test; not a real subscription"}
              </p>
              <p className="mt-2 text-sm leading-7 text-muted">
                {locale === "fa"
                  ? "هزینهٔ این آزمایش از کیف پول مدیر نزد تأمین‌کننده پرداخت شده؛ پرداختی از مشتری دریافت نشده است."
                  : "This test is funded from the operator's supplier wallet. No customer payment was collected."}
              </p>
            </Card>
          )}
          {order.paymentStatus === "PAID_PENDING_FULFILLMENT" && (
            <Card className="space-y-3 border-primary" role="status">
              <h2 className="font-bold">{d.pendingFulfillmentTitle}</h2>
              <p className="text-sm leading-7 text-muted">{d.pendingFulfillmentBody}</p>
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="outline" onClick={refetch}>
                  {dict.common.retry}
                </Button>
              </div>
            </Card>
          )}
          <section className={styles.stack} aria-labelledby="order-items-title">
            <h2 id="order-items-title" className="text-lg font-bold">
              {fa ? "اقلام و اطلاعات تحویل" : "Items and delivery"}
            </h2>
            {order.items.map((item) => (
              <Card key={item.id} className={styles.vaultCard}>
                <div className={styles.factRow}>
                  <div>
                    <p className="font-semibold">{item.product.name}</p>
                    <p className="text-sm text-muted">
                      <bdi>{planDisplayLabel(item.plan.label, locale === "fa")}</bdi> · ×
                      {item.quantity}
                      {item.plan.variant && (
                        <span className="mt-2 block text-xs leading-6">
                          {variantDescription(item.plan.variant, locale === "fa")}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="font-semibold">
                    {formatPrice(item.lineTotal, order.currency, locale)}
                  </span>
                </div>

                {item.renewal && (
                  <SubscriptionRenewal
                    renewal={item.renewal}
                    orderItemId={item.id}
                    locale={locale}
                    fallbackError={dict.common.somethingWrong}
                  />
                )}

                <div className="mt-4">
                  <div className={styles.vaultHead}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="4" y="10" width="16" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                    </svg>
                    <span>{d.vault}</span>
                  </div>
                  {item.credentials.length === 0 ? (
                    <p className="text-sm text-muted">{d.noCredentials}</p>
                  ) : (
                    <div className="space-y-2">
                      {item.credentials.map((cred) => (
                        <CredentialBlock
                          locale={locale}
                          key={cred.id}
                          cred={cred}
                          dict={dict}
                          deliveryLabel={
                            order.supplierQaKind === "REAL_STOCK"
                              ? locale === "fa"
                                ? "اطلاعات تحویل"
                                : "Delivery data"
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </section>
        </div>
        <aside
          className={styles.stack}
          aria-label={fa ? "پرداخت و رسیدها" : "Payment and receipts"}
        >
          <section className={`${styles.panel} ${styles.stack}`}>
            <h2>{fa ? "پرداخت و رسیدها" : "Payment and receipts"}</h2>
            <dl className={styles.stack}>
              <div className={styles.factRow}>
                <dt>{fa ? "مبلغ سفارش" : "Order total"}</dt>
                <dd>
                  <bdi>{formatPrice(order.totalAmount, order.currency, locale)}</bdi>
                </dd>
              </div>
              <div className={styles.factRow}>
                <dt>{fa ? "وضعیت پرداخت" : "Payment status"}</dt>
                <dd data-tone={orderStatusTone(order.paymentStatus)}>
                  {statusMap[order.paymentStatus] ?? order.paymentStatus}
                </dd>
              </div>
              {order.paidAt && (
                <div className={styles.factRow}>
                  <dt>{fa ? "زمان پرداخت" : "Paid at"}</dt>
                  <dd>
                    <time dateTime={order.paidAt}>{formatDate(order.paidAt, locale)}</time>
                  </dd>
                </div>
              )}
              {providerLabel && (
                <div className={styles.factRow}>
                  <dt>{fa ? "روش پرداخت" : "Method"}</dt>
                  <dd>{providerLabel}</dd>
                </div>
              )}
              {order.paymentRefId && order.paymentStatus === "PAID" && (
                <div className={styles.factRow}>
                  <dt>{fa ? "کد پیگیری" : "Tracking code"}</dt>
                  <dd>
                    <bdi dir="ltr" className="font-mono">
                      {order.paymentRefId}
                    </bdi>
                  </dd>
                </div>
              )}
              {order.bluInvoice && (
                <div className={styles.factRow}>
                  <dt>{dict.checkout.cardToCard.invoiceDiscount}</dt>
                  <dd>{formatPrice(order.bluInvoice.discount, order.currency, locale)}</dd>
                </div>
              )}
            </dl>
            {cardPending &&
              (order.paymentStatus === "PENDING_REVIEW" ? (
                <p className="text-sm text-muted">{d.awaitingReview}</p>
              ) : expired ? (
                <p className="text-sm text-muted">
                  {fa
                    ? "مهلت پرداخت این سفارش تمام شده است. برای پیگیری به پشتیبانی پیام بده."
                    : "The payment window has expired. Contact support if you need help."}
                </p>
              ) : order.paymentStatus === "REJECTED" && order.manualSupplier ? (
                <Link className={styles.action} href={supportLink}>
                  {fa ? "پیگیری رسید از پشتیبانی" : "Contact support about the receipt"}
                </Link>
              ) : (
                <Link className={styles.action} href={`/${locale}/checkout/card/${order.id}`}>
                  {order.paymentStatus === "REJECTED"
                    ? fa
                      ? "ارسال مجدد رسید"
                      : "Resubmit receipt"
                    : d.completePayment}
                </Link>
              ))}
          </section>
          {order.receipts.length > 0 && (
            <section className={`${styles.panel} ${styles.stack}`}>
              <h2>{fa ? "رسیدهای پرداخت" : "Payment receipts"}</h2>
              <ul className={styles.stack}>
                {order.receipts.map((receipt) => (
                  <li key={receipt.id} className="border-t border-border pt-3">
                    <div className={styles.factRow}>
                      <time className="text-sm text-muted" dateTime={receipt.createdAt}>
                        {formatDate(receipt.createdAt, locale)}
                      </time>
                      <Badge
                        tone={
                          receipt.status === "APPROVED"
                            ? "success"
                            : receipt.status === "REJECTED"
                              ? "danger"
                              : "muted"
                        }
                      >
                        {
                          dict.admin.receipts[
                            receipt.status.toLowerCase() as "pending" | "approved" | "rejected"
                          ]
                        }
                      </Badge>
                    </div>
                    {receipt.status === "REJECTED" && receipt.reviewerNote && (
                      <p dir="auto" className={styles.rowMeta}>
                        {receipt.reviewerNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </AccountFrame>
  );
}

function SubscriptionRenewal({
  renewal,
  orderItemId,
  locale,
  fallbackError,
}: {
  renewal: NonNullable<OrderItemDetail["renewal"]>;
  orderItemId: string;
  locale: Locale;
  fallbackError: string;
}) {
  const { token } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fa = locale === "fa";
  const days = renewal.daysRemaining;
  const remainingLabel = fa
    ? days > 0
      ? `حدود ${days.toLocaleString("fa-IR")} روز مانده`
      : "زمان تخمینی اشتراک به پایان رسیده"
    : days > 0
      ? `About ${days} ${days === 1 ? "day" : "days"} remaining`
      : "Estimated subscription period ended";

  async function addToCart() {
    if (!renewal.planId || !token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        "/cart/items",
        { planId: renewal.planId, renewalOrderItemId: orderItemId },
        token,
      );
      notifyCartChanged();
      router.push(`/${locale}/cart`);
    } catch (error) {
      setError(apiErrorMessage(error, locale, fallbackError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3">
      <div className={styles.factRow}>
        <div>
          <p className="text-sm font-semibold text-foreground">{remainingLabel}</p>
          <p className="mt-1 text-sm text-muted">
            {fa ? "پایان تقریبی اشتراک" : "Estimated subscription end"}{" "}
            <time dateTime={renewal.estimatedEndAt}>
              {formatDate(renewal.estimatedEndAt, locale)}
            </time>
          </p>
        </div>
        {renewal.planId && (
          <Button size="sm" onClick={addToCart} disabled={busy} aria-busy={busy}>
            {busy
              ? fa
                ? "در حال افزودن به سبد خرید…"
                : "Adding to cart…"
              : fa
                ? "افزودن تمدید به سبد خرید"
                : "Add renewal to cart"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function CredentialBlock({
  locale,
  cred,
  dict,
  deliveryLabel,
}: {
  locale: Locale;
  cred: Credential;
  dict: Dictionary;
  deliveryLabel?: string;
}) {
  const d = dict.dashboard;
  const labels = { reveal: d.reveal, hide: d.hide, copy: d.copy, copied: d.copied };
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      {cred.accountEmail && (
        <CredentialField label={d.fields.accountEmail} value={cred.accountEmail} {...labels} />
      )}
      {cred.accountPassword && (
        <CredentialField
          label={d.fields.accountPassword}
          value={cred.accountPassword}
          {...labels}
        />
      )}
      {cred.licenseKey && (
        <CredentialField
          label={deliveryLabel ?? d.fields.licenseKey}
          value={cred.licenseKey}
          {...labels}
        />
      )}
      {cred.giftCardCode && (
        <CredentialField label={d.fields.giftCardCode} value={cred.giftCardCode} {...labels} />
      )}
      {cred.deliveryInstructions && (
        <CredentialField
          label={locale === "fa" ? "راهنمای تحویل" : "Delivery instructions"}
          value={cred.deliveryInstructions}
          {...labels}
        />
      )}
    </div>
  );
}
