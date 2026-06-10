"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import { ProductCard } from "@/components/product-card";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

const CATEGORY_EMOJI = ["🤖", "🔑", "🎁", "🎧", "🎬", "🧰", "📚", "🛡️"];

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
      <span className="h-7 w-1.5 rounded-full bg-brand-gradient" />
      {children}
    </h2>
  );
}

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
    <Container className="space-y-16 py-16">
      <section>
        <div className="mb-6">
          <SectionTitle>{dict.home.shopByCategory}</SectionTitle>
        </div>
        {categories.loading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.data?.categories.map((category, i) => (
              <Link
                key={category.id}
                href={`/${locale}/products?category=${category.slug}`}
                className="group relative overflow-hidden rounded-2xl p-5 glass-panel glass-panel-hover"
              >
                <div className="absolute inset-x-0 -top-16 h-32 bg-brand-gradient opacity-0 blur-2xl transition-opacity group-hover:opacity-25" />
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-xl transition-transform group-hover:scale-110">
                  {CATEGORY_EMOJI[i % CATEGORY_EMOJI.length]}
                </span>
                <p className="mt-3 font-semibold group-hover:text-primary">{category.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {category.productCount} {dict.products.results}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between">
          <SectionTitle>{dict.home.bestsellers}</SectionTitle>
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
