import { notFound } from "next/navigation";
import { getDictionary } from "../../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AdminOrderDetailView } from "@/components/admin/admin-order-detail";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[a-z0-9]{1,100}$/.test(id)) notFound();
  return (
    <AdminOrderDetailView
      key={id}
      locale={locale}
      orderId={id}
      dict={await getDictionary(locale)}
    />
  );
}
