"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminOrderDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { AdminReceipts } from "./admin-receipts";
import { ManualSupplierJobs } from "./manual-supplier-jobs";
import styles from "./admin.module.css";

export function AdminOrderDetailView({
  locale,
  orderId,
  dict,
}: {
  locale: Locale;
  orderId: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const { data, loading, error, refetch } = useApi<{ order: AdminOrderDetail }>(
    token ? `/admin/orders/${orderId}` : null,
    token ?? undefined,
  );
  const fa = locale === "fa";
  const order = data?.order.id === orderId ? data.order : null;

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <h1>{fa ? "جزئیات سفارش" : "Order details"}</h1>
        <Link href={`/${locale}/admin/orders`} className={styles.storeLink}>
          {dict.admin.orders}
        </Link>
      </header>
      {loading ? (
        <p className={styles.panel} role="status">
          <Spinner />
          <span className="sr-only">{dict.common.loading}</span>
        </p>
      ) : error?.status === 404 ? (
        <p className={styles.panel}>{fa ? "این سفارش پیدا نشد." : "Order not found."}</p>
      ) : error ? (
        <section className={styles.panel}>
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        </section>
      ) : order ? (
        <>
          <OrderFacts order={order} locale={locale} dict={dict} />
          <ManualSupplierJobs locale={locale} orderId={order.id} onUpdated={refetch} />
          {order.paymentProvider === "CARD_TO_CARD" && (
            <AdminReceipts
              locale={locale}
              dict={dict}
              orderId={order.id}
              onOrderUpdated={refetch}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function OrderFacts({
  order,
  locale,
  dict,
}: {
  order: AdminOrderDetail;
  locale: Locale;
  dict: Dictionary;
}) {
  const fa = locale === "fa";
  const number = new Intl.NumberFormat(locale);
  const copy = dict.dashboard.status as Record<string, string>;
  const paid = order.paymentStatus === "PAID";
  const pendingDelivery = order.paymentStatus === "PAID_PENDING_FULFILLMENT";
  const price = (value: number) =>
    order.currency === "IRT" && fa
      ? formatPrice(value * 10, "IRR", locale)
      : formatPrice(value, order.currency, locale);
  const providers: Record<string, string> = {
    CARD_TO_CARD: fa ? "کارت‌به‌کارت" : "Bank transfer",
    ZARINPAL: fa ? "زرین‌پال" : "Zarinpal",
    MANUAL: fa ? "ثبت دستی" : "Manual",
  };

  return (
    <>
      <section className={styles.panel} aria-labelledby="order-payment">
        <header className={styles.panelHeader}>
          <h2 id="order-payment">{fa ? "پرداخت و مشتری" : "Payment and customer"}</h2>
          <Badge tone={paid ? "success" : "muted"}>
            {copy[order.paymentStatus] ?? order.paymentStatus}
          </Badge>
        </header>
        <dl className={styles.receiptFacts}>
          <div>
            <dt>{fa ? "شمارهٔ کامل سفارش" : "Full order number"}</dt>
            <dd className="select-all break-all">
              <bdi>{order.id}</bdi>
            </dd>
          </div>
          <div>
            <dt>{fa ? "مبلغ سفارش" : "Order total"}</dt>
            <dd>{price(order.totalAmount)}</dd>
          </div>
          <div>
            <dt>{fa ? "نام مشتری" : "Customer name"}</dt>
            <dd dir="auto">{order.user.name}</dd>
          </div>
          {(order.user.email || order.user.phone) && (
            <div>
              <dt>{fa ? "راه تماس" : "Contact"}</dt>
              <dd className="break-all">
                <bdi>{order.user.email ?? order.user.phone}</bdi>
              </dd>
            </div>
          )}
          <div>
            <dt>{fa ? "تاریخ ثبت" : "Placed"}</dt>
            <dd>
              <time dateTime={order.createdAt}>{formatDate(order.createdAt, locale)}</time>
            </dd>
          </div>
          {order.paidAt && (
            <div>
              <dt>{fa ? "زمان پرداخت" : "Paid at"}</dt>
              <dd>
                <time dateTime={order.paidAt}>{formatDate(order.paidAt, locale)}</time>
              </dd>
            </div>
          )}
          {order.paymentProvider && (
            <div>
              <dt>{fa ? "روش پرداخت" : "Payment method"}</dt>
              <dd>{providers[order.paymentProvider] ?? order.paymentProvider}</dd>
            </div>
          )}
          {order.paymentRefId && (
            <div>
              <dt>{fa ? "مرجع پرداخت" : "Payment reference"}</dt>
              <dd className="break-all">
                <bdi>{order.paymentRefId}</bdi>
              </dd>
            </div>
          )}
        </dl>
      </section>
      <section className={styles.panel} aria-labelledby="order-fulfillment">
        <header className={styles.panelHeader}>
          <h2 id="order-fulfillment">{fa ? "اقلام و وضعیت تحویل" : "Items and delivery"}</h2>
        </header>
        {pendingDelivery && (
          <p className="mb-4 text-sm text-primary">
            {fa
              ? "پرداخت ثبت شده و تحویل هنوز کامل نشده است."
              : "Payment has been recorded. Delivery is still pending."}
          </p>
        )}
        <ul className="grid gap-3">
          {order.items.map((item) => (
            <li key={item.id} className={styles.receipt}>
              <header className={styles.receiptHeader}>
                <div>
                  <h3 className="font-bold" dir="auto">
                    {item.product.name}
                  </h3>
                  <p dir="auto">{item.plan.label}</p>
                </div>
                <strong>{price(item.lineTotal)}</strong>
              </header>
              <dl className={styles.receiptFacts}>
                <div>
                  <dt>{fa ? "تعداد" : "Quantity"}</dt>
                  <dd>{number.format(item.quantity)}</dd>
                </div>
                <div>
                  <dt>{fa ? "تحویل‌شده" : "Delivered"}</dt>
                  <dd>{number.format(item.fulfilledCount)}</dd>
                </div>
                {item.reservedCount > 0 && (
                  <div>
                    <dt>{fa ? "رزروشده" : "Reserved"}</dt>
                    <dd>{number.format(item.reservedCount)}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
