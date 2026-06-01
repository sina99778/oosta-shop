"use client";

import Link from "next/link";
import { useApi } from "@/lib/use-api";
import { ProductCard } from "@/components/product-card";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function HomeSections({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const categories = useApi<{ categories: Category[] }>("/categories");
  const best = useApi<{ products: ProductSummary[] }>("/products/bestselling?limit=8");
  const labels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
  };

  return (
    <Container className="space-y-12 py-12">
      <section>
        <h2 className="mb-4 text-xl font-semibold">{dict.home.shopByCategory}</h2>
        {categories.loading ? (
          <Spinner />
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.data?.categories.map((category) => (
              <Link
                key={category.id}
                href={`/${locale}/products?category=${category.slug}`}
                className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {category.name} <span className="text-muted">({category.productCount})</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">{dict.home.bestsellers}</h2>
        {best.loading ? (
          <Spinner />
        ) : best.data && best.data.products.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {best.data.products.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} labels={labels} />
            ))}
          </div>
        ) : (
          <p className="text-muted">{dict.home.noProducts}</p>
        )}
      </section>
    </Container>
  );
}
