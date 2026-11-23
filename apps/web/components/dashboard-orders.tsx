"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { QueryError } from "@/components/query-error";
import { useApi } from "@/lib/use-api";
import { AccountFrame } from "@/components/account-frame";
import styles from "./account.module.css";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { OrderSummary, WelcomeGift } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

const followUpStates = ["PENDING", "PENDING_REVIEW", "PAID_PENDING_FULFILLMENT", "REJECTED"];
const failedStates = ["FAILED", "REJECTED", "REFUNDED", "EXPIRED"];

export function orderStatusTone(status: string): "success" | "muted" | "danger" {
  if (status === "PAID") return "success";
  if (["PENDING", "PENDING_REVIEW", "PAID_PENDING_FULFILLMENT"].includes(status)) return "muted";
  return "danger";
}

export function DashboardOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token, user } = useAuth();
  const { data, loading, error, refetch } = useApi<{ orders: OrderSummary[] }>(
    token ? "/orders" : null,
    token ?? undefined,
  );
  const d = dict.dashboard;
  const statusMap = d.status as Record<string, string>;
  const fa = locale === "fa";
  const [filter, setFilter] = useState<"all" | "paid" | "active" | "failed">("all");
  const orders = data?.orders ?? [];
  const followUp = orders.filter((order) => followUpStates.includes(order.paymentStatus));
  const paidOrders = orders.filter((order) => order.paymentStatus === "PAID");
  const failedOrders = orders.filter((order) => failedStates.includes(order.paymentStatus));
  const hasReviewPending = orders.some(
    (order) =>
      order.paymentStatus === "PENDING_REVIEW" ||
      order.paymentStatus === "PAID_PENDING_FULFILLMENT",
  );
  const visible =
    filter === "active"
      ? followUp
      : filter === "paid"
        ? paidOrders
        : filter === "failed"
          ? failedOrders
          : orders;
  const {
    data: inbox,
    loading: inboxLoading,
    error: inboxError,
  } = useApi<{ welcomeGift: WelcomeGift | null }>(
    token && user?.role === "USER" ? "/auth/inbox" : null,
    token ?? undefined,
  );
  const delivered = orders.filter((order) => order.paymentStatus === "PAID").length;
  const formatNumber = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en");
  const canVerify = user?.role === "USER" && Boolean(user.email) && !user.recoveryEmailVerified;
  const verifyHref = `/${locale}/dashboard/security#recovery-code`;
  const inboxHref = `/${locale}/dashboard/inbox`;
  const gift = inboxError ? null : inbox?.welcomeGift;
  const giftLabels = fa
    ? { RESERVED: "رزرو شده", USED: "مهلت پایان یافته" }
    : { RESERVED: "Reserved", USED: "No longer available" };
  const openInbox = fa ? "باز کردن صندوق پیام" : "Open inbox";
  let giftLabel = openInbox;
  if (inboxLoading || inboxError) giftLabel = "—";
  else if (gift?.state === "AVAILABLE")
    giftLabel = fa
      ? `${formatNumber.format(gift.percent)}٪ آمادهٔ استفاده`
      : `${gift.percent}% available`;
  else if (gift) giftLabel = giftLabels[gift.state];

  const statIcon = (path: string) => (
    <span className={styles.statIcon} aria-hidden="true">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </span>
  );
  const filters = [
    ["all", dict.common.all, orders.length],
    ["paid", d.status.PAID, paidOrders.length],
    ["active", fa ? "در حال پیگیری" : "In progress", followUp.length],
    ["failed", d.status.FAILED, failedOrders.length],
  ] as const;

  return (
    <AccountFrame
      locale={locale}
      section="overview"
      title={
        user ? (fa ? `سلام، ${user.name}` : `Hi, ${user.name}`) : fa ? "حساب من" : "My account"
      }
      detail={
        <>
          {fa
            ? "سفارش‌ها و اطلاعات تحویل‌شده‌ات اینجاست."
            : "Your orders and delivered details live here."}
          {canVerify && (
            <>
              {" "}
              <Link href={verifyHref} className={styles.verifyLink}>
                {fa ? "تأیید ایمیل برای بازیابی رمز" : "Verify email for password recovery"}
              </Link>
            </>
          )}
        </>
      }
      action={
        <Link href={`/${locale}/products`} className={styles.action}>
          <svg
            aria-hidden="true"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4h2l2.4 10.5h11.8L21 7H5.7" />
            <circle cx="8.5" cy="19" r="1.2" />
            <circle cx="18" cy="19" r="1.2" />
          </svg>
          {fa ? "رفتن به فروشگاه" : "Browse the store"}
        </Link>
      }
    >
      {user && (
        <dl className={styles.metrics}>
          <div>
            {statIcon("M3 8h18v12H3z M3 8l3-4h12l3 4 M9 12h6")}
            <dt>{fa ? "تحویل‌شده" : "Delivered"}</dt>
            <dd>{data && !error ? formatNumber.format(delivered) : "—"}</dd>
            <small>{fa ? "اطلاعات در جزئیات هر سفارش" : "Details inside each order"}</small>
          </div>
          <div>
            {statIcon("M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}
            <dt>{fa ? "در حال پیگیری" : "In progress"}</dt>
            <dd>{data && !error ? formatNumber.format(followUp.length) : "—"}</dd>
            <small>
              {hasReviewPending
                ? fa
                  ? "رسید یا سفارش در حال بررسی"
                  : "Receipt or order under review"
                : fa
                  ? "سفارش بازی منتظر نیست"
                  : "Nothing waiting"}
            </small>
          </div>
          <div>
            {statIcon(
              "M20 12v9H4v-9 M2 7h20v5H2z M12 21V7 M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Z M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z",
            )}
            <dt>{fa ? "هدیهٔ خرید اول" : "Welcome gift"}</dt>
            <dd>
              <Link
                href={inboxHref}
                aria-label={giftLabel === openInbox ? undefined : `${giftLabel} · ${openInbox}`}
              >
                {giftLabel}
              </Link>
            </dd>
            <small>{fa ? "کدها در صندوق پیام" : "Codes are in your inbox"}</small>
          </div>
        </dl>
      )}
      {hasReviewPending && (
        <div className={styles.pendingBanner} role="status">
          <p>
            {fa
              ? "رسید یا سفارش شما در حال بررسی و آماده‌سازی است — پس از تأیید، اطلاعات تحویل به‌صورت خودکار در جزئیات سفارش ثبت می‌شود."
              : "Your receipt or order is currently under review — once confirmed, delivery details appear automatically inside the order view."}
          </p>
        </div>
      )}
      <section
        id="account-orders"
        className={styles.ordersCard}
        aria-labelledby="account-orders-title"
      >
        <div className={styles.ordersHead}>
          <h2 id="account-orders-title">{d.orders}</h2>
          {orders.length > 0 && !loading && !error && (
            <div
              className={styles.filters}
              role="group"
              aria-label={fa ? "فیلتر سفارش‌ها" : "Order filters"}
            >
              {filters.map(([key, label, total]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label} · {total.toLocaleString(locale)}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <div className={styles.panel} role="status">
            <Spinner className="size-6" />
            <span className="sr-only">{dict.common.loading}</span>
          </div>
        ) : error ? (
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        ) : !orders.length ? (
          <div className={styles.empty}>
            <svg
              aria-hidden="true"
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8h18v12H3z M3 8l3-4h12l3 4 M9 12h6" />
            </svg>
            <p>{d.noOrders}</p>
            {gift?.state === "AVAILABLE" && (
              <Link href={inboxHref} className={styles.emptyGift}>
                {fa
                  ? `کد ${formatNumber.format(gift.percent)}٪ خرید اول در صندوق پیام`
                  : `Get your ${gift.percent}% first-order code from the inbox`}
              </Link>
            )}
            <Link href={`/${locale}/products`} className={styles.action}>
              {fa ? "دیدن محصولات" : "See products"}
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <p className={styles.tableEmpty}>
            {filter === "active"
              ? fa
                ? "سفارش در حال پیگیری نداری."
                : "No orders in progress."
              : fa
                ? "سفارشی در این وضعیت نداری."
                : "No orders match this status."}
          </p>
        ) : (
          <table className={styles.ordersTable}>
            <caption className="sr-only">{d.orders}</caption>
            <thead>
              <tr>
                <th scope="col">{fa ? "شماره" : "Order"}</th>
                <th scope="col">{fa ? "اقلام و تاریخ" : "Items & date"}</th>
                <th scope="col">{fa ? "وضعیت" : "Status"}</th>
                <th scope="col">{fa ? "مبلغ" : "Amount"}</th>
                <th scope="col">
                  <span className="sr-only">{fa ? "اقدام" : "Action"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => {
                const href = `/${locale}/dashboard/orders/${order.id}`;
                const awaitingPayment = order.paymentStatus === "PENDING";
                return (
                  <tr key={order.id} data-tone={orderStatusTone(order.paymentStatus)}>
                    <td data-label={fa ? "شماره" : "Order"}>
                      <Link href={href} className={styles.orderNo}>
                        <bdi>#{order.id.slice(-8)}</bdi>
                      </Link>
                    </td>
                    <td data-label={fa ? "اقلام و تاریخ" : "Items & date"}>
                      <span className={styles.orderItems}>
                        {order.firstProductName ? <bdi>{order.firstProductName}</bdi> : d.orderNo}
                        {order.itemCount > 1 && (
                          <small>
                            {" "}
                            +{(order.itemCount - 1).toLocaleString(locale)} {d.items}
                          </small>
                        )}
                      </span>
                      <time dateTime={order.createdAt} className={styles.orderDate}>
                        {formatDate(order.createdAt, locale)}
                      </time>
                    </td>
                    <td data-label={fa ? "وضعیت" : "Status"}>
                      <Badge tone={orderStatusTone(order.paymentStatus)}>
                        {statusMap[order.paymentStatus] ?? order.paymentStatus}
                      </Badge>
                    </td>
                    <td data-label={fa ? "مبلغ" : "Amount"} className={styles.orderAmount}>
                      {formatPrice(order.totalAmount, order.currency, locale)}
                    </td>
                    <td className={styles.orderAction}>
                      <Link
                        href={href}
                        className={awaitingPayment ? styles.payButton : styles.viewButton}
                      >
                        {awaitingPayment
                          ? fa
                            ? "تکمیل پرداخت"
                            : "Complete payment"
                          : fa
                            ? "مشاهده"
                            : "View"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </AccountFrame>
  );
}
