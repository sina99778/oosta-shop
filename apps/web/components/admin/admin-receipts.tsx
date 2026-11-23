"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { PaginationControls } from "@/components/pagination-controls";
import { QueryError } from "@/components/query-error";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminReceipt, AdminReceiptList } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./admin.module.css";

type Filter = "" | "PENDING" | "APPROVED" | "REJECTED";

function tone(status: string): "success" | "muted" | "danger" {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "muted";
  return "danger";
}

export function AdminReceipts({
  locale,
  dict,
  orderId,
  onOrderUpdated,
}: {
  locale: Locale;
  dict: Dictionary;
  orderId?: string;
  onOrderUpdated?: () => void;
}) {
  const { token } = useAuth();
  const t = dict.admin.receipts;
  const fa = locale === "fa";
  const number = new Intl.NumberFormat(locale);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>(orderId ? "" : "PENDING");
  const [reload, setReload] = useState(0);

  const query = new URLSearchParams({ page: String(page), pageSize: "50", _r: String(reload) });
  if (filter) query.set("status", filter);
  if (orderId) query.set("orderId", orderId);
  const { data, loading, error, refetch } = useApi<AdminReceiptList>(
    token ? `/admin/receipts?${query}` : null,
    token ?? undefined,
  );

  const tabs: { key: Filter; label: string }[] = [
    { key: "PENDING", label: t.pending },
    { key: "APPROVED", label: t.approved },
    { key: "REJECTED", label: t.rejected },
    { key: "", label: t.all },
  ];

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        {orderId ? (
          <h2>{fa ? "رسیدهای این سفارش" : "Order receipts"}</h2>
        ) : (
          <h1>{fa ? "بررسی رسیدهای پرداخت" : "Payment receipt review"}</h1>
        )}
        <button type="button" className={styles.quietButton} onClick={refetch} disabled={loading}>
          {dict.admin.bluStatus.refresh}
        </button>
      </header>
      <div
        className={styles.filterTabs}
        aria-label={fa ? "وضعیت رسید" : "Receipt status"}
        role="group"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key || "all"}
            type="button"
            aria-pressed={filter === tab.key}
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
          >
            {tab.label}
            {tab.key === "PENDING" && data && data.pendingCount > 0 && (
              <span>{number.format(data.pendingCount)}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div role="status" className={styles.panel}>
          <Spinner className="size-5" />
          <span className="sr-only">{dict.common.loading}</span>
        </div>
      ) : error ? (
        <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
      ) : !data || data.items.length === 0 ? (
        <div className={styles.panel}>
          {data && data.pagination.page > 1 ? (
            <button type="button" className={styles.quietButton} onClick={() => setPage(1)}>
              {fa ? "بازگشت به صفحهٔ اول" : "Return to first page"}
            </button>
          ) : (
            <p className={styles.empty}>
              {filter === "PENDING"
                ? fa
                  ? "رسیدی در صف بررسی نیست."
                  : "No receipts awaiting review."
                : t.none}
            </p>
          )}
        </div>
      ) : (
        <div className={styles.receiptList}>
          {data.items.map((r) => (
            <ReceiptRow
              key={r.id}
              receipt={r}
              locale={locale}
              dict={dict}
              token={token ?? undefined}
              showOrderLink={!orderId}
              onReviewed={() => {
                if (filter === "PENDING" && data.items.length === 1)
                  setPage((p) => Math.max(1, p - 1));
                setReload((n) => n + 1);
                onOrderUpdated?.();
              }}
            />
          ))}
        </div>
      )}
      {data && (
        <PaginationControls pagination={data.pagination} onPage={setPage} labels={dict.common} />
      )}
    </div>
  );
}

