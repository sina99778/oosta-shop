"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import styles from "@/components/status-page.module.css";

// Branded 404 inside the storefront layout; the locale comes from the route segment.
export default function NotFound() {
  const { locale } = useParams();
  const fa = locale !== "en";
  const base = fa ? "/fa" : "/en";
  return (
    <section className={styles.stage} aria-labelledby="not-found-title">
      <div className={styles.inner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.art}
          src="/brand/oosta-hero-v2-320.webp"
          width={320}
          height={320}
          alt=""
        />
        <div className={styles.copy}>
          <span className={styles.code} aria-hidden="true">
            {fa ? "۴۰۴" : "404"}
          </span>
          <h1 id="not-found-title">{fa ? "این صفحه پیدا نشد" : "This page wasn’t found"}</h1>
          <p>
            {fa
              ? "حتی استاد هم گاهی راه را گم می‌کند. شاید پیوند قدیمی است یا محصول دیگر در دسترس نیست."
              : "Even the master loses his way sometimes. The link may be old, or the product is no longer available."}
          </p>
          <form role="search" action={`${base}/products`} method="get" className={styles.search}>
            <label className="sr-only" htmlFor="not-found-search">
              {fa ? "نام محصول" : "Product name"}
            </label>
            <input
              id="not-found-search"
              name="q"
              type="search"
              dir="auto"
              maxLength={100}
              placeholder={
                fa ? "نام ابزار یا اشتراک را جست‌وجو کن" : "Search for a tool or subscription"
              }
            />
            <Button type="submit">{fa ? "جست‌وجو" : "Search"}</Button>
          </form>
          <div className={styles.actions}>
            <Link
              prefetch={false}
              href={base}
              className={`oosta-button inline-flex items-center text-sm ${styles.primary}`}
            >
              {fa ? "بازگشت به خانه" : "Back to home"}
            </Link>
            <Link
              prefetch={false}
              href={`${base}/blog`}
              className={`oosta-button inline-flex items-center text-sm ${styles.ghost}`}
            >
              {fa ? "مجلهٔ اوستا" : "Oosta journal"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
