import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AdminSettings } from "@/components/admin/admin-settings";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  return <AdminSettings dict={dict} />;
}
