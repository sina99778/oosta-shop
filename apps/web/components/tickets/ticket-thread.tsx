"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { AccountFrame } from "@/components/account-frame";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TicketDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { ticketTone } from "./ticket-list";
import { ImagePicker, TicketAttachment, ticketImageError } from "./ticket-attachment";
import styles from "../account.module.css";

export function TicketThread({
  locale,
  ticketId,
  dict,
}: {
  locale: Locale;
  ticketId: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const t = dict.tickets;
  const fa = locale === "fa";
  const statuses = t.status as Record<string, string>;
  const { data, loading, error, refetch } = useApi<{ ticket: TicketDetail }>(
    token ? `/tickets/${ticketId}` : null,
    token ?? undefined,
  );
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const imageError = ticketImageError(image, fa);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [replySaved, setReplySaved] = useState(false);
  const sending = useRef(false);

  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!token || (!body.trim() && !image) || imageError || sending.current) return;
    sending.current = true;
    setBusy(true);
    setActionError(null);
    setReplySaved(false);
    try {
      if (image) {
        const form = new FormData();
        form.set("body", body);
        form.set("image", image);
        await api.upload(`/tickets/${ticketId}/messages`, form, token);
      } else {
        await api.post(`/tickets/${ticketId}/messages`, { body }, token);
      }
      setBody("");
      setImage(null);
      setReplySaved(true);
      refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 429
          ? fa
            ? "تعداد پیام‌ها زیاد است. کمی بعد دوباره تلاش کن."
            : "Too many replies. Try again shortly."
          : dict.common.somethingWrong,
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const ticket = data?.ticket.id === ticketId ? data.ticket : null;
  return (
    <AccountFrame
      locale={locale}
      section="support"
      title={ticket ? <bdi>{ticket.subject}</bdi> : t.title}
      detail={
        ticket && (
          <Badge tone={ticketTone(ticket.status)}>{statuses[ticket.status] ?? ticket.status}</Badge>
        )
      }
      action={
        <Link href={`/${locale}/support`} className={styles.action}>
          {t.back}
        </Link>
      }
    >
      <div className={styles.stack}>
        {replySaved && (
          <p role="status" className="text-sm text-primary">
            {fa ? "پیام ارسال شد." : "Message sent."}
          </p>
        )}
        {loading ? (
          <div className={styles.panel} role="status">
            <Spinner />
            <span className="sr-only">{dict.common.loading}</span>
          </div>
        ) : error?.status === 404 ? (
          <p className={styles.panel}>
            {fa ? "این تیکت در حساب تو پیدا نشد." : "This ticket was not found in your account."}
          </p>
        ) : error || !ticket ? (
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        ) : (
          <>
            {ticket.order && (
              <Link
                href={`/${locale}/dashboard/orders/${encodeURIComponent(ticket.order.id)}`}
                className={styles.row}
              >
                <div>
                  <p className={styles.rowTitle}>
                    {fa ? "سفارش مرتبط" : "Related order"}{" "}
                    <bdi dir="ltr">#{ticket.order.id.slice(-8)}</bdi>
                  </p>
                  <p className={styles.rowMeta}>
                    <time dateTime={ticket.order.createdAt}>
                      {formatDate(ticket.order.createdAt, locale)}
                    </time>
                  </p>
                </div>
              </Link>
            )}
            <section
              className={`${styles.panel} ${styles.stack}`}
              aria-labelledby="conversation-title"
            >
              <div className={styles.factRow}>
                <h2 id="conversation-title">{fa ? "گفت‌وگو" : "Conversation"}</h2>
                <Button type="button" variant="outline" onClick={refetch}>
                  {fa ? "به‌روزرسانی" : "Refresh"}
                </Button>
              </div>
              <ol className={styles.stack}>
                {ticket.messages.map((message) => (
                  <li key={message.id} className={styles.message} data-staff={message.isStaff}>
                    <div className={styles.factRow}>
                      <strong className="text-sm">{message.isStaff ? t.staff : t.you}</strong>
                      <time className="text-xs text-muted" dateTime={message.createdAt}>
                        {formatDate(message.createdAt, locale)}
                      </time>
                    </div>
                    {message.body && (
                      <p dir="auto" className="mt-2">
                        {message.body}
                      </p>
                    )}
                    {message.attachment && token && (
                      <TicketAttachment
                        path={`/tickets/${encodeURIComponent(ticketId)}/messages/${encodeURIComponent(message.id)}/attachment`}
                        token={token}
                        name={message.attachment.name}
                        size={message.attachment.size}
                        locale={locale}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <form onSubmit={reply} className={`${styles.panel} ${styles.stack}`} aria-busy={busy}>
              <label className="grid gap-2 text-sm font-medium">
                <span>{t.writeReply}</span>
                <textarea
                  dir="auto"
                  maxLength={5000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  required={!image}
                  disabled={busy}
                  className={styles.textarea}
                />
              </label>
              <ImagePicker
                id="reply-image"
                file={image}
                onChange={setImage}
                disabled={busy}
                locale={locale}
              />
              {imageError && (
                <p role="alert" className="text-sm text-danger">
                  {imageError}
                </p>
              )}
              {ticket.status === "CLOSED" && (
                <p className="text-sm text-muted">
                  {fa
                    ? "ارسال پاسخ، تیکت را دوباره باز می‌کند."
                    : "A reply will reopen this ticket."}
                </p>
              )}
              {actionError && (
                <p role="alert" className="text-sm text-danger">
                  {actionError}
                </p>
              )}
              <div>
                <Button
                  type="submit"
                  disabled={busy || (!body.trim() && !image) || Boolean(imageError)}
                >
                  {busy ? <Spinner /> : t.send}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </AccountFrame>
  );
}
