import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AdminSuppliers } from "@/components/admin/admin-suppliers";
export default async function SuppliersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminSuppliers locale={locale} />;
}
