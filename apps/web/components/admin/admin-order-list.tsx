import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminStats } from "@/lib/types";
import styles from "./admin.module.css";

export function AdminOrderList({
  orders,
  locale,
  statuses,
  contacts = false,
}: {
  orders: AdminStats["recentOrders"];
  locale: Locale;
  statuses: Record<string, string>;
  contacts?: boolean;
}) {
  const fa = locale === "fa";
  const columns = fa
    ? ["سفارش و مشتری", "وضعیت", "مبلغ", "تاریخ ثبت"]
    : ["Order and customer", "Status", "Amount", "Placed"];
  return (
    <>
      <div className={styles.orderColumns} aria-hidden="true">
        {columns.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <ul className={styles.orderList}>
        {orders.map((order) => {
          const contact = contacts ? (order.user.email ?? order.user.phone) : null;
          const status = order.paymentStatus;
          const tone =
            status === "PAID"
              ? "paid"
              : status === "PENDING_REVIEW" || status === "PAID_PENDING_FULFILLMENT"
                ? "attention"
                : status === "FAILED" || status === "REJECTED"
                  ? "failed"
                  : "neutral";
          const amount =
            fa && order.currency === "IRT"
              ? formatPrice(order.totalAmount * 10, "IRR", locale)
              : formatPrice(order.totalAmount, order.currency, locale);
          return (
            <li className={styles.orderRow} key={order.id}>
              <div className={styles.orderIdentity}>
                <Link href={`/${locale}/admin/orders/${order.id}`} className={styles.inlineLink}>
                  <strong dir="auto">{order.user.name}</strong>
                  <span aria-hidden="true">↗</span>
                </Link>
                <small>
                  <bdi>#{order.id.slice(-8)}</bdi>
                  {contact && (
                    <>
                      {" "}
                      · <bdi>{contact}</bdi>
                    </>
                  )}
                </small>
              </div>
              <span className={styles.statusPill} data-tone={tone}>
                <span aria-hidden="true" />
                {statuses[status] ?? status}
              </span>
              <strong className={styles.orderAmount}>{amount}</strong>
              <time dateTime={order.createdAt}>{formatDate(order.createdAt, locale)}</time>
            </li>
          );
        })}
      </ul>
    </>
  );
}
import Link from "next/link";
