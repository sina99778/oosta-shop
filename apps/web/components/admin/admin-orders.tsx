"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
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

const STATUSES = ["", "PAID", "PENDING_REVIEW", "PENDING", "FAILED", "REJECTED"] as const;

function statusTone(status: string): "success" | "muted" | "danger" {
  if (status === "PAID") return "success";
  if (status === "PENDING" || status === "PENDING_REVIEW") return "muted";
  return "danger";
}

export function AdminOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin;
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ page: String(page), pageSize: "50" });
  if (status) query.set("status", status);
  const { data, loading } = useApi<{ items: AdminOrder[]; pagination: Pagination }>(
    token ? `/admin/orders?${query.toString()}` : null,
    token ?? undefined,
  );
  const statusMap = dict.dashboard.status as Record<string, string>;
  const totalPages = data?.pagination.totalPages ?? 1;

  return (
    <Container className="py-8">
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

      {loading ? (
        <Spinner className="size-6" />
      ) : !data || data.items.length === 0 ? (
        <p className="text-muted">{t.noOrders}</p>
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((order) => (
              <Card key={order.id} className="flex items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium">#{order.id.slice(-8)}</p>
                  <p className="text-muted">
                    {order.user.name} · {order.user.email ?? order.user.phone ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted">{formatDate(order.createdAt, locale)}</span>
                  <span className="font-semibold">
                    {formatPrice(order.totalAmount, order.currency, locale)}
                  </span>
                  <Badge tone={statusTone(order.paymentStatus)}>
                    {statusMap[order.paymentStatus] ?? order.paymentStatus}
                  </Badge>
                </div>
              </Card>
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
