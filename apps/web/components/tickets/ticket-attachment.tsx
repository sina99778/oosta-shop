"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import styles from "../account.module.css";

export const TICKET_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const TICKET_IMAGE_MAX = 5 * 1024 * 1024;

/** Client-side mirror of the API rule: one JPG, PNG or WebP screenshot up to 5 MB. */
export function ticketImageError(file: File | null, fa: boolean): string | null {
  if (!file) return null;
  if (!TICKET_IMAGE_TYPES.includes(file.type))
    return fa ? "فقط تصویر JPG، PNG یا WebP بفرست." : "Attach a JPG, PNG or WebP image.";
  if (file.size > TICKET_IMAGE_MAX)
    return fa ? "حجم تصویر باید حداکثر ۵ مگابایت باشد." : "The image must be 5 MB or smaller.";
  if (file.size === 0) return fa ? "این فایل خالی است." : "This file is empty.";
  return null;
}

export function formatBytes(size: number, fa: boolean): string {
  const kb = Math.max(1, Math.round(size / 1024));
  const text = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  return fa ? text.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : text;
}

// Screenshots are private: the bytes are fetched with the session and shown from an
// object URL, so the image never gets a public or cacheable address.
export function TicketAttachment({
  path,
  token,
  name,
  size,
  locale,
}: {
  path: string;
  token: string;
  name: string | null;
  size: number;
  locale: Locale;
}) {
  const fa = locale === "fa";
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    api
      .blob(path, token)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, token]);

  const label = name ?? (fa ? "تصویر پیوست" : "Attached image");
  return (
    <figure className={styles.attachment}>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} />
        </a>
      ) : (
        <span className={styles.attachmentPlaceholder} role={failed ? "alert" : "status"}>
          {failed
            ? fa
              ? "تصویر بارگذاری نشد."
              : "The image couldn't be loaded."
            : fa
              ? "در حال بارگذاری تصویر…"
              : "Loading image…"}
        </span>
      )}
      <figcaption>
        <bdi>{label}</bdi> · {formatBytes(size, fa)}
      </figcaption>
    </figure>
  );
}

export function ImagePicker({
  file,
  onChange,
  disabled,
  locale,
  id,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  locale: Locale;
  id: string;
}) {
  const fa = locale === "fa";
  return (
    <div className={styles.picker}>
      <label
        htmlFor={id}
        className="oosta-button inline-flex h-9 items-center gap-2 px-3.5 text-sm"
        data-button-variant="ghost"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        {file ? (fa ? "تغییر تصویر" : "Change image") : fa ? "پیوست تصویر" : "Attach image"}
      </label>
      <input
        id={id}
        type="file"
        accept={TICKET_IMAGE_TYPES.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {file && (
        <span className={styles.pickedFile}>
          <bdi>{file.name}</bdi> · {formatBytes(file.size, fa)}
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={fa ? "حذف تصویر" : "Remove image"}
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}
