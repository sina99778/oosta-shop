"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import styles from "./product-detail.module.css";

const mobileViewport = "(max-width: 55.999rem)";

export type ProductPurchaseSummary = {
  label: string;
  price: ReactNode;
};

export function ProductPurchaseAction({
  children,
  feedback,
  locale,
  summary,
}: {
  children: ReactNode;
  feedback?: ReactNode;
  locale: Locale;
  summary?: ProductPurchaseSummary;
}) {
  const control = useRef<HTMLDivElement>(null);
  const [pastAction, setPastAction] = useState(false);
  const enabled = Boolean(summary);

  useEffect(() => {
    const target = control.current;
    if (!enabled || !target || typeof window.IntersectionObserver !== "function") return;

    const media = window.matchMedia(mobileViewport);
    const observer = new window.IntersectionObserver(([entry]) => {
      // A button below the initial viewport hasn't been scrolled past.
      setPastAction(
        media.matches &&
          !entry.isIntersecting &&
          entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0),
      );
    });
    const onViewportChange = () => {
      if (media.matches) observer.observe(target);
      else {
        observer.disconnect();
        setPastAction(false);
      }
    };

    if (media.matches) observer.observe(target);
    media.addEventListener("change", onViewportChange);
    return () => {
      media.removeEventListener("change", onViewportChange);
      observer.disconnect();
    };
  }, [enabled]);

  const sticky = summary && pastAction;

  return (
    <>
      <div className="mt-4 grid gap-2">
        <div ref={control} className="grid">
          {children}
        </div>
        {!sticky && feedback}
      </div>
      {sticky && (
        <div
          className={styles.mobileBuyBar}
          role="region"
          aria-label={locale === "fa" ? "اقدام برای پلن انتخاب‌شده" : "Selected plan action"}
        >
          <div className={styles.mobileBuyRow}>
            <div className={styles.mobileBuySummary}>
              <bdi className={styles.mobileBuyTitle}>{summary.label}</bdi>
              <div>{summary.price}</div>
            </div>
            {children}
          </div>
          {feedback && <div className={styles.mobileBuyFeedback}>{feedback}</div>}
        </div>
      )}
    </>
  );
}
