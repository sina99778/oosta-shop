import { cn } from "@/lib/cn";
import type { ProductType } from "@/lib/types";
// Monograms identify products without inventing third-party brand logos.
export function ProductMark({
  name,
  type,
  className,
}: {
  name: string;
  slug: string;
  type: ProductType;
  className?: string;
}) {
  return (
    <span className={cn("oosta-product-mark", className)} data-kind={type} aria-hidden="true">
      {name.trim().slice(0, 2).toUpperCase()}
    </span>
  );
}
