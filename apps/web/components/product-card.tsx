import Link from "next/link";
import { ProductMark } from "@/components/product-mark";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/api";
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
}: {
  product: ProductSummary;
  locale: Locale;
  labels: ProductCardLabels;
}) {
  const image = productImageUrl(product);
  const fa = locale === "fa";
  const categoryNames: Record<string, string> = fa
    ? {
        "ai-accounts": "هوش مصنوعی",
        "software-licenses": "نرم‌افزار و لایسنس",
        "gift-cards": "گیفت‌کارت",
      }
    : {};
  return (
    <Link
      href={`/${locale}/products/${product.slug}`}
      className={styles.cardLink}
      aria-label={`${fa ? "مشاهدهٔ محصول" : "View product"} ${product.name}`}
    >
      <article className={styles.productCard}>
        <div className={styles.cardVisual} data-kind={product.type}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" loading="lazy" decoding="async" />
          ) : (
            <ProductMark
              name={product.name}
              slug={product.slug}
              type={product.type}
              className={styles.cardMark}
            />
          )}
          <span className={styles.cardType}>
            {product.type === "ACCOUNT"
              ? "AI / ACCESS"
              : product.type === "LICENSE"
                ? "SOFTWARE / LICENSE"
                : "DIGITAL / CREDIT"}
          </span>
          {product.discountPercent > 0 && (
            <span className={styles.sale}>
              {product.discountPercent.toLocaleString(fa ? "fa" : "en")}% {labels.off}
            </span>
          )}
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardMeta}>
            <span>{categoryNames[product.category.slug] ?? product.category.name}</span>
            <span data-available={product.inStock}>
              {product.inStock ? labels.inStock : labels.outOfStock}
            </span>
          </div>
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
            {product.lowStock && (
              <p className={styles.lowStock}>
                {product.availableStock.toLocaleString(fa ? "fa" : "en")} {labels.left}
              </p>
            )}
            {product.priceFrom !== null && (
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
            <span className={styles.cardAction}>
              {fa ? "مشاهده و انتخاب پلن" : "Explore plans"}
              <span aria-hidden="true">{fa ? "←" : "→"}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
