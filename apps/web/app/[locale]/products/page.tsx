import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import { ProductsBrowser, type CatalogParams } from "@/components/products-browser";
import { collectionJsonLd, localizedPageMetadata, safeJsonLd } from "@/lib/page-metadata";

// Filtered and paged catalog URLs (?category=, ?page=) share the catalog's
// canonical; only the catalog root is the indexable entry.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  return localizedPageMetadata(
    locale,
    "/products",
    dict.meta.catalogTitle,
    dict.meta.catalogDescription,
  );
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CatalogParams>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const filters = await searchParams;
  const schema = collectionJsonLd(
    locale,
    "/products",
    dict.meta.catalogTitle,
    dict.meta.catalogDescription,
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
      <Suspense
        key={JSON.stringify(filters)}
        fallback={
          <Container className="py-20 text-center">
            <Spinner className="size-6" />
          </Container>
        }
      >
        <ProductsBrowser locale={locale} dict={dict} params={filters} />
      </Suspense>
    </>
  );
}
