import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
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
  return (
    <Link href={`/${locale}/products/${product.slug}`} className="group block">
      <Card className="flex h-full flex-col transition-colors hover:border-primary">
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
