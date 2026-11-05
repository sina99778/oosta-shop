"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QueryError } from "@/components/query-error";
import { useApi } from "@/lib/use-api";
import { ProductCard } from "@/components/product-card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import type { Category, Paginated, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./shop.module.css";

export function ProductsBrowser({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const params = useSearchParams();
  const category = params.get("category");
  const term = params.get("q")?.trim() || "";
  const sort = params.get("sort") || "newest";
  const [page, setPage] = useState(1);
  const fa = locale === "fa";
  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [category, term, sort]);
  const query = new URLSearchParams({ page: String(page), pageSize: "12", sort });
  if (category) query.set("category", category);
  if (term) query.set("q", term);
  const products = useApi<Paginated<ProductSummary>>(`/products?${query.toString()}`);
  const categories = useApi<{ categories: Category[] }>("/categories");
  const labels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
    featured: dict.product.featured,
    off: dict.product.off,
    left: dict.product.left,
  };
  function categoryHref(slug?: string) {
    const next = new URLSearchParams();
    if (slug) next.set("category", slug);
    if (term) next.set("q", term);
    if (sort !== "newest") next.set("sort", sort);
    return `/${locale}/products${next.size ? `?${next}` : ""}`;
  }
  const categoryLabels: Record<string, string> = fa
    ? {
        "ai-accounts": "هوش مصنوعی",
        "software-licenses": "نرم‌افزار و لایسنس",
        "gift-cards": "گیفت‌کارت",
      }
    : {
        "ai-accounts": "AI tools",
        "software-licenses": "Software & licenses",
        "gift-cards": "Gift cards",
      };
  return (
    <div className={styles.shop}>
      <section className={styles.intro} aria-labelledby="shop-title">
        <div className={styles.introInner}>
          <div className={styles.breadcrumb}>
            <Link href={`/${locale}`}>{dict.nav.home}</Link>
            <span>/</span>
            <span>{dict.products.title}</span>
          </div>
          <span className={styles.kicker}>
            {fa ? "ابزار از ما، انتخاب با تو" : "Our tools. Your choice."}
          </span>
          <div className={styles.introRow}>
            <div>
              <h1 id="shop-title">
                {fa ? (
                  <>
                    قدم بعدی‌ات را
                    <br />
                    <em>مجهز بردار.</em>
                  </>
                ) : (
                  <>
                    Make room
                    <br />
                    <em>for your next idea.</em>
                  </>
                )}
              </h1>
              <p>
                {fa
                  ? "اشتراک‌ها، نرم‌افزارها و اعتبار دیجیتال؛ نوع دسترسی و شرایط هر پلن را مقایسه کن و مناسب کارت انتخاب کن."
                  : "Subscriptions, software and digital credit. Compare access types and plan terms to find what fits your work."}
              </p>
            </div>
            <span className={styles.indexLabel} aria-hidden="true">
              OOSTA
              <br />
              TOOL INDEX <b>↙</b>
            </span>
          </div>
        </div>
      </section>
      <div className={styles.content}>
        <form
          key={`${term}:${sort}:${category}`}
          action={`/${locale}/products`}
          method="get"
          className={styles.searchForm}
        >
          {category && <input type="hidden" name="category" value={category} />}
          <label className={styles.searchLabel}>
            {fa ? "دنبال چه ابزاری می‌گردی؟" : "What are you looking for?"}
            <input
              type="search"
              name="q"
              defaultValue={term}
              maxLength={100}
              placeholder={fa ? "نام محصول را بنویس…" : "Enter a product name…"}
            />
          </label>
          <label>
            {fa ? "ترتیب نمایش" : "Sort by"}
            <select name="sort" defaultValue={sort}>
              <option value="newest">{fa ? "جدیدترین" : "Newest"}</option>
              <option value="price_asc">{fa ? "قیمت: کم به زیاد" : "Price: low to high"}</option>
              <option value="price_desc">{fa ? "قیمت: زیاد به کم" : "Price: high to low"}</option>
            </select>
          </label>
          <button type="submit">
            {fa ? "پیدا کن" : "Find tools"}
            <span aria-hidden="true">↙</span>
          </button>
        </form>
        <nav
          className={styles.categories}
          aria-label={fa ? "دسته‌بندی محصولات" : "Product categories"}
        >
          <Link href={categoryHref()} aria-current={!category ? "page" : undefined}>
            {dict.common.all}
          </Link>
          {categories.data?.categories.map((c) => (
            <Link
              key={c.id}
              href={categoryHref(c.slug)}
              aria-current={category === c.slug ? "page" : undefined}
            >
              {categoryLabels[c.slug] ?? c.name}
            </Link>
          ))}
        </nav>
        <div className={styles.results} aria-live="polite">
          {products.loading
            ? dict.common.loading
            : products.data
              ? `${products.data.pagination.total.toLocaleString(fa ? "fa" : "en")} ${dict.products.results}${term ? ` · ${term}` : ""}`
              : ""}
          {(term || category || sort !== "newest") && (
            <Link href={`/${locale}/products`}>{fa ? "پاک کردن فیلترها" : "Clear filters"} ×</Link>
          )}
        </div>
        {products.loading ? (
          <div className={styles.loading}>
            <Spinner className="size-6" />
          </div>
        ) : products.error ? (
          <QueryError message={dict.common.somethingWrong} onRetry={products.refetch} />
        ) : products.data?.items.length ? (
          <>
            <div className={styles.productGrid}>
              {products.data.items.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} labels={labels} />
              ))}
            </div>
            {products.data.pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {dict.common.previous}
                </Button>
                <span>
                  {dict.common.page} {products.data.pagination.page} /{" "}
                  {products.data.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= products.data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {dict.common.next}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.empty}>
            <h2>{dict.products.empty}</h2>
            <p>
              {fa
                ? "نام کوتاه‌تری امتحان کن یا دسته‌بندی را تغییر بده."
                : "Try a shorter name or a different category."}
            </p>
            <Link href={`/${locale}/products`}>
              {fa ? "نمایش همهٔ محصولات" : "Browse all products"} ←
            </Link>
          </div>
        )}
        <aside className={styles.help}>
          <div>
            <h2>{fa ? "هنوز بین چند ابزار مرددی؟" : "Still deciding between tools?"}</h2>
            <p>
              {fa
                ? "بگو برای چه کاری نیازش داری؛ انتخاب از نیاز تو شروع می‌شود."
                : "Tell us what you want to do. The right choice starts with your needs."}
            </p>
          </div>
          <Link href={`/${locale}/support`}>
            {fa ? "راهنمایی برای انتخاب" : "Help me choose"} ↗
          </Link>
        </aside>
      </div>
    </div>
  );
}
