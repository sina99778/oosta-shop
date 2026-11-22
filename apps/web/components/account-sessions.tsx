"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import styles from "./account.module.css";

export type DeviceSession = {
  id: string;
  browser: string;
  os: string;
  ipPrefix: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

// Signed-in browsers for this account, with per-device and "all other devices" sign-out.
export function AccountSessions({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const { token, logoutAll } = useAuth();
  const router = useRouter();
  const { data, loading, error, refetch } = useApi<{
    sessions: DeviceSession[];
    currentTracked: boolean;
  }>(token ? "/auth/sessions" : null, token ?? undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const failure = (cause: unknown) =>
    cause instanceof ApiError && cause.code === "RATE_LIMITED"
      ? fa
        ? "تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید."
        : "Too many attempts. Please try again later."
      : fa
        ? "انجام نشد. دوباره تلاش کنید."
        : "That didn't work. Please try again.";

  async function revoke(session: DeviceSession) {
    if (busy || !token) return;
    setBusy(session.id);
    setMessage(null);
    try {
      await api.del(`/auth/sessions/${encodeURIComponent(session.id)}`, token);
      if (session.current) {
        router.replace(`/${locale}/login`);
        return;
      }
      setMessage({
        tone: "ok",
        text: fa ? "این دستگاه از حساب خارج شد." : "That device has been signed out.",
      });
      refetch();
    } catch (cause) {
      setMessage({ tone: "error", text: failure(cause) });
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    if (busy || !token) return;
    setBusy("others");
    setMessage(null);
    try {
      const result = await api.post<{ revoked: number }>("/auth/sessions/revoke-others", {}, token);
      setMessage({
        tone: "ok",
        text: fa
          ? `${result.revoked.toLocaleString("fa-IR")} دستگاه دیگر از حساب خارج شد.`
          : `${result.revoked} other device${result.revoked === 1 ? "" : "s"} signed out.`,
      });
      refetch();
    } catch (cause) {
      setMessage({ tone: "error", text: failure(cause) });
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    if (busy) return;
    setBusy("all");
    setMessage(null);
    try {
      await logoutAll();
      router.replace(`/${locale}/login`);
    } catch (cause) {
      setMessage({ tone: "error", text: failure(cause) });
      setBusy(null);
    }
  }

  const sessions = data?.sessions ?? [];
  const others = sessions.filter((session) => !session.current).length;

  return (
    <section className={`${styles.panel} ${styles.sessionPanel}`} aria-labelledby="sessions-title">
      <div className={styles.sessionsHead}>
        <div>
          <h2 id="sessions-title">{fa ? "دستگاه‌های واردشده" : "Signed-in devices"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fa
              ? "اگر دستگاهی را نمی‌شناسی، همین‌جا از حساب خارجش کن و بعد رمز را عوض کن."
              : "If you don’t recognise a device, sign it out here and then change your password."}
          </p>
        </div>
        {others > 0 && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void revokeOthers()}
            disabled={busy !== null}
          >
            {busy === "others" ? <Spinner /> : null}
            {fa ? "خروج از همهٔ دستگاه‌های دیگر" : "Sign out all other devices"}
          </Button>
        )}
      </div>
      {loading && !data ? (
        <p className="mt-4 text-sm text-muted">{fa ? "در حال بارگذاری…" : "Loading…"}</p>
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {fa ? "فهرست دستگاه‌ها دریافت نشد." : "Couldn't load your devices."}{" "}
          <button type="button" className="underline" onClick={refetch}>
            {fa ? "تلاش دوباره" : "Retry"}
          </button>
        </p>
      ) : (
        <ul className={styles.devices}>
          {sessions.map((session) => (
            <li key={session.id} data-current={session.current}>
              <span className={styles.deviceIcon} aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
                </svg>
              </span>
              <div className={styles.deviceText}>
                <strong dir="ltr">
                  {session.browser} · {session.os}
                </strong>
                <small>
                  {[
                    session.ipPrefix ? (
                      <bdi key="ip" dir="ltr">
                        {session.ipPrefix}
                      </bdi>
                    ) : null,
                    <span key="seen">
                      {fa ? "آخرین فعالیت " : "Last active "}
                      {formatDate(session.lastSeenAt, locale)}
                    </span>,
                  ].filter(Boolean)}
                </small>
              </div>
              {session.current ? (
                <span className={styles.currentDevice}>{fa ? "این دستگاه" : "This device"}</span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void revoke(session)}
                  disabled={busy !== null}
                  aria-label={
                    fa
                      ? `خروج ${session.browser} روی ${session.os}`
                      : `Sign out ${session.browser} on ${session.os}`
                  }
                >
                  {busy === session.id ? <Spinner /> : null}
                  {fa ? "خروج" : "Sign out"}
                </Button>
              )}
            </li>
          ))}
          {data && !data.currentTracked && (
            <li data-current="true">
              <span className={styles.deviceIcon} aria-hidden="true">
                ●
              </span>
              <div className={styles.deviceText}>
                <strong>{fa ? "این دستگاه" : "This device"}</strong>
                <small>
                  {fa
                    ? "ورود قبل از به‌روزرسانی؛ با خروج از همهٔ دستگاه‌ها پایان می‌یابد."
                    : "Signed in before this update; ends with “sign out everywhere”."}
                </small>
              </div>
            </li>
          )}
        </ul>
      )}
      <div className={styles.sessionsFoot}>
        <Button
          type="button"
          variant="outline"
          onClick={() => void signOutEverywhere()}
          disabled={busy !== null}
        >
          {busy === "all" ? <Spinner /> : null}
          {fa ? "خروج از همهٔ دستگاه‌ها، حتی این یکی" : "Sign out everywhere, including here"}
        </Button>
      </div>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error" ? "mt-3 text-sm text-danger" : "mt-3 text-sm text-success"
          }
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
