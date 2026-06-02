"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminTicketList } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Filter = "" | "OPEN" | "ANSWERED" | "CLOSED";

function tone(s: string): "success" | "muted" | "primary" {
  if (s === "ANSWERED") return "success";
  if (s === "OPEN") return "primary";
  return "muted";
}

export function AdminTickets({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.tickets;
  const statusMap = t.status as Record<string, string>;
  const [filter, setFilter] = useState<Filter>("OPEN");

  const query = filter ? `?status=${filter}` : "";
  const { data, loading } = useApi<AdminTicketList>(
    token ? `/admin/tickets${query}` : null,
    token ?? undefined,
  );

  const tabs: { key: Filter; label: string }[] = [
    { key: "OPEN", label: t.open },
    { key: "ANSWERED", label: t.answered },
    { key: "CLOSED", label: t.closed },
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
            {tab.key === "OPEN" && data && data.openCount > 0 && (
              <span className="ms-2 rounded-full bg-primary px-1.5 text-xs text-white">
                {data.openCount}
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
        <div className="space-y-2">
          {data.items.map((tk) => (
            <Link key={tk.id} href={`/${locale}/admin/tickets/${tk.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 transition-colors hover:border-primary">
                <div>
                  <p className="font-medium">{tk.subject}</p>
                  <p className="text-sm text-muted">
                    {tk.user.name} · {tk.user.email ?? tk.user.phone ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted">{formatDate(tk.updatedAt, locale)}</span>
                  <Badge tone={tone(tk.status)}>{statusMap[tk.status] ?? tk.status}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
