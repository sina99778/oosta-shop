"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import styles from "./auth.module.css";

export function PasswordInput({
  locale,
  label,
  ...input
}: Omit<ComponentProps<typeof Input>, "type"> & { id: string; locale: Locale; label: string }) {
  const [visible, setVisible] = useState(false);
  const action = locale === "fa" ? "نمایش" : "Show";
  return (
    <div className={styles.passwordWrap}>
      <Input {...input} type={visible ? "text" : "password"} />
      <button
        type="button"
        className={styles.reveal}
        onClick={() => setVisible((value) => !value)}
        aria-label={`${action} ${label}`}
        aria-controls={input.id}
        aria-pressed={visible}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
