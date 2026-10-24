"use client";

// Connect this account to the customer Telegram bot. The link is single-use and
// expires in 30 minutes; while the buyer is in Telegram the card polls and flips
// to "connected" on its own. Hidden when the bot isn't configured.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Status = {
  enabled: boolean;
  link: { username: string | null; linkedAt: string; newsOptIn: boolean } | null;
};

const POLL_MS = 4000;

export function TelegramConnect({
  locale,
  dict,
  compact = false,
}: {
  locale: Locale;
  dict: Dictionary;
  compact?: boolean;
}) {
  const { token } = useAuth();
  const t = dict.telegram;
  const [status, setStatus] = useState<Status | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api
      .get<Status>("/telegram", token)
      .then((s) => {
        setStatus(s);
        if (s.link) setPendingUrl(null);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Waiting for the buyer to press Start in Telegram.
  useEffect(() => {
    if (!pendingUrl) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [pendingUrl, load]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ url: string }>("/telegram/link", undefined, token ?? undefined);
      // Shown as a link the buyer taps: a window opened after an await is blocked.
      setPendingUrl(res.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function toggleNews(newsOptIn: boolean) {
    const res = await api.patch<{ link: Status["link"] }>(
      "/telegram",
      { newsOptIn },
      token ?? undefined,
    );
    setStatus((s) => (s ? { ...s, link: res.link } : s));
  }

  async function unlink() {
    if (!window.confirm(t.confirmUnlink)) return;
    await api.del("/telegram", token ?? undefined);
    load();
  }

  if (!status?.enabled) return null;
  const link = status.link;

  // Dashboard nudge: only while not connected.
  if (compact) {
    if (link) return null;
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[14px] border border-dashed border-border bg-card p-4">
        <TelegramMark />
        <p className="min-w-0 flex-1 basis-56 text-sm">
          <strong>{t.nudgeTitle}</strong>
          <span className="block text-muted">{t.nudgeBody}</span>
        </p>
        <a
          href={`/${locale}/dashboard/account#telegram`}
          className="inline-flex h-10 items-center rounded-[10px] bg-ink px-4 text-sm font-bold text-[#f3eee4] hover:opacity-90"
        >
          {t.connect}
        </a>
      </div>
    );
  }

  return (
    <section
      id="telegram"
      aria-labelledby="telegram-title"
      className="mt-6 scroll-mt-24 rounded-[14px] border border-border bg-card p-5 shadow-card"
    >
      <div className="flex items-center gap-3">
        <TelegramMark />
        <div>
          <h2 id="telegram-title" className="font-extrabold">
            {t.title}
          </h2>
          <p className="text-sm text-muted">{link ? t.connectedSubtitle : t.subtitle}</p>
        </div>
      </div>

      {link ? (
        <div className="mt-4 space-y-3 text-sm">
          <p>
            {t.connectedAs}{" "}
            <strong dir="ltr">{link.username ? `@${link.username}` : t.unnamed}</strong>
            <span className="text-muted"> · {formatDate(link.linkedAt, locale)}</span>
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={link.newsOptIn}
              onChange={(e) => void toggleNews(e.target.checked)}
              className="size-4 accent-[var(--c-primary)]"
            />
            {t.news}
          </label>
          <Button variant="outline" size="sm" onClick={unlink}>
            {t.unlink}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <ul className="space-y-1.5 text-sm text-muted">
            {[t.perk1, t.perk2, t.perk3, t.perk4].map((p) => (
              <li key={p} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rotate-45 bg-primary" />
                {p}
              </li>
            ))}
          </ul>
          {pendingUrl ? (
            <div className="space-y-3">
              <a
                href={pendingUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#2a9fd8] px-5 text-sm font-bold text-white hover:opacity-90"
              >
                {t.openBot}
              </a>
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> {t.waiting}
              </p>
            </div>
          ) : (
            <Button onClick={connect} disabled={busy}>
              {busy ? <Spinner /> : t.connect}
            </Button>
          )}
          <p className="text-xs text-muted">{t.linkNote}</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function TelegramMark() {
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full bg-[#2a9fd8] text-white"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.5 4.2 2.9 11.4c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.8-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.8-1.3-1.5zM8.9 14.1l9.6-6c.5-.3.9-.1.5.2l-8 7.3-.3 3.3z" />
      </svg>
    </span>
  );
}
