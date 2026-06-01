import { notFound } from "next/navigation";
import { getDictionary } from "../../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AdminProductDetail } from "@/components/admin/admin-product-detail";

export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return <AdminProductDetail locale={locale} productId={id} dict={dict} />;
}
