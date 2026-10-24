"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Envelope, StatusPostmark } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { postmarkTone } from "@/lib/order-status";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type AdminOrder = {
  id: string;
  totalAmount: number;
  currency: string;
  paymentStatus: string;
  itemCount: number;
  createdAt: string;
  user: { name: string; email: string | null; phone: string | null };
};
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

const STATUSES = [
  "",
  "PAID",
  "PAID_UNFULFILLED",
  "PENDING_REVIEW",
  "PENDING",
  "EXPIRED",
  "FAILED",
  "REJECTED",
  "REFUNDED",
] as const;

export function AdminOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin;
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = new URLSearchParams({ page: String(page), pageSize: "50", _r: String(reload) });
  if (status) query.set("status", status);
  const { data, loading } = useApi<{ items: AdminOrder[]; pagination: Pagination }>(
    token ? `/admin/orders?${query.toString()}` : null,
    token ?? undefined,
  );
  const statusMap = dict.dashboard.status as Record<string, string>;
  const short = dict.dashboard.statusShort as Record<string, string>;
  const totalPages = data?.pagination.totalPages ?? 1;

  // Deliver a paid order whose stock ran out (after restocking its plan).
  async function fulfill(orderId: string) {
    setFulfilling(orderId);
    setNotice(null);
    try {
      await api.post(`/admin/orders/${orderId}/fulfill`, {}, token ?? undefined);
      setNotice(t.fulfilled);
      setReload((r) => r + 1);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setFulfilling(null);
    }
  }

  return (
    <Container className="py-8">
      <h1 className="mb-5 text-2xl font-black">{t.orders}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              status === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {s === "" ? dict.common.all : (statusMap[s] ?? s)}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="mb-4 text-sm text-muted">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[14px]" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-muted">{t.noOrders}</p>
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((order) => (
              <Envelope key={order.id}>
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted" dir="ltr">
                      #{order.id.slice(-8).toUpperCase()}
                    </p>
                    <p className="font-bold">{order.user.name}</p>
                    <p className="text-muted" dir="ltr">
                      {order.user.email ?? order.user.phone ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-muted">{formatDate(order.createdAt, locale)}</span>
                    <span className="font-semibold">
                      {formatPrice(order.totalAmount, order.currency, locale)}
                    </span>
                    <StatusPostmark
                      label={
                        short[order.paymentStatus] ??
                        statusMap[order.paymentStatus] ??
                        order.paymentStatus
                      }
                      tone={postmarkTone(order.paymentStatus)}
                      className="size-[64px] text-[10px]"
                    />
                    {order.paymentStatus === "PAID_UNFULFILLED" && (
                      <Button
                        size="sm"
                        disabled={fulfilling !== null}
                        onClick={() => fulfill(order.id)}
                      >
                        {fulfilling === order.id ? <Spinner /> : t.fulfill}
                      </Button>
                    )}
                  </div>
                </div>
              </Envelope>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {dict.common.previous}
              </Button>
              <span className="text-sm text-muted">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {dict.common.next}
              </Button>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
