"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useApi } from "@/lib/use-api";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function StockAlertButton({
  planId,
  locale,
  loginPath,
  token,
}: {
  planId: string;
  locale: Locale;
  loginPath: string;
  token: string | null;
}) {
  const path = `/auth/stock-alerts/${encodeURIComponent(planId)}`;
  const fa = locale === "fa";
  const label = fa ? "موجود شد خبرم کن" : "Notify me when available";
  const { data, loading, error, refetch } = useApi<{ active: boolean }>(
    token ? path : null,
    token ?? undefined,
  );
  const [changed, setChanged] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const active = changed ?? data?.active;

  async function toggle() {
    if (!token || pending.current || active === undefined) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (active) await api.del(path, token);
      else await api.post(path, { locale }, token);
      setChanged(!active);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === "STOCK_ALERT_NOT_NEEDED") {
        setMessage(
          fa
            ? "این پلن دوباره موجود شده است. صفحه را تازه کن."
            : "This plan is available again. Refresh the page.",
        );
      } else if (code === "STOCK_ALERT_LIMIT") {
        setMessage(fa ? "حداکثر ۲۰ پلن را می‌توانی دنبال کنی." : "You can watch up to 20 plans.");
      } else {
        setMessage(
          apiErrorMessage(
            error,
            locale,
            fa
              ? "تغییر اعلان ثبت نشد. دوباره تلاش کن."
              : "Could not update the alert. Please try again.",
          ),
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!token)
    return (
      <Link
        href={loginPath}
        className="oosta-button mt-4 flex min-h-11 w-full items-center justify-center px-4 text-sm"
        data-button-variant="outline"
      >
        {label}
      </Link>
    );

  return (
    <div className="mt-4 grid gap-2">
      {error && active === undefined ? (
        <Button type="button" variant="outline" onClick={refetch}>
          {fa ? "بررسی دوبارهٔ اعلان موجودی" : "Retry checking stock alert"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => void toggle()}
          disabled={busy || loading || active === undefined}
          aria-busy={busy || loading}
        >
          {active ? (fa ? "لغو اعلان موجودی" : "Cancel stock alert") : label}
        </Button>
      )}
      <p role="status" className="empty:hidden text-sm text-muted">
        {active
          ? fa
            ? "وقتی این پلن موجود شود، در صندوق پیام خبر می‌دهیم."
            : "We’ll notify you in your inbox when this plan is back."
          : changed === false
            ? fa
              ? "اعلان موجودی لغو شد."
              : "Stock alert canceled."
            : ""}
      </p>
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
