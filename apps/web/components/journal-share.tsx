"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import styles from "./journal.module.css";

/** Share an article on Telegram or copy its public link. Nothing is sent until the reader acts. */
export function JournalShare({
  url,
  title,
  locale,
}: {
  url: string;
  title: string;
  locale: Locale;
}) {
  const fa = locale === "fa";
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const share = `https://t.me/share/url?${new URLSearchParams({ url, text: title })}`;
  return (
    <div className={styles.share}>
      <a href={share} target="_blank" rel="noopener noreferrer" className={styles.shareButton}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m21 4-18 7 6.5 2.5L18 7l-6.5 8.5L18 20l3-16Z" />
        </svg>
        {fa ? "اشتراک در تلگرام" : "Share on Telegram"}
      </a>
      <button
        type="button"
        className={styles.shareButton}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setStatus("copied");
          } catch {
            setStatus("failed");
          }
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </svg>
        {fa ? "کپی لینک" : "Copy link"}
      </button>
      <p role="status" className={styles.shareStatus}>
        {status === "copied"
          ? fa
            ? "لینک کپی شد."
            : "Link copied."
          : status === "failed"
            ? fa
              ? "کپی نشد؛ لینک را از نوار آدرس بردار."
              : "Copy failed. Use the address bar instead."
            : ""}
      </p>
    </div>
  );
}
