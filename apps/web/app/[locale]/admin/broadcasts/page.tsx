import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AdminBroadcasts } from "@/components/admin/admin-broadcasts";

export default async function AdminBroadcastsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return <AdminBroadcasts locale={locale} dict={dict} />;
}
