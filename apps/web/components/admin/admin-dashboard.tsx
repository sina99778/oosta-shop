"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminStats } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { BluStatusCard } from "./blu-status-card";
import { AdminOrderList } from "./admin-order-list";
import styles from "./admin.module.css";

function SalesChart({
  data,
  locale,
  noData,
}: {
  data: AdminStats;
  locale: Locale;
  noData: string;
}) {
  const fa = locale === "fa";
  const timeZone = "UTC";
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const byDay = new Map(data.salesByDay.map((day) => [day.day, day]));
  const number = new Intl.NumberFormat(fa ? "fa-IR" : "en-US");
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone });
  const days = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(end);
    at.setUTCDate(end.getUTCDate() - 6 + index);
    const entry = byDay.get(at.toISOString().slice(0, 10));
    return { at, count: entry?.count ?? 0, revenue: entry?.revenue ?? 0 };
  });
  const maxRevenue = Math.max(1, ...days.map((day) => day.revenue));
  const revenue = days.reduce((total, day) => total + day.revenue, 0);
  const count = days.reduce((total, day) => total + day.count, 0);

  return (
    <>
      <div className={styles.chartTotal}>
        <strong>{formatPrice(revenue, data.currency, locale)}</strong>
        <span>
          {count
            ? fa
              ? `${number.format(count)} سفارش تحویل‌شده`
              : `${number.format(count)} delivered orders`
            : noData}
        </span>
      </div>
      <div className={styles.chart} aria-hidden="true">
        <div className={styles.bars}>
          {days.map(({ at, count, revenue }) => (
            <div
              className={styles.barSlot}
              key={at.toISOString()}
              title={`${date.format(at)} · ${formatPrice(revenue, data.currency, locale)} · ${number.format(count)}`}
            >
              <span
                className={styles.bar}
                data-empty={revenue <= 0}
                data-today={at.getTime() === end.getTime()}
                style={{ height: `${Math.max(1, (revenue / maxRevenue) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className={styles.axis}>
          {days.map(({ at }, index) => (
            <span key={at.toISOString()}>
              {index === 6 ? (fa ? "امروز" : "Today") : date.format(at)}
            </span>
          ))}
        </div>
      </div>
      <details className={styles.chartDetails}>
        <summary>{fa ? "جزئیات فروش روزانه" : "Daily sales details"}</summary>
        <table className={styles.dailyTable}>
          <thead>
            <tr>
              <th scope="col">{fa ? "روز" : "Day"}</th>
              <th scope="col">{fa ? "سفارش" : "Orders"}</th>
              <th scope="col">{fa ? "مبلغ" : "Revenue"}</th>
            </tr>
          </thead>
          <tbody>
            {days.map(({ at, count, revenue }) => (
              <tr key={at.toISOString()}>
                <td>{date.format(at)}</td>
                <td>{number.format(count)}</td>
                <td>{formatPrice(revenue, data.currency, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export function AdminDashboard({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.dash;
  const fa = locale === "fa";
  const base = `/${locale}/admin`;
  const number = new Intl.NumberFormat(fa ? "fa-IR" : "en-US");
  const statusMap = dict.dashboard.status as Record<string, string>;
  const { data, loading, error, refetch } = useApi<AdminStats>(
    token ? "/admin/stats" : null,
    token ?? undefined,
  );

  const stats = data
    ? [
        { label: t.revenue30, value: formatPrice(data.revenue30, data.currency, locale) },
        {
          label: t.paidOrders,
          value: number.format(data.paidOrders),
          note: fa
            ? `از ${number.format(data.totalOrders)} سفارش`
            : `of ${number.format(data.totalOrders)} orders`,
        },
        { label: t.customers, value: number.format(data.customers) },
        { label: t.revenue, value: formatPrice(data.revenueTotal, data.currency, locale) },
      ]
    : [];

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <div>
          <h1>{fa ? "نمای کلی فروشگاه" : "Store overview"}</h1>
        </div>
        <Link href={base + "/products/new"} className={styles.primaryLink}>
          <span aria-hidden="true">+</span>
          {fa ? "افزودن محصول" : "Add product"}
        </Link>
      </header>

      {loading ? (
        <div className={styles.panel} role="status">
          <Spinner className="size-5" /> <span className="sr-only">{dict.common.loading}</span>
        </div>
      ) : error || !data ? (
        <section className={styles.panel}>
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        </section>
      ) : (
        <>
          <div className={styles.paymentStrip}>
            <Link
              className={styles.queueLink}
              data-attention={data.pendingReview > 0}
              href={base + "/receipts"}
            >
              <b>{number.format(data.pendingReview)}</b>
              <span>
                <strong>
                  {fa ? "سفارش در انتظار بررسی رسید" : "Orders awaiting receipt review"}
                </strong>
                <small>
                  {fa ? "باز کردن صف رسیدها" : "Open receipt queue"}{" "}
                  <span aria-hidden="true">↗</span>
                </small>
              </span>
            </Link>
            <BluStatusCard locale={locale} copy={dict.admin.bluStatus} token={token} />
          </div>

          <dl className={styles.metrics}>
            {stats.map(({ label, value, note }) => (
              <div className={styles.metric} key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
                {note && <small>{note}</small>}
              </div>
            ))}
          </dl>

          <div className={styles.dashboardBody}>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>{fa ? "فروش هفتگی" : "Weekly sales"}</h2>
                  <p>
                    {fa
                      ? "۷ روز اخیر · مبلغ سفارش‌های تحویل‌شده"
                      : "Last 7 days · revenue from delivered orders"}
                  </p>
                </div>
              </header>
              <SalesChart data={data} locale={locale} noData={t.noData} />
            </section>

            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <h2>{t.recentOrders}</h2>
                <Link href={base + "/orders"} className={styles.inlineLink}>
                  {fa ? "همه سفارش‌ها" : "All orders"} <span aria-hidden="true">↗</span>
                </Link>
              </header>
              {!data.recentOrders.length ? (
                <p className={styles.empty}>{t.noData}</p>
              ) : (
                <AdminOrderList orders={data.recentOrders} locale={locale} statuses={statusMap} />
              )}
            </section>

            <div className={styles.inventoryGrid}>
              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div>
                    <h2>{fa ? "موجودی داخلی کم" : "Low internal inventory"}</h2>
                    <p>{fa ? "تعداد ثبت‌شده در انبار سایت" : "Units held by the store"}</p>
                  </div>
                </header>
                {!data.lowStock.length ? (
                  <p className={styles.empty}>{t.noData}</p>
                ) : (
                  <ul className={styles.productList}>
                    {data.lowStock.map((product) => (
                      <li key={product.id}>
                        <Link href={base + "/products/" + product.id}>
                          <span dir="auto">{product.name}</span>
                          <Badge tone={product.stock === 0 ? "default" : "muted"}>
                            {number.format(product.stock)}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <h2>{t.topProducts}</h2>
                </header>
                {!data.topProducts.length ? (
                  <p className={styles.empty}>{t.noData}</p>
                ) : (
                  <ul className={styles.productList}>
                    {data.topProducts.map((product) => (
                      <li key={product.id}>
                        <Link href={base + "/products/" + product.id}>
                          <span dir="auto">{product.name}</span>
                          <small>
                            {number.format(product.unitsSold)} {t.unitsSold}
                          </small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
