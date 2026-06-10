import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
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
  return (
    <Link href={`/${locale}/products/${product.slug}`} className="group block">
      <Card className="flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-glow">
        <div className="relative -mx-5 -mt-5 mb-3 aspect-[16/10] overflow-hidden border-b border-border bg-surface">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted/40">
              {product.name.charAt(0)}
            </div>
          )}
          <div className="absolute inset-x-2 top-2 flex items-start justify-between">
            {product.isFeatured ? <Badge tone="primary">{labels.featured}</Badge> : <span />}
            {product.discountPercent > 0 && (
              <Badge tone="sale">
                {product.discountPercent}% {labels.off}
              </Badge>
            )}
          </div>
        </div>

        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="text-xs text-muted">{product.category.name}</span>
          <Badge tone={product.inStock ? "success" : "danger"}>
            {product.inStock ? labels.inStock : labels.outOfStock}
          </Badge>
        </div>

        <h3 className="font-semibold leading-snug group-hover:text-primary">{product.name}</h3>

        {product.ratingCount > 0 && (
          <p className="mt-1 text-xs text-amber-400">
            {stars(product.ratingAverage)}{" "}
            <span className="text-muted">({product.ratingCount})</span>
          </p>
        )}

        {product.priceFrom !== null && (
          <div className="mt-auto flex items-end justify-between gap-2 pt-4">
            <div>
              {product.lowStock && (
                <p className="mb-1 text-xs text-danger">
                  {product.availableStock} {labels.left}
                </p>
              )}
              <p className="text-xs text-muted">
                {labels.from}{" "}
                {product.originalPriceFrom !== null && (
                  <span className="line-through">
                    {formatPrice(product.originalPriceFrom, product.currency, locale)}
                  </span>
                )}
              </p>
              <p className="text-base font-bold text-foreground">
                {formatPrice(product.priceFrom, product.currency, locale)}
              </p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted transition-all group-hover:border-transparent group-hover:bg-brand-gradient group-hover:text-white">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="rtl:-scale-x-100"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </div>
        )}
      </Card>
    </Link>
  );
}
