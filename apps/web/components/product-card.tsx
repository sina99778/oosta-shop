import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import type { ProductSummary } from "@/lib/types";

export type ProductCardLabels = { from: string; inStock: string; outOfStock: string };

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
      <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-primary">
        <div className="-mx-5 -mt-5 mb-3 aspect-[16/10] overflow-hidden border-b border-border bg-surface">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted/40">
              {product.name.charAt(0)}
            </div>
          )}
        </div>
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-xs text-muted">{product.category.name}</span>
          <Badge tone={product.inStock ? "success" : "danger"}>
            {product.inStock ? labels.inStock : labels.outOfStock}
          </Badge>
        </div>
        <h3 className="font-semibold leading-snug group-hover:text-primary">{product.name}</h3>
        {product.priceFrom !== null && (
          <p className="mt-auto pt-4 text-sm text-muted">
            {labels.from}{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(product.priceFrom, product.currency, locale)}
            </span>
          </p>
        )}
      </Card>
    </Link>
  );
}
