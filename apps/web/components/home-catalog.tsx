import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import type { Category, ProductSummary } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import styles from "./home.module.css";

type Tint = "ai" | "license" | "gift";

// A short mark and a product-type tint for each storefront category.
const categoryMarks: Record<string, [string, Tint]> = {
  learning: ["ABC", "ai"],
  "ai-and-creative-tools": ["AI", "ai"],
  "ai-tools": ["AI", "ai"],
  "ai-accounts": ["AI", "ai"],
  "api-subscriptions": ["API", "license"],
  "digital-security": ["VPN", "license"],
  "developer-tools": ["</>", "license"],
  "office-and-productivity": ["365", "license"],
  "software-licenses": ["KEY", "license"],
  entertainment: ["▶", "gift"],
  "design-and-media": ["Aa", "gift"],
  "gaming-and-connectivity": ["XP", "gift"],
  "gift-cards": ["GIFT", "gift"],
};

const englishLabels: Record<string, string> = {
  learning: "Learning & languages",
  "ai-and-creative-tools": "AI & creative tools",
  "api-subscriptions": "API subscriptions & credits",
  "digital-security": "Security & privacy",
  "developer-tools": "Development & automation",
  entertainment: "Entertainment & streaming",
  "design-and-media": "Design & media",
  "ai-tools": "AI tools",
  "office-and-productivity": "Office & productivity",
  "gaming-and-connectivity": "Gaming & connectivity",
};

function markFor(category: Category): [string, Tint] {
  return categoryMarks[category.slug] ?? [category.name.slice(0, 2), "ai"];
}

export function HomeCatalog({
  locale,
  products,
  categories,
  unavailable,
}: {
  locale: Locale;
  products: ProductSummary[];
  categories: Category[];
  categoryLabels?: Record<string, string>;
  unavailable: boolean;
}) {
  const fa = locale === "fa";
  const browse = fa ? "همهٔ محصولات" : "All products";
  const catalogHref = `/${locale}/products`;
  const visible = categories.filter((item) => item.productCount > 0);
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
    <section
      id="home-catalog"
      className={`${styles.wrap} ${styles.categories}`}
      aria-labelledby="catalog-title"
    >
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>
            {fa ? "از کاربرد شروع کن" : "Start from your task"}
          </span>
          <h2 id="catalog-title">{fa ? "دسته‌بندی‌ها" : "Categories"}</h2>
        </div>
        <Link href={catalogHref} prefetch={false} className={styles.textLink}>
          {browse}
          <span aria-hidden="true">{fa ? "←" : "→"}</span>
        </Link>
      </div>
      {visible.length > 0 && (
        <nav aria-label={fa ? "دسته‌بندی محصولات" : "Product categories"}>
          <ul className={styles.tiles}>
            {visible.map((item) => {
              const [mark, tint] = markFor(item);
              return (
                <li key={item.id}>
                  <Link
                    className={styles.tile}
                    href={catalogHref + "?" + new URLSearchParams({ category: item.slug })}
                    prefetch={false}
                  >
                    <span className={styles.tileTop}>
                      <span className={styles.tileGlyph} data-tint={tint} aria-hidden="true">
                        {mark}
                      </span>
                      <span aria-hidden="true">{fa ? "←" : "→"}</span>
                    </span>
                    <h3>{fa ? item.name : (englishLabels[item.slug] ?? item.name)}</h3>
                    <small>
                      {fa
                        ? `${item.productCount.toLocaleString("fa-IR")} محصول`
                        : `${item.productCount} ${item.productCount === 1 ? "product" : "products"}`}
                    </small>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <div className={styles.picks}>
        <h3>{fa ? "منتخب اوستا" : "Oosta picks"}</h3>
        {products.length > 0 && !unavailable ? (
          <ul className={styles.products}>
            {products.slice(0, 4).map((product) => (
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
      </div>
    </section>
  );
}
