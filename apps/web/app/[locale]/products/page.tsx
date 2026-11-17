import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import { ProductsBrowser, type CatalogParams } from "@/components/products-browser";

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

  return (
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
  );
}
