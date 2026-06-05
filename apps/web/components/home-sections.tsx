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
    featured: dict.product.featured,
    off: dict.product.off,
    left: dict.product.left,
  };

  return (
    <Container className="space-y-14 py-14">
      <section>
        <h2 className="mb-5 text-2xl font-bold tracking-tight">{dict.home.shopByCategory}</h2>
        {categories.loading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.data?.categories.map((category) => (
              <Link
                key={category.id}
                href={`/${locale}/products?category=${category.slug}`}
                className="group relative overflow-hidden rounded-2xl p-5 glass-panel glass-panel-hover"
              >
                <div className="absolute inset-x-0 -top-16 h-32 bg-brand-gradient opacity-0 blur-2xl transition-opacity group-hover:opacity-20" />
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 9h18M3 15h18M9 3v18" />
                  </svg>
                </span>
                <p className="mt-3 font-semibold group-hover:text-primary">{category.name}</p>
                <p className="text-sm text-muted">
                  {category.productCount} {dict.products.results}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-2xl font-bold tracking-tight">{dict.home.bestsellers}</h2>
          <Link
            href={`/${locale}/products`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {dict.common.viewAll} →
          </Link>
        </div>
        {best.loading ? (
          <Spinner />
        ) : best.data && best.data.products.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
