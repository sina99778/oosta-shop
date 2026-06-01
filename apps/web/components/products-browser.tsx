"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { ProductCard } from "@/components/product-card";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n";
import type { Category, Paginated, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function ProductsBrowser({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [category]);

  const query = new URLSearchParams({ page: String(page), pageSize: "12" });
  if (category) query.set("category", category);

  const products = useApi<Paginated<ProductSummary>>(`/products?${query.toString()}`);
  const categories = useApi<{ categories: Category[] }>("/categories");
  const labels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-4 py-1.5 text-sm transition-colors",
      active ? "border-primary text-primary" : "border-border text-muted hover:text-foreground",
    );

  return (
    <Container className="py-10">
      <h1 className="mb-6 text-2xl font-bold">{dict.products.title}</h1>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link href={`/${locale}/products`} className={chip(!category)}>
          {dict.common.all}
        </Link>
        {categories.data?.categories.map((c) => (
          <Link
            key={c.id}
            href={`/${locale}/products?category=${c.slug}`}
            className={chip(category === c.slug)}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {products.loading ? (
        <div className="py-20 text-center">
          <Spinner className="size-6" />
        </div>
      ) : products.error ? (
        <p className="text-danger">{dict.common.somethingWrong}</p>
      ) : products.data && products.data.items.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.data.items.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} labels={labels} />
            ))}
          </div>
          {products.data.pagination.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {dict.common.previous}
              </Button>
              <span className="text-sm text-muted">
                {dict.common.page} {products.data.pagination.page} /{" "}
                {products.data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= products.data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {dict.common.next}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted">{dict.products.empty}</p>
      )}
    </Container>
  );
}