function ReceiptRow({
  receipt: r,
  locale,
  dict,
  token,
  onReviewed,
  showOrderLink,
}: {
  receipt: AdminReceipt;
  locale: Locale;
  dict: Dictionary;
  token: string | undefined;
  onReviewed: () => void;
  showOrderLink: boolean;
}) {
  const t = dict.admin.receipts;
  const fa = locale === "fa";
  const statusMap = dict.dashboard.status as Record<string, string>;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [image, setImage] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const live = useRef(false);
  const previewUrl = useRef<string | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, []);

  const who = r.order.user.email ?? r.order.user.phone ?? r.order.user.name;
  const bankBlocked = r.bankEvidence === "waiting" || r.bankEvidence === "review";
  const orderClosed = ["PAID", "REFUNDED", "EXPIRED"].includes(r.order.paymentStatus);

  async function toggleImage() {
    if (image) {
      URL.revokeObjectURL(image.url);
      previewUrl.current = null;
      setImage(null);
      return;
    }
    setImgLoading(true);
    try {
      const blob = await api.blob(`/admin/receipts/${r.id}/image`, token);
      if (live.current) {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        const url = URL.createObjectURL(blob);
        previewUrl.current = url;
        setImage({ url, isPdf: r.mimeType === "application/pdf" });
      }
    } catch {
      setErr(dict.common.somethingWrong);
    } finally {
      setImgLoading(false);
    }
  }

  async function review(action: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      await api.post(
        `/admin/receipts/${r.id}/${action}`,
        { note: note.trim() || undefined },
        token,
      );
      onReviewed();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : dict.common.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <article className={styles.receipt}>
      <header className={styles.receiptHeader}>
        <div>
          {showOrderLink && (
            <Link href={`/${locale}/admin/orders/${r.order.id}`} className={styles.inlineLink}>
              {t.order} <bdi>#{r.order.id.slice(-8)}</bdi>
            </Link>
          )}
          <h2 dir="auto">{r.order.user.name}</h2>
        </div>
        <div>
          <strong className={styles.receiptAmount}>
            {formatPrice(r.order.totalAmount, r.order.currency, locale)}
          </strong>
          <Badge tone={tone(r.status)}>
            {t[r.status.toLowerCase() as "pending" | "approved" | "rejected"]}
          </Badge>
        </div>
      </header>
      <dl className={styles.receiptFacts}>
        <div>
          <dt>{t.customer}</dt>
          <dd>
            <bdi>{who}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t.uploaded}</dt>
          <dd>
            <time dateTime={r.createdAt}>{formatDate(r.createdAt, locale)}</time>
          </dd>
        </div>
        <div>
          <dt>{fa ? "وضعیت سفارش" : "Order status"}</dt>
          <dd>{statusMap[r.order.paymentStatus] ?? r.order.paymentStatus}</dd>
        </div>
        {r.reference && (
          <div>
            <dt>{t.note}</dt>
            <dd>
              <bdi>{r.reference}</bdi>
            </dd>
          </div>
        )}
        {r.reviewerNote && (
          <div>
            <dt>{fa ? "یادداشت مدیر" : "Review note"}</dt>
            <dd dir="auto">{r.reviewerNote}</dd>
          </div>
        )}
      </dl>

      <div className={styles.receiptPreview}>
        {r.bankEvidence && (
          <p className={styles.bankEvidence} data-blocked={bankBlocked}>
            <span aria-hidden="true" />
            {t.bluEvidence[r.bankEvidence]}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={toggleImage}
          disabled={imgLoading}
          aria-expanded={!!image}
        >
          {imgLoading ? <Spinner /> : image ? t.hide : t.view}
        </Button>
      </div>

      {image &&
        (image.isPdf ? (
          <a
            href={image.url}
            download="receipt.pdf"
            className="block text-sm text-primary underline"
          >
            {fa ? "دانلود رسید (PDF)" : "Download receipt (PDF)"}
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={t.view} className={styles.receiptImage} />
        ))}

      {r.status === "PENDING" && (
        <div className={styles.receiptActions}>
          <label className={styles.filterField}>
            <span>{t.reviewNote}</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div>
            <Button
              type="button"
              onClick={() => review("approve")}
              disabled={busy || bankBlocked || orderClosed}
            >
              {busy ? <Spinner /> : t.approve}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => review("reject")}
              disabled={busy}
            >
              {t.reject}
            </Button>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      )}
    </article>
  );
}
