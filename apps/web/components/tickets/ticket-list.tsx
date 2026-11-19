"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { QueryError } from "@/components/query-error";
import { AccountFrame } from "@/components/account-frame";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TicketListItem } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "../account.module.css";

export function ticketTone(status: string): "success" | "muted" | "primary" {
  if (status === "ANSWERED") return "success";
  return status === "OPEN" ? "primary" : "muted";
}

export function TicketList({
  locale,
  dict,
  orderRef,
}: {
  locale: Locale;
  dict: Dictionary;
  orderRef?: string;
}) {
  const { token } = useAuth();
  const router = useRouter();
  const fa = locale === "fa";
  const t = dict.tickets;
  const statusMap = t.status as Record<string, string>;
  const { data, loading, error, refetch } = useApi<{ tickets: TicketListItem[] }>(
    token ? "/tickets" : null,
    token ?? undefined,
  );
  const [subject, setSubject] = useState(
    orderRef ? (fa ? `پیگیری سفارش #${orderRef}` : `Order #${orderRef} support`) : "",
  );
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sending = useRef(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!token || sending.current || !subject.trim() || !body.trim()) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    let navigating = false;
    try {
      const ticket = await api.post<{ id: string }>("/tickets", { subject, body }, token);
      router.push(`/${locale}/support/${encodeURIComponent(ticket.id)}`);
      navigating = true;
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.status === 429
          ? fa
            ? "تعداد پیام‌ها زیاد است. کمی بعد دوباره تلاش کن."
            : "Too many requests. Try again shortly."
          : dict.common.somethingWrong,
      );
    } finally {
      if (!navigating) {
        sending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <AccountFrame
      locale={locale}
      section="support"
      title={t.title}
      detail={fa ? "درخواست‌ها و پاسخ‌های پشتیبانی اوستا" : "Your requests and replies from Oosta"}
      action={
        <a className={styles.action} href="#new-ticket">
          {t.new}
        </a>
      }
    >
      <div className={styles.columns}>
        <section className={styles.stack} aria-labelledby="ticket-history">
          <h2 className="text-lg font-bold" id="ticket-history">
            {fa ? "تیکت‌های من" : "My tickets"}
          </h2>
          {loading ? (
            <div className={styles.panel} role="status">
              <Spinner />
              <span className="sr-only">{dict.common.loading}</span>
            </div>
          ) : error ? (
            <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
          ) : !data?.tickets.length ? (
            <p className={styles.panel}>{t.empty}</p>
          ) : (
            data.tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/${locale}/support/${ticket.id}`}
                className={styles.row}
                data-tone={ticketTone(ticket.status)}
              >
                <div>
                  <p dir="auto" className={styles.rowTitle}>
                    {ticket.subject}
                  </p>
                  <p dir="auto" className={`${styles.rowMeta} line-clamp-2`}>
                    {ticket.lastMessage}
                  </p>
                  <p className={styles.rowMeta}>
                    <time dateTime={ticket.updatedAt}>{formatDate(ticket.updatedAt, locale)}</time>
                  </p>
                </div>
                <Badge tone={ticketTone(ticket.status)}>
                  {statusMap[ticket.status] ?? ticket.status}
                </Badge>
              </Link>
            ))
          )}
        </section>
        <section
          className={`${styles.panel} ${styles.stack} scroll-mt-24`}
          id="new-ticket"
          aria-labelledby="new-ticket-title"
        >
          <h2 id="new-ticket-title">{t.new}</h2>
          {orderRef && (
            <p className="text-sm text-muted">
              {fa ? "شمارهٔ سفارش" : "Order number"} <bdi>#{orderRef}</bdi>
            </p>
          )}
          <form onSubmit={create} className={styles.stack} aria-busy={busy}>
            <label className="grid gap-2 text-sm font-medium">
              <span>{t.subject}</span>
              <Input
                dir="auto"
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              <span>{t.message}</span>
              <textarea
                dir="auto"
                className={styles.textarea}
                maxLength={5000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                aria-describedby="ticket-safety"
                disabled={busy}
                required
              />
            </label>
            <p id="ticket-safety" className="text-sm text-muted">
              {fa
                ? "رمز حساب، کد تأیید یا اطلاعات کارت بانکی را در تیکت ننویس."
                : "Keep passwords, verification codes and card details out of support messages."}
            </p>
            {message && (
              <p role="alert" className="text-sm text-danger">
                {message}
              </p>
            )}
            <Button type="submit" disabled={busy || !subject.trim() || !body.trim()}>
              {busy ? <Spinner /> : t.send}
            </Button>
          </form>
        </section>
      </div>
    </AccountFrame>
  );
}
