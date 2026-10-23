import Link from "next/link";
import { ProductStamp } from "@/components/stamp";
import { formatPrice } from "@/lib/format";
import { categoryName } from "@/lib/category-name";
import { productImageUrl } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import type { ProductSummary } from "@/lib/types";

export type ProductCardLabels = {
  from: string;
  inStock: string;
  outOfStock: string;
  featured: string;
  off: string;
  left: string;
};

function stars(n: number): string {
  const r = Math.round(n);
  return "★★★★★☆☆☆☆☆".slice(5 - r, 10 - r);
}

// Stable small tilt per product so the grid looks hand-stuck, not random per render.
function tiltFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.8;
}

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
  const badge =
    product.discountPercent > 0
      ? `${product.discountPercent}% ${labels.off}`
      : product.lowStock
        ? `${product.availableStock} ${labels.left}`
        : product.isFeatured
          ? labels.featured
          : null;
  return (
    <Link href={`/${locale}/products/${product.slug}`} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-card transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/50">
        <div className="relative grid h-[150px] place-items-center bg-surface sm:h-[180px]">
          <ProductStamp
            slug={product.slug}
            type={product.type}
            image={image}
            name={product.name}
            tilt={tiltFor(product.id)}
            denomination={
              product.priceFrom !== null
                ? new Intl.NumberFormat("fa-IR").format(
                    product.currency === "IRR" ? product.priceFrom / 10 : product.priceFrom,
                  )
                : undefined
            }
            className="transition-transform duration-300 group-hover:rotate-0"
          />
          {badge && (
            <span className="absolute end-3 top-3 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-bold text-[#8a4b0f] dark:text-accent">
              {badge}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
          <h3 className="text-base font-extrabold leading-snug group-hover:text-primary" dir="auto">
            {product.name}
          </h3>
          <p className="text-[13px] text-muted">{categoryName(product.category, locale)}</p>

          {product.ratingCount > 0 && (
            <p className="text-xs text-[#8a5a12] dark:text-accent">
              <span aria-hidden>{stars(product.ratingAverage)}</span>{" "}
              <span className="text-muted">({product.ratingCount})</span>
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
            {product.priceFrom !== null ? (
              <div>
                {product.originalPriceFrom !== null && (
                  <p className="text-xs text-muted line-through">
                    {formatPrice(product.originalPriceFrom, product.currency, locale)}
                  </p>
                )}
                <p className="text-base font-extrabold">
                  <span className="text-xs font-medium text-muted">{labels.from} </span>
                  {formatPrice(product.priceFrom, product.currency, locale)}
                </p>
              </div>
            ) : (
              <span />
            )}
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${
                product.inStock ? "text-success" : "text-danger"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${product.inStock ? "bg-success" : "bg-danger"}`}
              />
              {product.inStock ? labels.inStock : labels.outOfStock}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
