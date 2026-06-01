import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AdminProducts } from "@/components/admin/admin-products";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return <AdminProducts locale={locale} dict={dict} />;
}
