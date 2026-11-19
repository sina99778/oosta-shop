"use client";

import { useEffect } from "react";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { useApi } from "@/lib/use-api";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./admin.module.css";

type Copy = Dictionary["admin"]["bluStatus"];
type State = Exclude<keyof Copy, "title" | "preview" | "lastCheck" | "refresh" | "loading">;
type Report = { state: State | "disabled"; checkedAt: string | null };

export function BluStatusCard({
  locale,
  copy,
  token,
}: {
  locale: Locale;
  copy: Copy;
  token: string | null;
}) {
  const { data, loading, error, refetch } = useApi<Report>(
    token ? "/admin/blu/status" : null,
    token ?? undefined,
  );

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [token, refetch]);

  if (!token || data?.state === "disabled") return null;
  const state = loading ? "loading" : error ? "unavailable" : (data?.state ?? "waiting");
  const warning = ["review", "enrollmentRequired", "unavailable", "stale"].includes(state);

  return (
    <section className={styles.bluHealth} data-warning={warning}>
      <span className={styles.healthDot} aria-hidden="true" />
      <div role="status">
        <h2>{copy.title}</h2>
        <p>{copy[state]}</p>
        {data?.checkedAt && (
          <small>
            {copy.lastCheck}{" "}
            <time dateTime={data.checkedAt}>{formatDate(data.checkedAt, locale)}</time>
          </small>
        )}
      </div>
      <button type="button" className={styles.quietButton} disabled={loading} onClick={refetch}>
        {copy.refresh}
      </button>
    </section>
  );
}
