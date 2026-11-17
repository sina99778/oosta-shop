"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, DragEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { receiptFileError } from "@/lib/receipt-file";
import { planDisplayLabel } from "@/lib/product-variant";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { OrderDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Copy = Dictionary["checkout"]["cardToCard"];

function Mark({
  kind,
  className = "",
}: {
  kind: "copy" | "check" | "upload" | "file" | "clock" | "close";
  className?: string;
}) {
  const paths = {
    copy: "M9 9h11v11H9z M15 5V3H3v12h2",
    check: "m5 12 4 4L19 6",
    upload: "M12 16V3m-5 5 5-5 5 5 M4 15v6h16v-6",
    file: "M14 2H5v20h14V7z M14 2v6h5 M8 13h8m-8 4h5",
    clock: "M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    close: "m6 6 12 12M6 18 18 6",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 shrink-0 ${className}`}
    >
      <path d={paths[kind]} />
    </svg>
  );
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
  const { data, loading, error, refetch } = useApi<{ order: OrderDetail }>(
    token ? `/orders/${orderId}` : null,
    token ?? undefined,
  );
  const t = dict.checkout.cardToCard;
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [additional, setAdditional] = useState(false);
  const submitting = useRef(false);
  const [elapsedDeadline, setElapsedDeadline] = useState<string | null>(null);
  const deadline = data?.order.bluInvoice?.expiresAt;
  const remainingMs = data?.order.bluInvoice?.remainingMs;
  const orderStatus = data?.order.paymentStatus;
  useEffect(() => {
    if (!deadline || !remainingMs || (orderStatus !== "PENDING" && orderStatus !== "REJECTED"))
      return;
    const until = performance.now() + remainingMs;
    const timer = setTimeout(() => setElapsedDeadline(deadline), remainingMs);
    const checkOnResume = () => {
      if (document.visibilityState !== "visible") return;
      if (performance.now() >= until) setElapsedDeadline(deadline);
      refetch();
    };
    document.addEventListener("visibilitychange", checkOnResume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkOnResume);
    };
  }, [deadline, remainingMs, orderStatus, refetch]);

  useEffect(() => {
    if (orderStatus !== "PENDING_REVIEW" && orderStatus !== "PAID_PENDING_FULFILLMENT") return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const timer = setInterval(refreshVisible, 15000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [orderStatus, refetch]);

  if (loading)
    return (
      <Container className="py-24 text-center">
        <span role="status">
          <Spinner className="size-6" />
          <span className="sr-only">{dict.common.loading}</span>
        </span>
      </Container>
    );
  if (error || !data)
    return (
      <Container className="py-24 text-center">
        <p role="alert" className="mb-4 text-muted">
          {dict.common.somethingWrong}
        </p>
        <Button variant="outline" onClick={refetch}>
          {t.retry}
        </Button>
      </Container>
    );

  const order = data.order;
  const reviewing = order.paymentStatus === "PENDING_REVIEW";
  const paid = order.paymentStatus === "PAID";
  const awaiting = order.paymentStatus === "PAID_PENDING_FULFILLMENT";
  const editable =
    order.paymentProvider === "CARD_TO_CARD" &&
    ["PENDING", "PENDING_REVIEW", "REJECTED"].includes(order.paymentStatus);
  const invoice = order.bluInvoice;
  const invoiceExpired = !!invoice && (invoice.expired || elapsedDeadline === invoice.expiresAt);
  const transfer = editable && !reviewing && !invoiceExpired;
  const canUpload = editable && (!reviewing || additional);
  const card = order.cardToCard;
  const orderUrl = `/${locale}/dashboard/orders/${order.id}`;
  const statusMap = dict.dashboard.status as Record<string, string>;
  const latestRejected = editable && order.receipts[0]?.status === "REJECTED";
  const number = card?.number.replace(/\s/g, "") ?? "";
  const displayNumber = /^\d{16}$/.test(number) ? number.match(/.{4}/g)!.join(" ") : card?.number;
  const step = paid || awaiting ? 4 : reviewing ? 3 : file ? 2 : 1;

  async function copyCard() {
    if (!card || copying) return;
    setCopying(true);
    setCopyMessage(t.copying);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        navigator.clipboard.writeText(number),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Clipboard unavailable")), 2000);
        }),
      ]);
      setCopied(true);
      setCopyMessage(t.copied);
    } catch {
      setCopied(false);
      setCopyMessage(t.copyFailed);
    } finally {
      clearTimeout(timeout);
      setCopying(false);
    }
  }

  function selectFile(next: File | null) {
    if (busy) return;
    if (next) {
      const reason = receiptFileError(next);
      if (reason) {
        setFormError(
          reason === "size"
            ? t.fileSizeError
            : reason === "empty"
              ? t.fileEmptyError
              : t.fileTypeError,
        );
        return;
      }
    }
    setFile(next);
    setFormError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !editable) return;
    if (!file) {
      setFormError(t.selectFile);
      return;
    }
    if (invoice?.stockHeld && !/^[0-9۰-۹٠-٩]{4,30}$/.test(reference.trim())) {
      setFormError(t.bluReferenceRequired);
      return;
    }
    if (!token) return;
    submitting.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const form = new FormData();
      form.append("receipt", file);
      if (reference.trim()) form.append("reference", reference.trim());
      await api.upload(`/orders/${orderId}/receipt`, form, token);
      setFile(null);
      setReference("");
      setAdditional(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-6xl py-8 sm:py-12">
      <Link
        href={orderUrl}
        className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
      >
        {t.back}
      </Link>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-sm text-primary">{t.deskTitle}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            {transfer ? t.deskIntro : t.statusIntro}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">
            {dict.dashboard.orderNo} <bdi className="font-mono">#{order.id.slice(-8)}</bdi>
          </span>
          <Badge tone={paid ? "success" : "muted"}>
            {statusMap[order.paymentStatus] ?? order.paymentStatus}
          </Badge>
        </div>
      </header>
      {invoice?.qaOnly && (
        <p role="status" className="mt-5 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          {invoice.privateStockQa
            ? locale === "fa"
              ? "این سفارش خصوصی برای آزمون کارت‌به‌کارت و تحویل کالا است. پس از واریز، رسید و شمارهٔ پیگیری را ثبت کن."
              : "This private order tests bank transfer and product delivery. Upload the receipt and tracking number after transfer."
            : t.qaInvoice}
        </p>
      )}
      <ol aria-label={t.title} className="my-8 grid grid-cols-3 border-y border-border py-5">
        {[t.transferStep, t.receiptStep, t.reviewStep].map((label, i) => (
          <li
            key={label}
            aria-current={editable && step === i + 1 ? "step" : undefined}
            className="flex flex-col items-center gap-2 text-center text-xs sm:flex-row sm:justify-center sm:gap-3 sm:text-sm"
          >
            <span
              className={`flex size-7 items-center justify-center rounded-full border font-mono ${step > i + 1 ? "border-primary bg-primary text-primary-foreground" : step === i + 1 && editable ? "border-primary text-primary" : "border-border text-muted"}`}
            >
              {step > i + 1 ? (
                <Mark kind="check" className="size-4" />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <span className={step >= i + 1 ? "text-foreground" : "text-muted"}>{label}</span>
          </li>
        ))}
      </ol>
      {(reviewing || paid || awaiting || !editable) && (
        <section
          role="status"
          className="mb-6 flex items-start gap-4 rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mark kind={paid ? "check" : "clock"} />
          </span>
          <div>
            <h2 className="text-xl font-semibold">
              {paid
                ? t.approved
                : reviewing
                  ? t.sent
                  : awaiting
                    ? statusMap[order.paymentStatus]
                    : t.closedTitle}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
              {reviewing ? t.reviewNote : awaiting ? t.noRepay : t.closedBody}
            </p>
            <Link
              href={orderUrl}
              className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4"
            >
              {t.viewOrder}
            </Link>
          </div>
        </section>
      )}
      {editable && !reviewing && invoiceExpired && (
        <p role="status" className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          {t.invoiceExpired}
        </p>
      )}
      <div
        className={`grid items-start gap-6 ${transfer || canUpload ? "lg:grid-cols-[1fr_1.05fr]" : ""}`}
      >
        {transfer && (
          <section className="min-w-0 space-y-5" aria-label={t.destination}>
            <div className="relative isolate overflow-hidden rounded-3xl bg-[#102e3a] p-6 text-[#eff8f5] sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-24 -top-16 size-80 rounded-full border border-white/10 after:absolute after:inset-5 after:rounded-full after:border after:border-white/10"
              />
              <div className="relative flex items-center justify-between gap-4">
                <span className="text-sm text-[#c5d9d9]">{t.destination}</span>
                <span dir="ltr" className="font-mono text-lg font-medium tracking-tight">
                  oosta<span className="text-[#86e1c6]">/</span>AI
                </span>
              </div>
              {card ? (
                <>
                  <div
                    className="my-8 h-7 w-10 rounded-lg border border-[#86e1c6]/60 bg-[#86e1c6]/10"
                    aria-hidden="true"
                  >
                    <div className="mx-auto h-full w-4 border-x border-[#86e1c6]/40" />
                  </div>
                  <p className="mb-2 text-xs text-[#c5d9d9]">{t.cardNumber}</p>
                  <p
                    dir="ltr"
                    className="relative select-all whitespace-nowrap text-start font-mono text-[clamp(1.1rem,4.6vw,1.8rem)] leading-relaxed tracking-[.04em] tabular-nums"
                  >
                    {displayNumber}
                  </p>
                  <div className="relative mt-8 flex flex-wrap justify-between gap-4 border-t border-white/15 pt-5">
                    <div>
                      <p className="text-xs text-[#c5d9d9]">{t.cardHolder}</p>
                      <p className="mt-2 break-words text-sm">{card.holder || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#c5d9d9]">{t.bank}</p>
                      <p className="mt-2 text-sm">{card.bank || "—"}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={copyCard}
                    disabled={copying}
                    aria-busy={copying}
                    className="relative mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#a6efd6] px-4 text-sm font-medium text-[#102e3a] transition-colors hover:bg-[#c2f7e5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  >
                    <Mark kind={copied ? "check" : "copy"} />
                    {copied ? t.copied : t.copy}
                  </button>
                  <p
                    aria-live="polite"
                    className="relative mt-2 min-h-5 text-center text-xs text-[#c5d9d9]"
                  >
                    {copyMessage}
                  </p>
                </>
              ) : (
                <p role="alert" className="relative py-12 text-sm leading-7">
                  {t.cardUnavailable}
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-sm text-muted">{t.amount}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                {formatPrice(order.totalAmount, order.currency, locale)}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted">{t.amountNote}</p>
              {invoice && (
                <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <dt className="text-muted">{t.invoiceBase}</dt>
                    <dd>{formatPrice(invoice.baseAmount, order.currency, locale)}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <dt className="text-muted">{t.invoiceDiscount}</dt>
                    <dd>{formatPrice(invoice.discount, order.currency, locale)}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <dt className="text-muted">{t.invoiceDeadline}</dt>
                    <dd>
                      <time dateTime={invoice.expiresAt}>
                        {formatDate(invoice.expiresAt, locale)}
                      </time>
                    </dd>
                  </div>
                </dl>
              )}
            </div>
            <p className="px-1 text-xs leading-6 text-muted">{t.transferNote}</p>
          </section>
        )}
        {canUpload && (
          <section className="min-w-0 rounded-3xl border border-border bg-card p-6 sm:p-8">
            <div className="mb-6 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary">
                <Mark kind="upload" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">{t.uploadTitle}</h2>
                <p className="mt-1 text-xs leading-6 text-muted">{t.receiptNote}</p>
              </div>
            </div>
            {latestRejected && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm"
              >
                <p className="font-medium text-danger">{t.rejected}</p>
                {order.receipts[0].reviewerNote && (
                  <p className="mt-2 break-words leading-6 text-muted">
                    {order.receipts[0].reviewerNote}
                  </p>
                )}
              </div>
            )}
            <form onSubmit={submit}>
              <fieldset disabled={busy} className="min-w-0 space-y-5">
                <ReceiptPicker file={file} onSelect={selectFile} t={t} busy={busy} />
                <div>
                  <label htmlFor="receipt-reference" className="mb-2 block text-sm">
                    {t.reference}
                  </label>
                  <Input
                    id="receipt-reference"
                    maxLength={200}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    aria-describedby="reference-hint"
                  />
                  <p id="reference-hint" className="mt-2 text-xs leading-6 text-muted">
                    {invoice?.stockHeld ? t.bluReferenceRequired : t.referenceHint}
                  </p>
                </div>
                {formError && (
                  <p
                    id="receipt-error"
                    role="alert"
                    className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm leading-6 text-danger"
                  >
                    {formError}
                  </p>
                )}
                <Button type="submit" className="min-h-12 w-full" disabled={busy} aria-busy={busy}>
                  {busy ? (
                    <>
                      <Spinner />
                      {t.uploading}
                    </>
                  ) : (
                    <>
                      <Mark kind="upload" />
                      {t.submit}
                    </>
                  )}
                </Button>
              </fieldset>
            </form>
          </section>
        )}
      </div>
      {reviewing && !additional && (
        <Button variant="outline" className="mb-6" onClick={() => setAdditional(true)}>
          {t.anotherReceipt}
        </Button>
      )}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        <section>
          <h2 className="mb-4 text-sm font-medium">{t.summary}</h2>
          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div>
                  <p>{item.product.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    <bdi>{planDisplayLabel(item.plan.label, locale === "fa")}</bdi> ·{" "}
                    {item.quantity}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">
                  {formatPrice(item.lineTotal, order.currency, locale)}
                </span>
              </div>
            ))}
          </div>
        </section>
        {order.receipts.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-medium">{t.yourReceipts}</h2>
            <ol className="space-y-3">
              {order.receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <div className="min-w-0 text-xs leading-6">
                    <p>
                      {t.uploadedOn} {formatDate(receipt.createdAt, locale)}
                    </p>
                    {receipt.reference && (
                      <p className="break-words text-muted">{receipt.reference}</p>
                    )}
                  </div>
                  <Badge
                    tone={
                      receipt.status === "APPROVED"
                        ? "success"
                        : receipt.status === "REJECTED"
                          ? "danger"
                          : "muted"
                    }
                  >
                    {
                      dict.admin.receipts[
                        receipt.status.toLowerCase() as "pending" | "approved" | "rejected"
                      ]
                    }
                  </Badge>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      <div className="mt-8 border-t border-border pt-6">
        <Button variant="outline" onClick={refetch} disabled={busy}>
          <Mark kind="clock" />
          {t.refresh}
        </Button>
      </div>
    </Container>
  );
}

function ReceiptPicker({
  file,
  onSelect,
  t,
  busy,
}: {
  file: File | null;
  onSelect: (file: File | null) => void;
  t: Copy;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file || file.type === "application/pdf") return;
    const url = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setPreview({ file, url });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) onSelect(event.dataTransfer.files[0] ?? null);
  }
  return (
    <div
      onDrop={drop}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      className={`rounded-2xl border-2 border-dashed p-5 transition-colors focus-within:border-primary motion-reduce:transition-none ${dragging ? "border-primary bg-primary/10" : "border-border bg-surface/40"}`}
    >
      <input
        ref={input}
        id="receipt-upload"
        type="file"
        aria-label={t.file}
        className="sr-only"
        disabled={busy}
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        onChange={(event) => {
          if (event.target.files?.[0]) onSelect(event.target.files[0]);
          event.target.value = "";
        }}
      />
      {file ? (
        <>
          <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-xl bg-card p-3">
            {file.type.startsWith("image/") && preview?.file === file ? (
              <Image
                src={preview.url}
                unoptimized
                width={480}
                height={320}
                alt={t.previewAlt}
                className="max-h-40 max-w-full rounded-lg object-contain"
              />
            ) : (
              <Mark kind="file" className="size-10 text-muted" />
            )}
          </div>
          <div className="mt-4 flex min-w-0 items-center gap-3">
            <Mark kind="file" className="text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" dir="auto">
                {file.name}
              </p>
              <p className="mt-1 text-xs text-muted">{Math.ceil(file.size / 1024)} KB</p>
            </div>
            <button
              type="button"
              disabled={busy}
              aria-label={t.removeFile}
              onClick={() => onSelect(null)}
              className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-card focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Mark kind="close" />
            </button>
          </div>
        </>
      ) : (
        <div className="py-5 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-card text-primary">
            <Mark kind="upload" />
          </span>
          <p className="mt-4 text-base font-medium">{t.dropTitle}</p>
          <p className="mx-auto mt-2 max-w-56 text-xs leading-6 text-muted">{t.dropHint}</p>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        {file ? t.changeFile : t.chooseFile}
      </Button>
      <p className="mt-3 text-center text-xs leading-6 text-muted">{t.fileHint}</p>
    </div>
  );
}
