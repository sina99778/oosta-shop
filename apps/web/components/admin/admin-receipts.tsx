"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminReceipt, AdminReceiptList } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Filter = "" | "PENDING" | "APPROVED" | "REJECTED";

function tone(status: string): "success" | "muted" | "danger" {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "muted";
  return "danger";
}

export function AdminReceipts({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.receipts;
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [reload, setReload] = useState(0);

  const query = `?${filter ? `status=${filter}&` : ""}_r=${reload}`;
  const { data, loading } = useApi<AdminReceiptList>(
    token ? `/admin/receipts${query}` : null,
    token ?? undefined,
  );

  const tabs: { key: Filter; label: string }[] = [
    { key: "PENDING", label: t.pending },
    { key: "APPROVED", label: t.approved },
    { key: "REJECTED", label: t.rejected },
    { key: "", label: t.all },
  ];

  return (
    <Container className="space-y-4 py-8">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key || "all"}
            onClick={() => setFilter(tab.key)}
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
      ) : !data || data.items.length === 0 ? (
        <p className="text-muted">{t.none}</p>
      ) : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <ReceiptRow
              key={r.id}
              receipt={r}
              locale={locale}
              dict={dict}
              token={token ?? undefined}
              onReviewed={() => setReload((n) => n + 1)}
            />
          ))}
        </div>
      )}
    </Container>
  );
}

function ReceiptRow({
  receipt: r,
  locale,
  dict,
  token,
  onReviewed,
}: {
  receipt: AdminReceipt;
  locale: Locale;
  dict: Dictionary;
  token: string | undefined;
  onReviewed: () => void;
}) {
  const t = dict.admin.receipts;
  const statusMap = dict.dashboard.status as Record<string, string>;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [image, setImage] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  const who = r.order.user.email ?? r.order.user.phone ?? r.order.user.name;

  async function toggleImage() {
    if (image) {
      URL.revokeObjectURL(image.url);
      setImage(null);
      return;
    }
    setImgLoading(true);
    try {
      const blob = await api.blob(`/admin/receipts/${r.id}/image`, token);
      setImage({ url: URL.createObjectURL(blob), isPdf: r.mimeType === "application/pdf" });
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
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">
            {t.order} #{r.order.id.slice(-8)} · {r.order.user.name}
          </p>
          <p className="text-muted">{who}</p>
          <p className="mt-1 text-muted">
            {t.uploaded}: {formatDate(r.createdAt, locale)}
          </p>
          {r.reference && (
            <p className="text-muted">
              {t.note}: {r.reference}
            </p>
          )}
          {r.reviewerNote && (
            <p className="text-muted">
              {t.reviewNote}: {r.reviewerNote}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="font-semibold">
            {formatPrice(r.order.totalAmount, r.order.currency, locale)}
          </span>
          <Badge tone={tone(r.status)}>
            {t[r.status.toLowerCase() as "pending" | "approved" | "rejected"]}
          </Badge>
          <span className="text-xs text-muted">
            {statusMap[r.order.paymentStatus] ?? r.order.paymentStatus}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={toggleImage} disabled={imgLoading}>
          {imgLoading ? <Spinner /> : image ? t.hide : t.view}
        </Button>
      </div>

      {image &&
        (image.isPdf ? (
          <a
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-primary underline"
          >
            {t.view} (PDF)
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt="receipt"
            className="max-h-96 w-auto rounded-lg border border-border"
          />
        ))}

      {r.status === "PENDING" && (
        <div className="space-y-2 border-t border-border pt-3">
          <Input
            placeholder={t.reviewNote}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => review("approve")} disabled={busy}>
              {busy ? <Spinner /> : t.approve}
            </Button>
            <Button size="sm" variant="outline" onClick={() => review("reject")} disabled={busy}>
              {t.reject}
            </Button>
          </div>
        </div>
      )}
      {r.status !== "PENDING" && err && <p className="text-sm text-danger">{err}</p>}
    </Card>
  );
}
