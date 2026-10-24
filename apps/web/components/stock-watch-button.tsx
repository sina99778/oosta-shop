"use client";

// "Notify me when it's back" for a sold-out product. The notice arrives in the
// header bell when new stock is added.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";

export function StockWatchButton({
  productId,
  locale,
  labels,
}: {
  productId: string;
  locale: Locale;
  labels: { watch: string; watching: string; watchHint: string; watchLogin: string };
}) {
  const { user, token } = useAuth();
  const pathname = usePathname();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ watching: boolean }>(`/notifications/watches/${productId}`, token)
      .then((d) => setWatching(d.watching))
      .catch(() => setWatching(false));
  }, [productId, token]);

  const box = "mt-3 rounded-[12px] border border-dashed border-border bg-surface/60 p-4";

  if (!user) {
    return (
      <div className={box}>
        <p className="text-sm text-muted">{labels.watchHint}</p>
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(pathname)}`}
          className="mt-2 inline-flex text-sm font-bold text-primary hover:underline"
        >
          {labels.watchLogin}
        </Link>
      </div>
    );
  }

  async function toggle() {
    setBusy(true);
    try {
      const d = watching
        ? await api.del<{ watching: boolean }>(`/notifications/watches/${productId}`, token!)
        : await api.post<{ watching: boolean }>(
            `/notifications/watches/${productId}`,
            undefined,
            token!,
          );
      setWatching(d.watching);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={box}>
      <p className="text-sm text-muted">{labels.watchHint}</p>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || watching === null}
        aria-pressed={watching ?? false}
        className={
          watching
            ? "mt-3 inline-flex h-11 items-center gap-2 rounded-[10px] border border-primary px-4 text-sm font-bold text-primary disabled:opacity-60"
            : "mt-3 inline-flex h-11 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-bold text-[#f3eee4] transition-opacity hover:opacity-90 disabled:opacity-60"
        }
      >
        {busy ? <Spinner /> : watching ? `✓ ${labels.watching}` : labels.watch}
      </button>
    </div>
  );
}
