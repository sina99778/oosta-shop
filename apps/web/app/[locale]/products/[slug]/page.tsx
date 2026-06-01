import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { ProductDetailView } from "@/components/product-detail-view";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return <ProductDetailView locale={locale} slug={slug} dict={dict} />;
}
