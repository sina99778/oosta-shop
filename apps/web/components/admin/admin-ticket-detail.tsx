"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
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
import type { AdminTicketDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function tone(s: string): "success" | "muted" | "primary" {
  if (s === "ANSWERED") return "success";
  if (s === "OPEN") return "primary";
  return "muted";
}

export function AdminTicketDetailView({
  locale,
  ticketId,
  dict,
}: {
  locale: Locale;
  ticketId: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const t = dict.admin.tickets;
  const statusMap = t.status as Record<string, string>;
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useApi<{ ticket: AdminTicketDetail }>(
    token ? `/admin/tickets/${ticketId}?_r=${reload}` : null,
    token ?? undefined,
  );

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function reply(e: FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/tickets/${ticketId}/messages`, { body }, token);
      setBody("");
      setReload((r) => r + 1);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "OPEN" | "CLOSED") {
    if (!token) return;
    await api.post(`/admin/tickets/${ticketId}/status`, { status }, token).catch(() => {});
    setReload((r) => r + 1);
  }

  if (loading) {
    return (
      <Container className="py-20 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }
  if (error || !data) {
    return (
      <Container className="py-20 text-center text-muted">{dict.common.somethingWrong}</Container>
    );
  }
  const ticket = data.ticket;

  return (
    <Container className="max-w-2xl space-y-5 py-8">
      <Link href={`/${locale}/admin/tickets`} className="text-sm text-muted hover:text-foreground">
        ← {t.title}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-sm text-muted">
            {t.customer}: {ticket.user.name} · {ticket.user.email ?? ticket.user.phone ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={tone(ticket.status)}>{statusMap[ticket.status] ?? ticket.status}</Badge>
          {ticket.status === "CLOSED" ? (
            <Button size="sm" variant="outline" onClick={() => setStatus("OPEN")}>
              {t.reopen}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setStatus("CLOSED")}>
              {t.close}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {ticket.messages.map((m) => (
          <div key={m.id} className={cn("flex", m.isStaff ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                m.isStaff ? "bg-primary/10" : "bg-surface",
              )}
            >
              <p className="mb-1 text-xs font-medium text-muted">{m.isStaff ? t.staff : t.you}</p>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className="mt-1 text-[10px] text-muted">{formatDate(m.createdAt, locale)}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={reply} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={t.writeReply}
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <Button type="submit" disabled={busy || !body.trim()}>
          {busy ? <Spinner /> : t.reply}
        </Button>
      </form>
    </Container>
  );
}
