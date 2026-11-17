"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import styles from "./site-chrome.module.css";

export function LocaleSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  const next = current === "fa" ? "en" : "fa";
  const label = current === "fa" ? "تغییر زبان به انگلیسی" : "Switch to Persian";

  return (
    <button
      type="button"
      className={`oosta-button ${styles.tool}`}
      data-button-variant="outline"
      title={label}
      aria-label={label}
      onClick={() => {
        const segments = pathname.split("/");
        segments[1] = next;
        router.push(segments.join("/") + window.location.search + window.location.hash);
      }}
    >
      <span lang={next}>{next === "en" ? "EN" : "فا"}</span>
    </button>
  );
}
