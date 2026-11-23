import Link from "next/link";
import { ProductSearchForm } from "./product-search-form";
import { fetchJson } from "@/lib/seo";
import { getSiteSettings, telegramSupportHref } from "@/lib/settings";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import type { Category, Paginated, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./shop.module.css";

const catalogSorts = [
  "recommended",
  "available",
  "popular",
  "bestselling",
  "newest",
  "price_asc",
  "price_desc",
];

export type CatalogParams = Record<string, string | string[] | undefined>;

export function readCatalogFilters(params: CatalogParams) {
  const category =
    typeof params.category === "string" && /^[a-z0-9-]{1,100}$/.test(params.category)
      ? params.category
      : "";
  const term = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const sort =
    typeof params.sort === "string" && catalogSorts.includes(params.sort)
      ? params.sort
      : "recommended";
  const page =
    typeof params.page === "string" && /^[1-9][0-9]{0,5}$/.test(params.page)
      ? Number(params.page)
      : 1;
  return { category, term, sort, page };
}

const accessValues = ["PERSONAL", "SHARED", "TEAM"] as const;
const deliveryValues = ["AUTOMATIC", "MANUAL"] as const;

/** Optional catalog filters added by the storefront redesign; unknown values are ignored. */
export function readExtraFilters(params: CatalogParams) {
  const access = accessValues.find((value) => value === params.access) ?? "";
  const delivery = deliveryValues.find((value) => value === params.delivery) ?? "";
  const inStock = params.inStock === "true";
  return { access, delivery, inStock };
}

export async function ProductsBrowser({
  locale,
  dict,
  params,
}: {
  locale: Locale;
  dict: Dictionary;
  params: CatalogParams;
}) {
  const { category, term, sort, page } = readCatalogFilters(params);
  const { access, delivery, inStock } = readExtraFilters(params);
  const fa = locale === "fa";
  const query = new URLSearchParams({ page: String(page), pageSize: "12", sort });
  if (category) query.set("category", category);
  if (term) query.set("q", term);
  if (access) query.set("access", access);
  if (delivery) query.set("delivery", delivery);
  if (inStock) query.set("inStock", "true");
  const [products, categories, settings] = await Promise.all([
    fetchJson<Paginated<ProductSummary>>(`/products?${query}`, 0),
    fetchJson<{ categories: Category[] }>("/categories"),
    getSiteSettings(),
  ]);
  const labels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
    featured: dict.product.featured,
    off: dict.product.off,
    left: dict.product.left,
  };
  function catalogHref(slug = category, targetPage = 1) {
    const next = new URLSearchParams();
    if (slug) next.set("category", slug);
    if (term) next.set("q", term);
    if (sort !== "recommended") next.set("sort", sort);
    if (access) next.set("access", access);
    if (delivery) next.set("delivery", delivery);
    if (inStock) next.set("inStock", "true");
    if (targetPage > 1) next.set("page", String(targetPage));
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
  const filtered = Boolean(access || delivery || inStock);
  const accessOptions: [string, string][] = [
    ["", fa ? "همه" : "Any"],
    ["PERSONAL", fa ? "اختصاصی" : "Individual"],
    ["SHARED", fa ? "اشتراکی" : "Shared"],
    ["TEAM", fa ? "تیمی" : "Team"],
  ];
  const deliveryOptions: [string, string][] = [
    ["", fa ? "همه" : "Any"],
    ["AUTOMATIC", fa ? "خودکار و آنی" : "Automatic"],
    ["MANUAL", fa ? "دستی" : "Manual"],
  ];
  return (
    <div className={styles.shop}>
      <section className={styles.intro} aria-labelledby="shop-title">
        <div className={styles.introInner}>
          <div className={styles.breadcrumb}>
            <Link prefetch={false} href={`/${locale}`}>
              {dict.nav.home}
            </Link>
            <span>/</span>
            <span>{dict.products.title}</span>
          </div>
          <h1 id="shop-title">{fa ? "اشتراک‌ها و ابزارها" : "Subscriptions and tools"}</h1>
          <p className={styles.introLead}>
            {fa
              ? "بگو برای چه کاری نیازش داری؛ پلن‌ها را از نظر قیمت، مدت، ضمانت و شیوهٔ تحویل کنار هم ببین."
              : "Start from what you need, then compare plans by price, duration, warranty and delivery."}
          </p>
          <ProductSearchForm locale={locale} className={styles.searchForm}>
            {category && <input type="hidden" name="category" value={category} />}
            {access && <input type="hidden" name="access" value={access} />}
            {delivery && <input type="hidden" name="delivery" value={delivery} />}
            {inStock && <input type="hidden" name="inStock" value="true" />}
            <label className={styles.searchLabel}>
              {fa ? "جست‌وجوی محصول" : "Search products"}
              <input
                type="search"
                name="q"
                defaultValue={term}
                dir="auto"
                maxLength={100}
                placeholder={fa ? "نام محصول را بنویس…" : "Enter a product name…"}
              />
            </label>
            <label>
              {fa ? "ترتیب نمایش" : "Sort by"}
              <select name="sort" defaultValue={sort}>
                <option value="recommended">{fa ? "پیشنهاد اوستا" : "Oosta picks"}</option>
                <option value="available">{fa ? "موجودها اول" : "Available first"}</option>
                <option value="popular">{fa ? "محبوب‌ترین‌ها" : "Top rated"}</option>
                <option value="bestselling">{fa ? "پرفروش‌ترین‌ها" : "Best sellers"}</option>
                <option value="newest">{fa ? "جدیدترین" : "Newest"}</option>
                <option value="price_asc">{fa ? "قیمت: کم به زیاد" : "Price: low to high"}</option>
                <option value="price_desc">{fa ? "قیمت: زیاد به کم" : "Price: high to low"}</option>
              </select>
            </label>
            <Button type="submit" size="lg">
              {fa ? "اعمال" : "Apply"}
            </Button>
          </ProductSearchForm>
          <nav
            className={styles.categoryChips}
            aria-label={fa ? "دسته‌بندی محصولات" : "Product categories"}
          >
            <Link
              prefetch={false}
              href={catalogHref("")}
              aria-current={!category ? "page" : undefined}
            >
              {dict.common.all}
            </Link>
            {categories?.categories
              .filter((c) => c.productCount > 0 || c.slug === category)
              .map((c) => (
                <Link
                  prefetch={false}
                  key={c.id}
                  href={catalogHref(c.slug)}
                  aria-current={category === c.slug ? "page" : undefined}
                >
                  <span>{categoryLabels[c.slug] ?? c.name}</span>
                  <span className={styles.categoryCount}>
                    {c.productCount.toLocaleString(locale)}
                  </span>
                </Link>
              ))}
          </nav>
        </div>
      </section>
      <div className={styles.content}>
        <aside className={styles.sidebar} aria-labelledby="filters-title">
          <h2 id="filters-title">{fa ? "پالایش محصولات" : "Refine products"}</h2>
          <form
            method="get"
            action={`/${locale}/products`}
            className={styles.filterForm}
            aria-label={fa ? "فیلترهای پلن" : "Plan filters"}
          >
            {category && <input type="hidden" name="category" value={category} />}
            {term && <input type="hidden" name="q" value={term} />}
            {sort !== "recommended" && <input type="hidden" name="sort" value={sort} />}
            <label className={styles.stockToggle}>
              <input type="checkbox" name="inStock" value="true" defaultChecked={inStock} />
              <span>{fa ? "فقط موجودها" : "In stock only"}</span>
            </label>
            <fieldset>
              <legend>{fa ? "نوع دسترسی" : "Access type"}</legend>
              {accessOptions.map(([value, label]) => (
                <label key={value || "any"}>
                  <input
                    type="radio"
                    name="access"
                    value={value}
                    defaultChecked={access === value}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>{fa ? "شیوهٔ تحویل" : "Delivery"}</legend>
              {deliveryOptions.map(([value, label]) => (
                <label key={value || "any"}>
                  <input
                    type="radio"
                    name="delivery"
                    value={value}
                    defaultChecked={delivery === value}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" variant="soft">
              {fa ? "اعمال فیلترها" : "Apply filters"}
            </Button>
          </form>
        </aside>
        <div className={styles.main}>
          {sort.startsWith("price_") && (
            <p className="mb-4 text-sm text-muted">
              {fa
                ? "مرتب‌سازی بر اساس قیمت‌های مشخص است؛ محصولات نیازمند استعلام در انتها قرار می‌گیرند."
                : "Listed prices are sorted first. Products priced on request appear last."}
            </p>
          )}
          <div className={styles.results} aria-live="polite">
            <span>
              {products &&
                `${products.pagination.total.toLocaleString(locale)} ${dict.products.results}`}
              {products && term && (
                <>
                  {" "}
                  · <bdi>{term}</bdi>
                </>
              )}
            </span>
            {(term || category || sort !== "recommended" || filtered) && (
              <Link prefetch={false} href={`/${locale}/products`}>
                {fa ? "پاک کردن فیلترها" : "Clear filters"} ×
              </Link>
            )}
          </div>
          {!products ? (
            <div className={styles.empty}>
              <h2>{dict.common.somethingWrong}</h2>
              <a href={catalogHref(category, page)}>{dict.common.retry}</a>
            </div>
          ) : products.items.length ? (
            <>
              <div className={styles.productGrid}>
                {products.items.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    locale={locale}
                    labels={labels}
                    priority={index < 3}
                  />
                ))}
              </div>
              {products.pagination.totalPages > 1 && (
                <nav
                  className={styles.pagination}
                  aria-label={fa ? "صفحه‌بندی محصولات" : "Product pages"}
                >
                  {page > 1 && (
                    <Link prefetch={false} href={catalogHref(category, page - 1)} rel="prev">
                      {dict.common.previous}
                    </Link>
                  )}
                  <span>
                    {dict.common.page} {page.toLocaleString(locale)} /{" "}
                    {products.pagination.totalPages.toLocaleString(locale)}
                  </span>
                  {page < products.pagination.totalPages && (
                    <Link prefetch={false} href={catalogHref(category, page + 1)} rel="next">
                      {dict.common.next}
                    </Link>
                  )}
                </nav>
              )}
            </>
          ) : page > 1 && products.pagination.total > 0 ? (
            <div className={styles.empty}>
              <h2>{fa ? "این صفحه دیگر در دسترس نیست." : "This page is no longer available."}</h2>
              <Link prefetch={false} href={catalogHref()}>
                {fa ? "بازگشت به صفحهٔ اول نتایج" : "Return to the first page"}
              </Link>
            </div>
          ) : (
            <div className={styles.empty}>
              <h2>{dict.products.empty}</h2>
              <p>
                {fa
                  ? "نام کوتاه‌تری امتحان کن یا دسته‌بندی را تغییر بده."
                  : "Try a shorter name or a different category."}
              </p>
              <Link prefetch={false} href={`/${locale}/products`}>
                {fa ? "نمایش همهٔ محصولات ←" : "Browse all products →"}
              </Link>
            </div>
          )}
        </div>
        <aside className={styles.help}>
          <div>
            <h2>{fa ? "هنوز بین چند ابزار مرددی؟" : "Still deciding between tools?"}</h2>
            <p>
              {fa
                ? "بگو برای چه کاری نیازش داری؛ انتخاب از نیاز تو شروع می‌شود."
                : "Tell us what you want to do. The right choice starts with your needs."}
            </p>
          </div>
          <a href={telegramSupportHref(settings)} target="_blank" rel="noopener noreferrer">
            {fa ? "مشاورهٔ پیش از خرید در تلگرام" : "Ask on Telegram before buying"} ↗
          </a>
        </aside>
      </div>
    </div>
  );
}
