import Link from "next/link";
import { ProductMark } from "@/components/product-mark";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/api";
import { availabilityOf, availabilityLabel } from "@/lib/product-availability";
import type { Locale } from "@/lib/i18n";
import type { ProductSummary } from "@/lib/types";
import styles from "./shop.module.css";
export type ProductCardLabels = {
  from: string;
  inStock: string;
  outOfStock: string;
  featured: string;
  off: string;
  left: string;
};
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
  const onRequest = availability === "SUPPLIER_STOCK" || availability === "ON_REQUEST";
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
      <article className={styles.productCard}>
        <div className={styles.cardVisual} data-kind={product.type}>
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
            <ProductMark type={product.type} className={styles.cardMark} />
          )}
          {availability === "LOCAL_STOCK" && product.discountPercent > 0 && (
            <span className={styles.sale}>
              {product.discountPercent.toLocaleString(fa ? "fa" : "en")}% {labels.off}
            </span>
          )}
        </div>
        <div className={styles.cardBody}>
          <span className={styles.stockBadge} data-stock={availability}>
            {availabilityLabel(product, locale)}
          </span>
          <p className={styles.cardMeta}>
            {categoryNames[product.category.slug] ?? product.category.name}
          </p>
          <h3>
            <bdi>{product.name}</bdi>
          </h3>
          {product.isFeatured && <span className={styles.featured}>{labels.featured}</span>}
          {product.ratingCount > 0 && (
            <p className={styles.rating} aria-label={`${product.ratingAverage} / 5`}>
              ★ {product.ratingAverage.toLocaleString(fa ? "fa" : "en")}{" "}
              <span>({product.ratingCount.toLocaleString(fa ? "fa" : "en")})</span>
            </p>
          )}
          <div className={styles.cardPrice}>
            {onRequest && <small>{fa ? "قیمت با استعلام" : "Price on request"}</small>}
            {product.lowStock && (
              <p className={styles.lowStock}>
                {product.availableStock.toLocaleString(fa ? "fa" : "en")} {labels.left}
              </p>
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
                {product.pricePlanId && (
                  <small>
                    {product.priceDurationDays == null
                      ? fa
                        ? "بدون انقضا"
                        : "No expiry"
                      : fa
                        ? `${product.priceDurationDays.toLocaleString("fa")} روز`
                        : `${product.priceDurationDays} ${product.priceDurationDays === 1 ? "day" : "days"}`}
                  </small>
                )}
              </>
            )}
            <span className={styles.cardAction}>
              {fa ? "مشاهدهٔ پلن‌ها" : "View plans"}
              <span aria-hidden="true">{fa ? "←" : "→"}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
