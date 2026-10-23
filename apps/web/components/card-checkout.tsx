"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { OrderDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function receiptTone(status: string): "success" | "muted" | "danger" {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "muted";
  return "danger";
}

export function CardCheckout({
  locale,
  orderId,
  dict,
}: {
  locale: Locale;
  orderId: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const [reload, setReload] = useState(0);
  const [inReview, setInReview] = useState(false);
  // Poll while the receipt is in review, so approval shows up without a refresh.
  const { data, loading, error } = useApi<{ order: OrderDetail }>(
    token ? `/orders/${orderId}?_r=${reload}` : null,
    token ?? undefined,
    { refreshMs: inReview ? 15_000 : undefined },
  );
  const status = data?.order.paymentStatus;
  useEffect(() => {
    queueMicrotask(() => setInReview(status === "PENDING_REVIEW"));
  }, [status]);

  const t = dict.checkout.cardToCard;
  const statusMap = dict.dashboard.status as Record<string, string>;

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (loading) {
    return (
      <Container className="max-w-2xl py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
      </Container>
    );
  }
  if (error || !data) {
    return (
      <Container className="py-20 text-center text-muted">{dict.common.somethingWrong}</Container>
    );
  }

  const order = data.order;
  const card = order.cardToCard;
  // Mirrors the API: an expired/rejected order can still take a receipt (the buyer
  // may genuinely have paid); paid/refunded ones can't.
  const canUpload = ["PENDING", "PENDING_REVIEW", "REJECTED", "EXPIRED", "FAILED"].includes(
    order.paymentStatus,
  );
  const latestRejected = order.receipts.length > 0 && order.receipts[0].status === "REJECTED";

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setFormError(t.selectFile);
      return;
    }
    if (!token) return;
    setBusy(true);
    setFormError(null);
    try {
      const form = new FormData();
      form.append("receipt", file);
      if (reference.trim()) form.append("reference", reference.trim());
      await api.upload(`/orders/${orderId}/receipt`, form, token);
      setFile(null);
      setReference("");
      if (fileRef.current) fileRef.current.value = "";
      setReload((r) => r + 1);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {dict.dashboard.orderNo} #{order.id.slice(-8)} ·{" "}
        <Badge tone={order.paymentStatus === "PAID" ? "success" : "muted"}>
          {statusMap[order.paymentStatus] ?? order.paymentStatus}
        </Badge>
      </p>

      {order.paymentStatus === "PAID" ? (
        <Card className="mt-6 space-y-3">
          <p className="font-medium text-success">{t.approved}</p>
          <Link href={`/${locale}/dashboard/orders/${order.id}`}>
            <Button>{t.viewOrder}</Button>
          </Link>
        </Card>
      ) : (
        <>
          {/* Destination card + amount */}
          {card && (
            <Card className="mt-6 space-y-4">
              <p className="text-sm text-muted">{t.instructions}</p>

              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted">{t.amount}</p>
                <p className="text-2xl font-bold">
                  {formatPrice(order.totalAmount, order.currency, locale)}
                </p>
              </div>

              {order.expiresAt && (
                <p className="text-sm text-muted">
                  {dict.dashboard.reservedUntil}{" "}
                  <strong className="text-foreground">{formatDate(order.expiresAt, locale)}</strong>
                </p>
              )}

              <CardField
                label={t.cardNumber}
                value={card.number}
                onCopy={copy}
                copied={copied}
                copyLabel={t.copy}
                copiedLabel={t.copied}
                mono
              />
              {card.holder && (
                <CardField
                  label={t.cardHolder}
                  value={card.holder}
                  onCopy={copy}
                  copied={copied}
                  copyLabel={t.copy}
                  copiedLabel={t.copied}
                />
              )}
              {card.bank && (
                <CardField
                  label={t.bank}
                  value={card.bank}
                  onCopy={copy}
                  copied={copied}
                  copyLabel={t.copy}
                  copiedLabel={t.copied}
                />
              )}
            </Card>
          )}

          {/* Status banners */}
          {order.paymentStatus === "PENDING_REVIEW" && !latestRejected && (
            <Card className="mt-4">
              <p className="font-medium">{t.submitted}</p>
              <p className="mt-1 text-sm text-muted">{t.pendingBody}</p>
              <p className="mt-1 text-xs text-muted">
                {dict.dashboard.reviewEta} {dict.dashboard.autoRefresh}
              </p>
            </Card>
          )}
          {latestRejected && (
            <Card className="mt-4 border-danger/40">
              <p className="font-medium text-danger">{t.rejected}</p>
              {order.receipts[0].reviewerNote && (
                <p className="mt-1 text-sm text-muted">“{order.receipts[0].reviewerNote}”</p>
              )}
            </Card>
          )}

          {/* Upload form */}
          {canUpload && (
            <Card className="mt-4">
              <h2 className="mb-3 font-semibold">{t.uploadTitle}</h2>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-muted">{t.file}</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={onFileChange}
                    className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
                  />
                </div>
                <Input
                  placeholder={t.reference}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                {formError && (
                  <p role="alert" className="text-sm text-danger">
                    {formError}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <>
                      <Spinner /> {t.uploading}
                    </>
                  ) : (
                    t.submit
                  )}
                </Button>
              </form>
            </Card>
          )}
        </>
      )}

      {/* Receipt history for this order */}
      {order.receipts.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-muted">{t.yourReceipts}</h2>
          <div className="space-y-2">
            {order.receipts.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  <p>
                    {t.uploadedOn} {formatDate(r.createdAt, locale)}
                  </p>
                  {r.reference && <p className="text-muted">{r.reference}</p>}
                </div>
                <Badge tone={receiptTone(r.status)}>
                  {
                    dict.admin.receipts[
                      r.status.toLowerCase() as "pending" | "approved" | "rejected"
                    ]
                  }
                </Badge>
              </Card>
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}

function CardField({
  label,
  value,
  onCopy,
  copied,
  copyLabel,
  copiedLabel,
  mono,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
  copied: string | null;
  copyLabel: string;
  copiedLabel: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p
          dir={mono ? "ltr" : undefined}
          className={mono ? "truncate font-mono text-lg tracking-wide" : "truncate"}
        >
          {mono ? value.replace(/(\d{4})(?=\d)/g, "$1 ") : value}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onCopy(value)} type="button">
        <span aria-live="polite">{copied === value ? copiedLabel : copyLabel}</span>
      </Button>
    </div>
  );
}
