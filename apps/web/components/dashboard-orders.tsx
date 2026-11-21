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
  const [filter, setFilter] = useState<"all" | "active">("all");
  const orders = data?.orders ?? [];
  const followUp = orders.filter((order) => followUpStates.includes(order.paymentStatus));
  const visible = filter === "active" ? followUp : orders;
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
  const initials = user?.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("");
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

  return (
    <AccountFrame
      locale={locale}
      section="overview"
      title={fa ? "حساب من" : "My account"}
      detail={
        user && (
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {initials || "•"}
            </span>
            <div className={styles.identityText}>
              <strong>
                <bdi>{user.name}</bdi>
              </strong>
              <span>
                {fa ? "ایمیل" : "Email"} <bdi>{user.email || (fa ? "ثبت نشده" : "Not set")}</bdi>
              </span>
              <span>
                {fa ? "موبایل" : "Mobile"} <bdi>{user.phone || (fa ? "ثبت نشده" : "Not set")}</bdi>
              </span>
            </div>
            {user.role === "USER" && user.recoveryEmailVerified && (
              <Badge tone="success" className={styles.verifiedBadge}>
                {fa ? "ایمیل تأیید شده" : "Email verified"}
              </Badge>
            )}
            {canVerify && (
              <Link href={verifyHref} className={styles.verifyLink}>
                {fa ? "تأیید ایمیل برای بازیابی رمز" : "Verify email for password recovery"}
              </Link>
            )}
          </div>
        )
      }
      action={
        <Link href={`/${locale}/products`} className={styles.action}>
          {fa ? "رفتن به فروشگاه" : "Browse the store"}
        </Link>
      }
    >
      {user && (
        <dl className={styles.metrics}>
          <div>
            <dt>{fa ? "تحویل‌شده" : "Delivered"}</dt>
            <dd>{data && !error ? formatNumber.format(delivered) : "—"}</dd>
          </div>
          <div>
            <dt>{fa ? "در حال پیگیری" : "In progress"}</dt>
            <dd>{data && !error ? formatNumber.format(followUp.length) : "—"}</dd>
          </div>
          <div>
            <dt>{fa ? "هدیهٔ خرید اول" : "Welcome gift"}</dt>
            <dd>
              <Link
                href={inboxHref}
                aria-label={giftLabel === openInbox ? undefined : `${giftLabel} · ${openInbox}`}
              >
                {giftLabel}
              </Link>
            </dd>
          </div>
        </dl>
      )}
      <section
        id="account-orders"
        className={styles.purchaseSection}
        aria-labelledby="account-orders-title"
      >
        <h2 id="account-orders-title">{d.orders}</h2>
        {loading ? (
          <div className={styles.panel} role="status">
            <Spinner className="size-6" />
            <span className="sr-only">{dict.common.loading}</span>
          </div>
        ) : error ? (
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        ) : !orders.length ? (
          <div className={`${styles.panel} ${styles.empty}`}>
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
        ) : (
          <div className={styles.stack}>
            <div
              className={styles.filters}
              role="group"
              aria-label={fa ? "فیلتر سفارش‌ها" : "Order filters"}
            >
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                {dict.common.all} · {orders.length.toLocaleString(locale)}
              </button>
              <button
                type="button"
                aria-pressed={filter === "active"}
                onClick={() => setFilter("active")}
              >
                {fa ? "در حال پیگیری" : "In progress"} · {followUp.length.toLocaleString(locale)}
              </button>
            </div>
            {visible.length === 0 && (
              <p className={styles.panel}>
                {fa ? "سفارش در حال پیگیری نداری." : "No orders in progress."}
              </p>
            )}
            {visible.map((order) => (
              <Link
                key={order.id}
                href={`/${locale}/dashboard/orders/${order.id}`}
                className={styles.row}
                data-tone={
                  orderStatusTone(order.paymentStatus) === "muted"
                    ? "pending"
                    : orderStatusTone(order.paymentStatus)
                }
              >
                <div>
                  <p className={styles.rowTitle}>
                    {order.firstProductName ? (
                      <bdi>{order.firstProductName}</bdi>
                    ) : (
                      <>
                        {d.orderNo} <bdi>#{order.id.slice(-8)}</bdi>
                      </>
                    )}
                  </p>
                  <p className={styles.rowMeta}>
                    {order.firstProductName && (
                      <>
                        <bdi>#{order.id.slice(-8)}</bdi> ·{" "}
                      </>
                    )}
                    <time dateTime={order.createdAt}>{formatDate(order.createdAt, locale)}</time> ·{" "}
                    {order.itemCount.toLocaleString(locale)} {d.items}
                  </p>
                </div>
                <div className={styles.rowAside}>
                  <span className="font-semibold">
                    {formatPrice(order.totalAmount, order.currency, locale)}
                  </span>
                  <Badge tone={orderStatusTone(order.paymentStatus)}>
                    {statusMap[order.paymentStatus] ?? order.paymentStatus}
                  </Badge>
                  <span className={styles.rowGo} aria-hidden="true">
                    {fa ? "←" : "→"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AccountFrame>
  );
}
