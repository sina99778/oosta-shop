import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/api";
import { availabilityOf, availabilityLabel } from "@/lib/product-availability";
import type { Locale } from "@/lib/i18n";
import type { ProductSummary } from "@/lib/types";
import { IndicativePriceLabel } from "./indicative-price";
import styles from "./shop.module.css";
export type ProductCardLabels = {
  from: string;
  inStock: string;
  outOfStock: string;
  featured: string;
  off: string;
  left: string;
};
// Two-letter tile text when a product has no image, e.g. "Claude Pro" → "CP".
export function monogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

export function ProductCard({
  product,
  locale,
  labels,
  priority = false,
}: {
  product: ProductSummary;
  locale: Locale;
  labels: ProductCardLabels;
  priority?: boolean;
}) {
  const image = productImageUrl(product);
  const fa = locale === "fa";
  const availability = availabilityOf(product);
  const categoryNames: Record<string, string> = fa
    ? {
        "ai-accounts": "هوش مصنوعی",
        "software-licenses": "نرم‌افزار و لایسنس",
        "gift-cards": "گیفت‌کارت",
      }
    : {};
  return (
    <Link
      href={{
        pathname: `/${locale}/products/${product.slug}`,
        query: product.pricePlanId ? { plan: product.pricePlanId } : undefined,
      }}
      prefetch={false}
      className={styles.cardLink}
      aria-label={`${fa ? "مشاهدهٔ محصول" : "View product"} ${product.name}`}
    >
      <article className={styles.productCard} data-stock={availability}>
        <div className={styles.cardTop}>
          <span className={styles.cardTile} data-kind={product.type}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={priority ? "high" : "low"}
              />
            ) : (
              <span aria-hidden="true">{monogram(product.name)}</span>
            )}
          </span>
          <span className={styles.cardBadges}>
            <span className={styles.stockBadge} data-stock={availability}>
              {availabilityLabel(product, locale)}
            </span>
            {product.isFeatured && <span className={styles.featured}>{labels.featured}</span>}
            {availability === "LOCAL_STOCK" && product.discountPercent > 0 && (
              <span className={styles.sale}>
                {product.discountPercent.toLocaleString(fa ? "fa" : "en")}% {labels.off}
              </span>
            )}
          </span>
        </div>
        <h3>
          <bdi>{product.name}</bdi>
        </h3>
        <p className={styles.cardMeta}>
          {categoryNames[product.category.slug] ?? product.category.name}
          {product.pricePlanId && product.priceDurationDays != null
            ? fa
              ? ` · ${product.priceDurationDays.toLocaleString("fa")} روز`
              : ` · ${product.priceDurationDays} ${product.priceDurationDays === 1 ? "day" : "days"}`
            : product.pricePlanId && availability === "LOCAL_STOCK"
              ? fa
                ? " · بدون انقضا"
                : " · No expiry"
              : ""}
        </p>
        {product.ratingCount > 0 && (
          <p className={styles.rating} aria-label={`${product.ratingAverage} / 5`}>
            ★ {product.ratingAverage.toLocaleString(fa ? "fa" : "en")}{" "}
            <span>({product.ratingCount.toLocaleString(fa ? "fa" : "en")})</span>
          </p>
        )}
        {product.lowStock && (
          <p className={styles.lowStock}>
            {product.availableStock.toLocaleString(fa ? "fa" : "en")} {labels.left}
          </p>
        )}
        <div className={styles.cardFoot}>
          <div className={styles.cardPrice}>
            {availability === "SUPPLIER_STOCK" && (
              <IndicativePriceLabel price={product.indicativePriceFrom} locale={locale} from />
            )}
            {(availability === "ON_REQUEST" ||
              (availability === "OUT_OF_STOCK" && product.supplierStockUnconfirmed)) && (
              <small>{fa ? "قیمت با استعلام" : "Price on request"}</small>
            )}
            {availability === "LOCAL_STOCK" && product.priceFrom !== null && (
              <>
                <small>
                  {labels.from}{" "}
                  {product.originalPriceFrom !== null && (
                    <del>
                      <bdi>{formatPrice(product.originalPriceFrom, product.currency, locale)}</bdi>
                    </del>
                  )}
                </small>
                <strong>
                  <bdi>{formatPrice(product.priceFrom, product.currency, locale)}</bdi>
                </strong>
              </>
            )}
          </div>
          <span className={styles.cardAction}>
            {availability === "OUT_OF_STOCK"
              ? fa
                ? "مشاهدهٔ پلن‌ها"
                : "View plans"
              : fa
                ? "انتخاب پلن"
                : "Choose a plan"}
          </span>
        </div>
      </article>
    </Link>
  );
}
