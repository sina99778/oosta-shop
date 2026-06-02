import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { TicketThread } from "@/components/tickets/ticket-thread";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <RequireAuth locale={locale}>
      <TicketThread locale={locale} ticketId={id} dict={dict} />
    </RequireAuth>
  );
}
