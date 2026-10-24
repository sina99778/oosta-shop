"use client";

// Message every Telegram bot member who kept news on (shop news, exclusive
// offers). Sending runs on the server in batches; this page polls its progress.

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Broadcast = {
  id: string;
  text: string;
  total: number;
  sent: number;
  failed: number;
  doneAt: string | null;
  createdAt: string;
};

const MAX = 3500;

export function AdminBroadcasts({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.broadcasts;
  const [reload, setReload] = useState(0);
  const { data, loading } = useApi<{ broadcasts: Broadcast[]; audience: number; enabled: boolean }>(
    token ? `/admin/broadcasts?_r=${reload}` : null,
    token ?? undefined,
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (n: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);

  // Refresh while a send is in progress.
  const sending = data?.broadcasts.some((b) => !b.doneAt) ?? false;
  useEffect(() => {
    if (!sending) return;
    const id = setInterval(() => setReload((r) => r + 1), 5000);
    return () => clearInterval(id);
  }, [sending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data || !window.confirm(t.confirm.replace("{n}", num(data.audience)))) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/admin/broadcasts", { text }, token ?? undefined);
      setText("");
      setReload((r) => r + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-3xl space-y-6 py-8">
      <header>
        <h1 className="text-2xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
      </header>

      {loading && !data ? (
        <Spinner className="size-6" />
      ) : !data?.enabled ? (
        <p className="rounded-[14px] border border-dashed border-border bg-card p-5 text-sm text-muted">
          {t.disabled}
        </p>
      ) : (
        <form
          onSubmit={submit}
          className="rounded-[14px] border border-border bg-card p-5 shadow-card"
        >
          <p className="text-sm font-bold">{t.audience.replace("{n}", num(data.audience))}</p>
          <label htmlFor="broadcast-text" className="mt-4 block text-sm font-bold">
            {t.text}
          </label>
          <textarea
            id="broadcast-text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={6}
            required
            placeholder={t.placeholder}
            className="mt-1 w-full rounded-xl border border-border bg-surface p-3 text-sm leading-7 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-1 flex justify-between gap-3 text-xs text-muted">
            <span>{t.hint}</span>
            <span dir="ltr">
              {text.length}/{MAX}
            </span>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="mt-4"
            disabled={busy || !text.trim() || data.audience === 0}
          >
            {busy ? <Spinner /> : t.send}
          </Button>
        </form>
      )}

      {data && (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="mb-3 font-extrabold">
            {t.history}
          </h2>
          {data.broadcasts.length === 0 ? (
            <p className="text-sm text-muted">{t.empty}</p>
          ) : (
            <ul className="space-y-3">
              {data.broadcasts.map((b) => (
                <li
                  key={b.id}
                  className="rounded-[14px] border border-border bg-card p-4 shadow-card"
                >
                  <p className="text-sm leading-7 whitespace-pre-wrap">{b.text}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{formatDate(b.createdAt, locale)}</span>
                    <span className={b.doneAt ? "text-success" : "flex items-center gap-1"}>
                      {b.doneAt ? (
                        `✓ ${t.done}`
                      ) : (
                        <>
                          <Spinner /> {t.sending}
                        </>
                      )}
                    </span>
                    <span>
                      {t.progress.replace("{sent}", num(b.sent)).replace("{total}", num(b.total))}
                    </span>
                    {b.failed > 0 && (
                      <span className="text-danger">{t.failed.replace("{n}", num(b.failed))}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Container>
  );
}
