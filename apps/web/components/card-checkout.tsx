"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, DragEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { receiptFileError } from "@/lib/receipt-file";
import { planDisplayLabel } from "@/lib/product-variant";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  LineTile,
  LockIcon,
  RefreshIcon,
} from "@/components/checkout-ui";
import { Wordmark } from "@/components/wordmark";
import styles from "./checkout.module.css";
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
  const [copied, setCopied] = useState<"card" | "amount" | null>(null);
  const [copying, setCopying] = useState(false);
  const [additional, setAdditional] = useState(false);
  const submitting = useRef(false);
  const [elapsedDeadline, setElapsedDeadline] = useState<string | null>(null);
  const deadline =
    data?.order.bluInvoice?.expiresAt ??
    data?.order.manualSupplier?.expiresAt ??
    data?.order.cartPayment?.expiresAt;
  const remainingMs =
    data?.order.bluInvoice?.remainingMs ??
    data?.order.manualSupplier?.remainingMs ??
    data?.order.cartPayment?.remainingMs;
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
      <Container className={styles.page}>
        <div className={styles.result} role="status">
          <Spinner className="size-6" />
          <p>{dict.common.loading}</p>
        </div>
      </Container>
    );
  if (!data)
    return (
      <Container className={styles.page}>
        <section className={styles.result} data-tone="danger">
          <span className={styles.resultIcon} aria-hidden="true">
            <AlertIcon size={32} />
          </span>
          <p role="alert">{apiErrorMessage(error, locale, dict.common.somethingWrong)}</p>
          <div className={styles.resultActions}>
            <Button variant="outline" onClick={refetch}>
              {t.retry}
            </Button>
          </div>
        </section>
      </Container>
    );

  const fa = locale === "fa";
  const formatNum = new Intl.NumberFormat(fa ? "fa-IR" : "en-US");
  const stepNum = (n: number) => (fa ? formatNum.format(n) : String(n).padStart(2, "0"));
  const order = data.order;
  const reviewing = order.paymentStatus === "PENDING_REVIEW";
  const paid = order.paymentStatus === "PAID";
  const awaiting = order.paymentStatus === "PAID_PENDING_FULFILLMENT";
  const editable =
    order.paymentProvider === "CARD_TO_CARD" &&
    ["PENDING", "PENDING_REVIEW", "REJECTED"].includes(order.paymentStatus);
  const invoice = order.bluInvoice;
  const trackingRequired = Boolean(
    invoice?.stockHeld || invoice?.supplierCheckout || order.manualSupplier || order.cartPayment,
  );
  const invoiceExpired =
    !!deadline && (invoice?.expired === true || remainingMs === 0 || elapsedDeadline === deadline);
  const transfer = editable && !reviewing && !invoiceExpired;
  const cartUploadClosed = order.cartPayment && order.paymentStatus === "PENDING" && invoiceExpired;
  const canUpload =
    editable &&
    !cartUploadClosed &&
    (!order.manualSupplier || order.paymentStatus !== "REJECTED") &&
    (!reviewing || additional);
  const card = order.cardToCard;
  const orderUrl = `/${locale}/dashboard/orders/${order.id}`;
  const statusMap = dict.dashboard.status as Record<string, string>;
  const latestRejected = editable && order.receipts[0]?.status === "REJECTED";
  const number = card?.number.replace(/\s/g, "") ?? "";
  const displayNumber = /^\d{16}$/.test(number) ? number.match(/.{4}/g)!.join(" ") : card?.number;
  const step = paid || awaiting ? 4 : reviewing ? 3 : file ? 2 : 1;

  async function copyValue(kind: "card" | "amount") {
    if ((kind === "card" && !card) || copying) return;
    setCopying(true);
    setCopyMessage(t.copying);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        navigator.clipboard.writeText(kind === "card" ? number : String(order.totalAmount)),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Clipboard unavailable")), 2000);
        }),
      ]);
      setCopied(kind);
      setCopyMessage(t.copied);
    } catch {
      setCopied(null);
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
    if (submitting.current || !canUpload) return;
    if (!file) {
      setFormError(t.selectFile);
      return;
    }
    if (trackingRequired && !/^[0-9۰-۹٠-٩]{4,30}$/.test(reference.trim())) {
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
      setFormError(apiErrorMessage(err, locale, dict.common.somethingWrong));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Container className={styles.page}>
      <section className={styles.deskStage}>
        <div className={styles.deskStageCopy}>
          <Link href={orderUrl} className={styles.deskBack}>
            {t.back}
          </Link>
          <p className={styles.deskEyebrow}>{t.deskTitle}</p>
          <h1>{transfer ? t.deskIntro : t.title}</h1>
          <p className={styles.deskStageSub}>{transfer ? t.instructions : t.statusIntro}</p>
        </div>
        <div className={styles.deskMeta}>
          {deadline && (
            <span className={styles.deskDeadline}>
              <ClockIcon size={16} />
              <span>
                {t.invoiceDeadline} <time dateTime={deadline}>{formatDate(deadline, locale)}</time>
              </span>
            </span>
          )}
          <span className={styles.deskDeadline}>
            {dict.dashboard.orderNo} <bdi className="font-mono">#{order.id.slice(-8)}</bdi>
          </span>
          <Badge tone={paid ? "success" : "muted"}>
            {statusMap[order.paymentStatus] ?? order.paymentStatus}
          </Badge>
        </div>
      </section>

      <ol aria-label={t.title} className={styles.steps}>
        {[t.transferStep, t.receiptStep, t.reviewStep].map((label, i) => {
          const itemStep = i + 1;
          const done = step > itemStep;
          const current = editable && step === itemStep;
          return (
            <li
              key={label}
              data-state={done ? "done" : current ? "current" : "next"}
              aria-current={current ? "step" : undefined}
            >
              <span className={styles.stepDot} aria-hidden="true">
                {done ? <CheckIcon size={14} /> : stepNum(itemStep)}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </li>
          );
        })}
      </ol>

      <div className={styles.notices}>
        {error && (
          <div className={styles.notice} data-tone="danger" role="alert">
            <AlertIcon size={18} />
            <p>{apiErrorMessage(error, locale, dict.common.somethingWrong)}</p>
            <Button variant="outline" size="sm" onClick={refetch}>
              {t.retry}
            </Button>
          </div>
        )}
        {order.manualSupplier && (
          <div className={styles.notice}>
            <ClockIcon size={18} />
            <p>
              {fa
                ? "تحویل پس از بررسی رسید و تهیهٔ محصول توسط فروشگاه انجام می‌شود."
                : "Delivery follows receipt review and sourcing by the store."}
              {order.manualSupplier.deliveryHours
                ? fa
                  ? ` زمان معمول تهیه حدود ${order.manualSupplier.deliveryHours.toLocaleString("fa-IR")} ساعت پس از تأیید رسید است.`
                  : ` Typical sourcing time is about ${order.manualSupplier.deliveryHours} hours after approval.`
                : null}
            </p>
          </div>
        )}
        {invoice?.qaOnly && (
          <div className={styles.notice} role="status">
            <AlertIcon size={18} />
            <p>
              {invoice.privateStockQa
                ? fa
                  ? "این سفارش خصوصی برای آزمون کارت‌به‌کارت و تحویل کالا است. پس از واریز، رسید و شمارهٔ پیگیری را ثبت کن."
                  : "This private order tests bank transfer and product delivery. Upload the receipt and tracking number after transfer."
                : t.qaInvoice}
            </p>
          </div>
        )}
        {(reviewing || paid || awaiting || !editable) && (
          <div
            role="status"
            className={styles.notice}
            data-tone={paid ? undefined : awaiting ? "warn" : undefined}
          >
            <Mark kind={paid ? "check" : "clock"} className="text-primary" />
            <p>
              <strong>
                {paid
                  ? t.approved
                  : reviewing
                    ? t.sent
                    : awaiting
                      ? statusMap[order.paymentStatus]
                      : t.closedTitle}
              </strong>{" "}
              — {reviewing ? t.reviewNote : awaiting ? t.noRepay : t.closedBody}
            </p>
            <Link href={orderUrl} className={styles.textLink}>
              {t.viewOrder}
            </Link>
          </div>
        )}
        {editable && !reviewing && invoiceExpired && (
          <div role="status" className={styles.notice} data-tone="warn">
            <ClockIcon size={18} />
            <p>{t.invoiceExpired}</p>
          </div>
        )}
        {latestRejected && (
          <div role="status" className={styles.notice} data-tone="danger">
            <AlertIcon size={18} />
            <p>
              <strong className="text-danger">{t.rejected}</strong>
              {order.receipts[0].reviewerNote ? ` — ${order.receipts[0].reviewerNote}` : null}
            </p>
          </div>
        )}
      </div>

      <div className={styles.deskGrid}>
        <aside className={styles.deskAside} aria-label={t.summary}>
          <section className={styles.amountCard}>
            <div className={styles.amountCardHead}>
              <p className={styles.amountLabel}>{t.amount}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={copying}
                onClick={() => copyValue("amount")}
              >
                <Mark kind={copied === "amount" ? "check" : "copy"} className="size-4" />
                {copied === "amount"
                  ? t.copied
                  : fa
                    ? "کپی مبلغ به " + (order.currency === "IRR" ? "ریال" : "تومان")
                    : "Copy transfer amount"}
              </Button>
            </div>
            <p className={styles.amountValue}>
              {formatPrice(order.totalAmount, order.currency, locale)}
            </p>
            <p className={styles.amountNote}>{t.amountNote}</p>
            {(invoice || deadline) && (
              <dl className={styles.amountBreakdown}>
                {invoice && (
                  <>
                    <div>
                      <dt>{t.invoiceBase}</dt>
                      <dd>{formatPrice(invoice.baseAmount, order.currency, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t.invoiceDiscount}</dt>
                      <dd>{formatPrice(invoice.discount, order.currency, locale)}</dd>
                    </div>
                  </>
                )}
                {deadline && (
                  <div>
                    <dt>{t.invoiceDeadline}</dt>
                    <dd>
                      <time dateTime={deadline}>{formatDate(deadline, locale)}</time>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>{t.summary}</h2>
              <span className={styles.invoiceNo}>
                <span>{dict.dashboard.orderNo}</span>
                <strong dir="ltr">#{order.id.slice(-8)}</strong>
              </span>
            </div>
            <ul className={styles.lines}>
              {order.items.map((item) => (
                <li key={item.id} className={styles.line}>
                  <LineTile name={item.product.name} />
                  <div className={styles.lineInfo}>
                    <h3>{item.product.name}</h3>
                    <p>
                      <bdi>{planDisplayLabel(item.plan.label, fa)}</bdi> · ×
                      {formatNum.format(item.quantity)}
                    </p>
                  </div>
                  <span className={styles.linePrice}>
                    {formatPrice(item.lineTotal, order.currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.secure}>
              <LockIcon size={15} />
              <span>{t.transferNote}</span>
            </p>
          </section>
        </aside>

        <div className={styles.deskMain}>
          {transfer && (
            <section className={styles.card} aria-label={t.destination}>
              <div className={styles.deskStepHead}>
                <div className={styles.deskStepTitle}>
                  <span className={styles.deskStepBadge} aria-hidden="true">
                    {stepNum(1)}
                  </span>
                  <div>
                    <h2>{t.transferStep}</h2>
                    <p>{t.destination}</p>
                  </div>
                </div>
              </div>
              <div className={styles.bankCard}>
                <div className={styles.bankCardGlow} aria-hidden="true" />
                <div className={styles.bankCardTop}>
                  <span className="text-xs text-[#c5d9d9]">{t.destination}</span>
                  <Wordmark className="scale-90" />
                </div>
                {card ? (
                  <>
                    <div className={styles.bankCardChip} aria-hidden="true" />
                    <p className={styles.bankCardLabel}>{t.cardNumber}</p>
                    <p dir="ltr" className={styles.bankCardNumber}>
                      {displayNumber}
                    </p>
                    <div className={styles.bankCardMeta}>
                      <div>
                        <p className={styles.bankCardLabel}>{t.cardHolder}</p>
                        <p className="text-sm font-semibold">{card.holder || "—"}</p>
                      </div>
                      <div>
                        <p className={styles.bankCardLabel}>{t.bank}</p>
                        <p className="text-sm font-semibold">{card.bank || "—"}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue("card")}
                      disabled={copying}
                      aria-busy={copying}
                      className={styles.bankCardCopy}
                    >
                      <Mark kind={copied === "card" ? "check" : "copy"} className="size-4" />
                      {copied === "card" ? t.copied : t.copy}
                    </button>
                    <p
                      aria-live="polite"
                      className="mt-2 min-h-5 text-center text-xs text-[#c5d9d9]"
                    >
                      {copyMessage}
                    </p>
                  </>
                ) : (
                  <p role="alert" className="py-10 text-sm leading-7">
                    {t.cardUnavailable}
                  </p>
                )}
              </div>
            </section>
          )}

          {canUpload && (
            <section className={styles.card}>
              <div className={styles.deskStepHead}>
                <div className={styles.deskStepTitle}>
                  <span className={styles.deskStepBadge} aria-hidden="true">
                    {stepNum(2)}
                  </span>
                  <div>
                    <h2>{t.uploadTitle}</h2>
                    <p>{t.receiptNote}</p>
                  </div>
                </div>
              </div>
              <form onSubmit={submit}>
                <fieldset disabled={busy} className="min-w-0 space-y-5">
                  <ReceiptPicker file={file} onSelect={selectFile} t={t} busy={busy} />
                  <div>
                    <label htmlFor="receipt-reference" className="mb-2 block text-sm font-semibold">
                      {trackingRequired
                        ? fa
                          ? "شمارهٔ پیگیری بانکی (الزامی)"
                          : "Bank tracking number (required)"
                        : t.reference}
                    </label>
                    <Input
                      id="receipt-reference"
                      required={trackingRequired}
                      inputMode={trackingRequired ? "numeric" : "text"}
                      maxLength={trackingRequired ? 30 : 200}
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      aria-describedby="reference-hint"
                    />
                    <p id="reference-hint" className="mt-2 text-xs leading-6 text-muted">
                      {trackingRequired ? t.bluReferenceRequired : t.referenceHint}
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
                  <Button
                    type="submit"
                    className="min-h-12 w-full"
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {busy ? (
                      <>
                        <Spinner />
                        {t.uploading}
                      </>
                    ) : (
                      <>
                        <Mark kind="upload" className="size-4" />
                        {t.submit}
                      </>
                    )}
                  </Button>
                </fieldset>
              </form>
            </section>
          )}

          <section className={styles.card}>
            <div className={styles.deskStepHead}>
              <div className={styles.deskStepTitle}>
                <span className={styles.deskStepBadge} aria-hidden="true">
                  {stepNum(3)}
                </span>
                <div>
                  <h2>{t.reviewStep}</h2>
                  <p>{order.receipts.length > 0 ? t.yourReceipts : t.statusIntro}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={refetch} disabled={busy}>
                <RefreshIcon size={15} />
                {t.refresh}
              </Button>
            </div>
            {order.receipts.length > 0 ? (
              <ol className="space-y-3">
                {order.receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3"
                  >
                    <div className="min-w-0 text-xs leading-6">
                      <p className="font-medium">
                        {t.uploadedOn} {formatDate(receipt.createdAt, locale)}
                      </p>
                      {receipt.reference && (
                        <p className="break-words text-muted" dir="auto">
                          {receipt.reference}
                        </p>
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
            ) : (
              <p className="text-sm text-muted">
                {fa
                  ? "پس از ارسال رسید، وضعیت بررسی خودکار یا دستی اینجا نمایش داده می‌شود."
                  : "After submitting a receipt, its verification status appears here."}
              </p>
            )}
            {reviewing && !additional && (
              <div className="mt-4">
                <Button variant="outline" onClick={() => setAdditional(true)}>
                  {t.anotherReceipt}
                </Button>
              </div>
            )}
          </section>
        </div>
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
