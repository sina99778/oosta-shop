import { notFound } from "next/navigation";
import { getDictionary } from "../../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { OrderDetail } from "@/components/order-detail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <RequireAuth locale={locale}>
      <OrderDetail locale={locale} orderId={id} dict={dict} />
    </RequireAuth>
  );
}
