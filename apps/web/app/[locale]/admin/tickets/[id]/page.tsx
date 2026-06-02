import { notFound } from "next/navigation";
import { getDictionary } from "../../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AdminTicketDetailView } from "@/components/admin/admin-ticket-detail";

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return <AdminTicketDetailView locale={locale} ticketId={id} dict={dict} />;
}
