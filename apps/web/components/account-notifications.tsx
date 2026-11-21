"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { safeReturnPath } from "@/lib/navigation";
import { notifyNotificationsChanged } from "@/lib/notification-events";
import { useApi } from "@/lib/use-api";
import type { Locale } from "@/lib/i18n";
import styles from "./account.module.css";

type Notice = {
  id: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

function noticePath(href: string) {
  const path = safeReturnPath(href, "");
  return /^\/(?:fa|en)\/(?:products\/|dashboard(?:\/|$))/.test(path) ? path : null;
}

export function AccountNotifications({ locale, token }: { locale: Locale; token: string }) {
  const fa = locale === "fa";
  const { data, loading, error, refetch } = useApi<{
    notifications: Notice[];
    unreadCount: number;
  }>("/auth/notifications", token);
  const [busy, setBusy] = useState(false);
  const [markError, setMarkError] = useState("");
  const pending = useRef(false);
  const unreadCount = data?.unreadCount ?? 0;
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const interval = setInterval(refreshVisible, 60_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refetch]);

  async function markRead(id?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMarkError("");
    try {
      await api.patch("/auth/notifications/read", id ? { id } : {}, token);
      refetch();
      notifyNotificationsChanged();
    } catch {
      setMarkError(
        fa
          ? "وضعیت اعلان به‌روز نشد. دوباره تلاش کن."
          : "Could not update the alert. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.panel} mt-4`} aria-labelledby="account-notifications-title">
      <div className={styles.notificationHeading}>
        <h2 id="account-notifications-title">{fa ? "اعلان‌های حساب" : "Account notifications"}</h2>
        {!error && unreadCount > 0 && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void markRead()}>
            {fa ? "همه خوانده شد" : "Mark all as read"}
          </Button>
        )}
      </div>
      {loading ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {fa ? "در حال دریافت اعلان‌ها…" : "Loading notifications…"}
        </p>
      ) : error ? (
        <QueryError
          message={fa ? "اعلان‌ها در دسترس نیستند." : "Notifications are unavailable."}
          onRetry={refetch}
        />
      ) : data?.notifications.length ? (
        <ul className={styles.notificationList}>
          {data.notifications.map((notice) => {
            const href = noticePath(notice.href);
            return (
              <li
                key={notice.id}
                className={styles.notificationRow}
                data-unread={!notice.readAt || undefined}
              >
                <div className="min-w-0">
                  <div className={styles.notificationHeading}>
                    <h3 className="font-bold">
                      <bdi>{notice.title}</bdi>
                    </h3>
                    {!notice.readAt && (
                      <span className="text-xs font-semibold text-primary">
                        {fa ? "خوانده‌نشده" : "Unread"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm leading-7 text-muted">
                    <bdi>{notice.body}</bdi>
                  </p>
                  <time className="text-xs text-muted" dateTime={notice.createdAt}>
                    {formatDate(notice.createdAt, locale)}
                  </time>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {href && (
                    <Link prefetch={false} href={href} className={styles.action}>
                      {fa ? "مشاهده" : "View"}
                    </Link>
                  )}
                  {!notice.readAt && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void markRead(notice.id)}
                    >
                      {fa ? "خوانده شد" : "Mark as read"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {fa ? "هنوز اعلانی نداری." : "You have no notifications yet."}
        </p>
      )}
      {markError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {markError}
        </p>
      )}
    </section>
  );
}
