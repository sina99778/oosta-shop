"use client";
import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/api";
import type { Category, ProductSummary } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import styles from "./storefront.module.css";

export function HomeCatalog({
  locale,
  products,
  categories,
  categoryLabels,
  unavailable,
}: {
  locale: Locale;
  products: ProductSummary[];
  categories: Category[];
  categoryLabels: Record<string, string>;
  unavailable: boolean;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const fa = locale === "fa";
  const filtered = products.filter((product) => !category || product.category.slug === category);
  const copy = fa
    ? {
        eyebrow: "از اینجا شروع کن",
        title: "انتخاب‌های پیش رو",
        all: "همه",
        browse: "تمام محصولات",
        from: "از",
        stock: "موجود",
        soldOut: "فعلاً ناموجود",
        action: "مشاهدهٔ پلن‌ها",
        empty: "در این بخش محصولی برای نمایش نیست.",
        unavailable: "دریافت محصولات ممکن نشد. کمی بعد دوباره تلاش کن.",
        retry: "تلاش دوباره",
        count: "محصول",
        note: "نوع دسترسی و شرایط هر پلن را پیش از خرید بررسی کن.",
      }
    : {
        eyebrow: "Start here",
        title: "Find your next tool",
        all: "All",
        browse: "Full catalog",
        from: "From",
        stock: "Available",
        soldOut: "Out of stock",
        action: "Explore plans",
        empty: "No products to show in this selection.",
        unavailable: "Products couldn't be loaded. Please try again shortly.",
        retry: "Try again",
        count: "products",
        note: "Review access type and plan terms before buying.",
      };
  return (
    <section id="home-catalog" className={styles.catalog} aria-labelledby="catalog-title">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>{copy.eyebrow}</span>
          <h2 id="catalog-title">
            {copy.title}
            <span className={styles.productCount}>
              {new Intl.NumberFormat(fa ? "fa" : "en").format(products.length)}
            </span>
          </h2>
        </div>
        <Link href={`/${locale}/products`} className={styles.textLink}>
          {copy.browse}
          <span aria-hidden="true">{fa ? "↖" : "↗"}</span>
        </Link>
      </div>
      <div
        className={styles.filters}
        role="group"
        aria-label={fa ? "فیلتر دسته‌بندی" : "Filter by category"}
      >
        <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>
          {copy.all}
        </button>
        {categories.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={category === item.slug}
            onClick={() => setCategory(item.slug)}
          >
            {categoryLabels[item.slug] ?? item.name}
          </button>
        ))}
      </div>
      <div aria-live="polite" className={styles.resultStatus}>
        {category ? `${filtered.length.toLocaleString(fa ? "fa" : "en")} ${copy.count}` : copy.note}
      </div>
      {filtered.length > 0 ? (
        <ol className={styles.products}>
          {filtered.map((product, i) => {
            const image = productImageUrl(product);
            return (
              <li key={product.id} className={styles.productRow}>
                <span className={styles.rowNumber} aria-hidden="true">
                  {new Intl.NumberFormat(fa ? "fa" : "en", { minimumIntegerDigits: 2 }).format(
                    i + 1,
                  )}
                </span>
                <div className={styles.productIdentity}>
                  <span className={styles.productMonogram} aria-hidden="true">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" loading="lazy" />
                    ) : (
                      <span>{product.name.trim().slice(0, 2).toUpperCase()}</span>
                    )}
                  </span>
                  <div>
                    <p className={styles.productCategory}>
                      {categoryLabels[product.category.slug] ?? product.category.name}
                    </p>
                    <h3>
                      <Link href={`/${locale}/products/${product.slug}`}>
                        <bdi>{product.name}</bdi>
                      </Link>
                    </h3>
                    <span className={styles.productType}>
                      {fa
                        ? {
                            ACCOUNT: "اشتراک و حساب کاربری",
                            LICENSE: "لایسنس نرم‌افزار",
                            GIFTCARD: "گیفت‌کارت",
                          }[product.type]
                        : {
                            ACCOUNT: "Account subscription",
                            LICENSE: "Software license",
                            GIFTCARD: "Gift card",
                          }[product.type]}
                    </span>
                  </div>
                </div>
                <span className={styles.stock} data-available={product.inStock}>
                  <i />
                  {product.inStock ? copy.stock : copy.soldOut}
                </span>
                <div className={styles.purchase}>
                  <p>
                    {product.priceFrom !== null ? (
                      <>
                        <span>{copy.from} </span>
                        <bdi>{formatPrice(product.priceFrom, product.currency, locale)}</bdi>
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                  <Link
                    href={`/${locale}/products/${product.slug}`}
                    aria-label={`${copy.action} · ${product.name}`}
                    className={styles.planLink}
                  >
                    {copy.action}
                    <span aria-hidden="true">{fa ? "←" : "→"}</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.empty}>
          <p>{unavailable ? copy.unavailable : copy.empty}</p>
          {unavailable ? (
            <button
              type="button"
              className={styles.planLink}
              onClick={() => window.location.reload()}
            >
              {copy.retry}
            </button>
          ) : (
            <Link
              className={styles.textLink}
              href={`/${locale}/products${category ? `?category=${encodeURIComponent(category)}` : ""}`}
            >
              {copy.browse}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
