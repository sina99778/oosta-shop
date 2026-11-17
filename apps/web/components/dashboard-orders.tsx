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
import type { OrderSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

const followUpStates = ["PENDING", "PENDING_REVIEW", "PAID_PENDING_FULFILLMENT", "REJECTED"];

export function orderStatusTone(status: string): "success" | "muted" | "danger" {
  if (status === "PAID") return "success";
  if (["PENDING", "PENDING_REVIEW", "PAID_PENDING_FULFILLMENT"].includes(status)) return "muted";
  return "danger";
}

export function DashboardOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
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

  return (
    <AccountFrame
      locale={locale}
      section="orders"
      title={d.orders}
      detail={
        fa
          ? "پیگیری پرداخت و دسترسی به اطلاعات تحویل"
          : "Track payments and view your delivery details"
      }
      action={
        <Link href={`/${locale}/products`} className={styles.action}>
          {fa ? "رفتن به فروشگاه" : "Browse the store"}
        </Link>
      }
    >
      {loading ? (
        <div className={styles.panel} role="status">
          <Spinner className="size-6" />
          <span className="sr-only">{dict.common.loading}</span>
        </div>
      ) : error ? (
        <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
      ) : !orders.length ? (
        <div className={`${styles.panel} ${styles.empty}`}>
          <p>{d.noOrders}</p>
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
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
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
                  {d.orderNo} <bdi>#{order.id.slice(-8)}</bdi>
                </p>
                <p className={styles.rowMeta}>
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
    </AccountFrame>
  );
}
