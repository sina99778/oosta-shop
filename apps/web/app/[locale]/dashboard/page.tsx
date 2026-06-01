import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { DashboardOrders } from "@/components/dashboard-orders";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <RequireAuth locale={locale}>
      <DashboardOrders locale={locale} dict={dict} />
    </RequireAuth>
  );
}
