"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import styles from "@/components/status-page.module.css";

export default function StoreError({ reset }: { reset: () => void }) {
  const { locale } = useParams();
  const fa = locale !== "en";
  return (
    <section className={styles.plain} aria-labelledby="store-error-title">
      <span className={styles.warn} aria-hidden="true">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </span>
      <h1 id="store-error-title">{fa ? "خطایی رخ داد." : "Something went wrong."}</h1>
      <p role="alert">
        {fa
          ? "ارتباط با فروشگاه برقرار نشد. لطفاً دوباره تلاش کنید؛ اگر ادامه داشت به پشتیبانی خبر بده."
          : "The store is temporarily unavailable. Please try again, and tell support if it keeps happening."}
      </p>
      <Button onClick={reset}>{fa ? "تلاش دوباره" : "Try again"}</Button>
    </section>
  );
}
