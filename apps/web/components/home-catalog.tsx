import Link from "next/link";
import { ProductCard } from "@/components/product-card";
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
  const fa = locale === "fa";
  const browse = fa ? "همهٔ محصولات" : "All products";
  const catalogHref = `/${locale}/products`;
  const labels = fa
    ? {
        from: "از",
        inStock: "موجود",
        outOfStock: "ناموجود",
        featured: "منتخب",
        off: "تخفیف",
        left: "باقی‌مانده",
      }
    : {
        from: "From",
        inStock: "Available",
        outOfStock: "Out of stock",
        featured: "Featured",
        off: "off",
        left: "left",
      };

  return (
    <section id="home-catalog" className={styles.catalog} aria-labelledby="catalog-title">
      <div className={styles.sectionHeading}>
        <h2 id="catalog-title">{fa ? "محصولات و اشتراک‌ها" : "Products and subscriptions"}</h2>
        <Link href={catalogHref} prefetch={false} className={styles.textLink}>
          {browse}
          <span aria-hidden="true">{fa ? "←" : "→"}</span>
        </Link>
      </div>
      <nav className={styles.filters} aria-label={fa ? "دسته‌بندی محصولات" : "Product categories"}>
        {categories
          .filter((item) => item.productCount > 0)
          .map((item) => (
            <Link
              key={item.id}
              href={catalogHref + "?" + new URLSearchParams({ category: item.slug })}
              prefetch={false}
            >
              {categoryLabels[item.slug] ?? item.name}
            </Link>
          ))}
      </nav>
      {products.length > 0 && !unavailable ? (
        <ul className={styles.products}>
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} locale={locale} labels={labels} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p>
            {unavailable
              ? fa
                ? "دریافت محصولات ممکن نشد."
                : "Products couldn't be loaded."
              : fa
                ? "محصولی برای نمایش نیست."
                : "No products to display."}
          </p>
          <Link className={styles.textLink} href={catalogHref} prefetch={false}>
            {browse}
          </Link>
        </div>
      )}
    </section>
  );
}
