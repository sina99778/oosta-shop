"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { QueryError } from "@/components/query-error";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import type { Locale } from "@/lib/i18n";
import type { AdminStats, Paginated } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { AdminOrderList } from "./admin-order-list";
import styles from "./admin.module.css";

const statuses = [
  "PAID",
  "PENDING_REVIEW",
  "PENDING",
  "PAID_PENDING_FULFILLMENT",
  "FAILED",
  "REJECTED",
  "REFUNDED",
  "EXPIRED",
];

export function AdminOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const fa = locale === "fa";
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [invalid, setInvalid] = useState(false);
  const query = new URLSearchParams({ page: String(page), pageSize: "50" });
  if (status) query.set("status", status);
  if (search) query.set("q", search);
  const { data, loading, error, refetch } = useApi<Paginated<AdminStats["recentOrders"][number]>>(
    token ? `/admin/orders?${query.toString()}` : null,
    token ?? undefined,
  );
  const copy = dict.dashboard.status as Record<string, string>;
  const number = new Intl.NumberFormat(locale);

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <h1>{dict.admin.orders}</h1>
        <Link href={`/${locale}/admin/receipts`} className={styles.storeLink}>
          {fa ? "صف رسیدها" : "Receipt queue"} <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <section className={styles.panel}>
        <form
          className={styles.toolbar}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const value = input.trim().replace(/^#/, "");
            if (value && !/^[a-z0-9]{8,100}$/i.test(value)) {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            setSearch(value.toLowerCase());
            setPage(1);
          }}
        >
          <label className={styles.filterField}>
            <span>{fa ? "شماره سفارش" : "Order number"}</span>
            <Input
              type="search"
              dir="ltr"
              maxLength={101}
              value={input}
              placeholder={fa ? "کد کامل یا ۸ نویسهٔ پایانی" : "Full ID or last 8 characters"}
              aria-invalid={invalid}
              aria-describedby={invalid ? "order-search-error" : undefined}
              onChange={(event) => {
                setInput(event.target.value);
                setInvalid(false);
                if (!event.target.value) {
                  setSearch("");
                  setPage(1);
                }
              }}
            />
          </label>
          <button type="submit" className={styles.quietButton}>
            {fa ? "جست‌وجو" : "Search"}
          </button>
          <label className={styles.filterField}>
            <span>{fa ? "وضعیت سفارش" : "Order status"}</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{dict.common.all}</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {copy[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          {data && (
            <p className={styles.resultCount} aria-live="polite">
              {number.format(data.pagination.total)} {fa ? "سفارش" : "orders"}
            </p>
          )}
        </form>
        {invalid && (
          <p id="order-search-error" role="alert" className="mt-2 text-sm text-danger">
            {fa
              ? "شمارهٔ کامل یا ۸ نویسهٔ پایانی آن را وارد کن."
              : "Enter the full ID or the last eight letters and digits."}
          </p>
        )}
        {loading ? (
          <div role="status" className={styles.empty}>
            <Spinner className="size-5" />
            <span className="sr-only">{dict.common.loading}</span>
          </div>
        ) : error ? (
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        ) : !data?.items.length ? (
          data && data.pagination.page > 1 ? (
            <button
              type="button"
              className={`${styles.quietButton} mt-4`}
              onClick={() => setPage(1)}
            >
              {fa ? "بازگشت به صفحهٔ اول" : "Return to first page"}
            </button>
          ) : (
            <p className={styles.empty}>
              {search
                ? fa
                  ? "سفارشی با این شماره پیدا نشد."
                  : "No matching orders."
                : dict.admin.noOrders}
            </p>
          )
        ) : (
          <>
            <AdminOrderList orders={data.items} locale={locale} statuses={copy} contacts />
            <PaginationControls
              pagination={data.pagination}
              onPage={setPage}
              labels={dict.common}
            />
          </>
        )}
      </section>
    </div>
  );
}
