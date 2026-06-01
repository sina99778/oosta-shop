import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import { ProductsBrowser } from "@/components/products-browser";

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <Suspense
      fallback={
        <Container className="py-20 text-center">
          <Spinner className="size-6" />
        </Container>
      }
    >
      <ProductsBrowser locale={locale} dict={dict} />
    </Suspense>
  );
}
