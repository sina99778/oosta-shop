"use client";

// Customers: search by name/email/phone, see what each has bought, and issue a
// one-time password reset link (handed over by support — there is no SMS/email).

import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  paidOrders: number;
  spent: number;
};

type Page = {
  currency: string;
  items: Customer[];
  pagination: { page: number; totalPages: number; total: number };
};

export function AdminCustomers({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.customers;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), ...(search ? { q: search } : {}) });
  const { data, loading } = useApi<Page>(
    token ? `/admin/customers?${params}` : null,
    token ?? undefined,
  );
  const num = (n: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);

  const [links, setLinks] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  async function makeLink(c: Customer) {
    if (!window.confirm(t.confirmReset.replace("{name}", c.name))) return;
    setBusy(c.id);
    setError(null);
    try {
      const res = await api.post<{ url: string; expiresAt: string }>(
        `/admin/customers/${c.id}/reset-link?locale=${locale}`,
        undefined,
        token ?? undefined,
      );
      setLinks((l) => ({ ...l, [c.id]: res }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setBusy(null);
    }
  }

  async function copy(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // Clipboard blocked: the link stays selectable on screen.
    }
  }

  const customers = data?.items ?? [];

  return (
    <Container className="space-y-6 py-8">
      <header>
        <h1 className="text-2xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
      </header>

      <form onSubmit={submit} role="search" className="flex gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className="max-w-md"
        />
        <Button type="submit" variant="outline">
          {t.search}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {loading && !data ? (
        <Spinner className="size-6" />
      ) : customers.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-dashed divide-border overflow-hidden rounded-[14px] border border-border bg-card shadow-card">
          {customers.map((c) => {
            const link = links[c.id];
            return (
              <li key={c.id} className="p-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-bold">
                      <bdi>{c.name}</bdi>
                      {c.role === "ADMIN" && (
                        <span className="ms-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-[#f3eee4]">
                          {t.admin}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {[c.email, c.phone].filter(Boolean).map((v, i) => (
                        <span key={v}>
                          {i > 0 && " · "}
                          <bdi dir="ltr">{v}</bdi>
                        </span>
                      ))}
                    </p>
                  </div>
                  <dl className="flex gap-6 text-sm">
                    <div>
                      <dt className="text-xs text-muted">{t.orders}</dt>
                      <dd className="font-bold">{num(c.paidOrders)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t.spent}</dt>
                      <dd className="font-bold">
                        {formatPrice(c.spent, data?.currency ?? "IRR", locale)}
                      </dd>
                    </div>
                    <div className="hidden sm:block">
                      <dt className="text-xs text-muted">{t.joined}</dt>
                      <dd>{formatDate(c.createdAt, locale)}</dd>
                    </div>
                  </dl>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === c.id}
                    onClick={() => makeLink(c)}
                  >
                    {busy === c.id ? <Spinner /> : t.resetLink}
                  </Button>
                </div>
                {link && (
                  <div className="mt-3 rounded-[10px] border border-dashed border-primary/60 bg-primary/5 p-3">
                    <p className="text-xs text-muted">
                      {t.linkReady.replace("{time}", formatDate(link.expiresAt, locale))}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        readOnly
                        value={link.url}
                        dir="ltr"
                        aria-label={t.resetLink}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-9 min-w-0 flex-1 rounded-[8px] border border-border bg-card px-2 font-mono text-xs"
                      />
                      <Button size="sm" onClick={() => copy(c.id, link.url)}>
                        {copied === c.id ? t.copied : t.copy}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.pagination.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label={t.title}>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t.prev}
          </Button>
          <span className="text-muted">
            {num(page)} / {num(data.pagination.totalPages)}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t.next}
          </Button>
        </nav>
      )}
    </Container>
  );
}
