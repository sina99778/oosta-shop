import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ProductMark } from "@/components/product-mark";
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

function categoryName(product: ProductSummary, locale: Locale): string {
  if (locale !== "fa") return product.category.name;
  const names: Record<string, string> = {
    "ai-accounts": "اکانت‌های هوش مصنوعی",
    "software-licenses": "لایسنس نرم‌افزار",
    "gift-cards": "گیفت‌کارت",
  };
  return names[product.category.slug] ?? product.category.name;
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
      <article className="relative flex h-full min-h-[300px] flex-col overflow-hidden border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-glow">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="relative size-20 overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full rounded-md object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <ProductMark
                name={product.name}
                slug={product.slug}
                type={product.type}
                className="size-20"
              />
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                product.inStock ? "text-success" : "text-danger"
              }`}
            >
              <span
                className={`size-2 rounded-full ${product.inStock ? "bg-success" : "bg-danger"}`}
              />
              {product.inStock ? labels.inStock : labels.outOfStock}
            </span>
            {product.isFeatured && (
              <Badge tone="sale" className="rounded-sm">
                {labels.featured}
              </Badge>
            )}
            {product.discountPercent > 0 && (
              <Badge tone="sale" className="rounded-sm">
                {product.discountPercent}% {labels.off}
              </Badge>
            )}
          </div>
        </div>

        <h3 className="text-lg font-black leading-snug group-hover:text-primary">{product.name}</h3>
        <p className="mt-1 text-sm text-muted">{categoryName(product, locale)}</p>

        {product.ratingCount > 0 && (
          <p className="mt-3 text-xs text-accent">
            {stars(product.ratingAverage)}{" "}
            <span className="text-muted">({product.ratingCount})</span>
          </p>
        )}

        {product.priceFrom !== null && (
          <div className="mt-auto pt-5">
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
              <p className="text-xl font-black text-foreground">
                {formatPrice(product.priceFrom, product.currency, locale)}
              </p>
            </div>
            <span className="mt-4 flex h-10 items-center justify-between border border-border px-3 text-sm font-bold transition-all group-hover:border-primary group-hover:text-primary">
              <span>{product.inStock ? labels.inStock : labels.outOfStock}</span>
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
      </article>
    </Link>
  );
}
