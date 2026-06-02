"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TicketListItem } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function tone(s: string): "success" | "muted" | "primary" {
  if (s === "ANSWERED") return "success";
  if (s === "OPEN") return "primary";
  return "muted";
}

export function TicketList({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.tickets;
  const statusMap = t.status as Record<string, string>;
  const [reload, setReload] = useState(0);
  const { data, loading } = useApi<{ tickets: TicketListItem[] }>(
    token ? `/tickets?_r=${reload}` : null,
    token ?? undefined,
  );

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/tickets", { subject, body }, token);
      setSubject("");
      setBody("");
      setMsg(t.created);
      setReload((r) => r + 1);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-2xl space-y-6 py-10">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      <Card>
        <h2 className="mb-3 font-semibold">{t.new}</h2>
        <form onSubmit={create} className="space-y-2">
          <Input
            placeholder={t.subject}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <textarea
            placeholder={t.message}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          {msg && <p className="text-sm text-muted">{msg}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : t.send}
          </Button>
        </form>
      </Card>

      {loading ? (
        <Spinner className="size-6" />
      ) : !data || data.tickets.length === 0 ? (
        <p className="text-muted">{t.empty}</p>
      ) : (
        <div className="space-y-2">
          {data.tickets.map((tk) => (
            <Link key={tk.id} href={`/${locale}/support/${tk.id}`} className="block">
              <Card className="transition-colors hover:border-primary">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{tk.subject}</p>
                  <Badge tone={tone(tk.status)}>{statusMap[tk.status] ?? tk.status}</Badge>
                </div>
                <p className="mt-1 truncate text-sm text-muted">{tk.lastMessage}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(tk.updatedAt, locale)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
