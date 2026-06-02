import { notFound } from "next/navigation";
import { getDictionary } from "../../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AdminProductNew } from "@/components/admin/admin-product-new";

export default async function AdminProductNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return <AdminProductNew locale={locale} dict={dict} />;
}
