"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { PaginationControls } from "@/components/pagination-controls";
import { QueryError } from "@/components/query-error";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminReview, AdminReviewList } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Filter = "" | "PENDING" | "APPROVED" | "REJECTED";

// Flags reviews that carry links, handles or phone numbers for a closer look; never auto-rejects.
export function looksPromotional(comment: string | null): boolean {
  if (!comment) return false;
  return /https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{4,}|(?:\+98|0)9\d{9}|[۰-۹]{10,}/i.test(comment);
}

function stars(n: number): string {
  return "★★★★★☆☆☆☆☆".slice(5 - n, 10 - n);
}
function tone(status: string): "success" | "muted" | "danger" {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "muted";
  return "danger";
}

export function AdminReviews({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const fa = locale === "fa";
  const t = dict.admin.reviews;
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = `?page=${page}&pageSize=50&${filter ? `status=${filter}&` : ""}_r=${reload}`;
  const { data, loading, error, refetch } = useApi<AdminReviewList>(
    token ? `/admin/reviews${query}` : null,
    token ?? undefined,
  );

  const tabs: { key: Filter; label: string }[] = [
    { key: "PENDING", label: t.pending },
    { key: "APPROVED", label: t.approved },
    { key: "REJECTED", label: t.rejected },
    { key: "", label: t.all },
  ];

  async function act(review: AdminReview, action: "approve" | "reject" | "delete") {
    setBusyId(review.id);
    setActionError(null);
    try {
      if (action === "delete") await api.del(`/admin/reviews/${review.id}`, token ?? undefined);
      else await api.post(`/admin/reviews/${review.id}/${action}`, {}, token ?? undefined);
      setReload((n) => n + 1);
    } catch {
      setActionError(dict.common.somethingWrong);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Container className="space-y-4 py-8">
      {actionError && (
        <p role="alert" className="text-danger">
          {actionError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key || "all"}
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              filter === tab.key
                ? "border-primary bg-surface text-foreground"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.key === "PENDING" && data && data.pendingCount > 0 && (
              <span className="ms-2 rounded-full bg-primary px-1.5 text-xs text-white">
                {data.pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner className="size-6" />
      ) : error ? (
        <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
      ) : !data || data.items.length === 0 ? (
        <p className="text-muted">{t.none}</p>
      ) : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Card key={r.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {t.product}: {r.product.name}
                  </p>
                  <p className="text-muted">
                    {t.customer}: {r.user.name} · {r.user.email ?? r.user.phone ?? "—"}
                  </p>
                  <p className="mt-1 text-amber-400" title={`${r.rating}/5`}>
                    {stars(r.rating)}
                  </p>
                  {r.comment && <p className="mt-1">{r.comment}</p>}
                  {looksPromotional(r.comment) && (
                    <p className="mt-1">
                      <Badge tone="danger">{fa ? "مشکوک به تبلیغ" : "Possible spam"}</Badge>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">{formatDate(r.createdAt, locale)}</p>
                </div>
                <Badge tone={tone(r.status)}>
                  {t[r.status.toLowerCase() as "pending" | "approved" | "rejected"]}
                </Badge>
              </div>
              <div className="flex gap-2">
                {r.status !== "APPROVED" && (
                  <Button size="sm" onClick={() => act(r, "approve")} disabled={busyId === r.id}>
                    {busyId === r.id ? <Spinner /> : t.approve}
                  </Button>
                )}
                {r.status !== "REJECTED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(r, "reject")}
                    disabled={busyId === r.id}
                  >
                    {t.reject}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act(r, "delete")}
                  disabled={busyId === r.id}
                >
                  {t.delete}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {data && (
        <PaginationControls pagination={data.pagination} onPage={setPage} labels={dict.common} />
      )}
    </Container>
  );
}
