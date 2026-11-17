import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { TicketList } from "@/components/tickets/ticket-list";

export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const { order } = await searchParams;
  const orderRef = typeof order === "string" && /^[a-z0-9]{8}$/i.test(order) ? order : undefined;

  return (
    <RequireAuth locale={locale}>
      <TicketList key={orderRef ?? "general"} locale={locale} dict={dict} orderRef={orderRef} />
    </RequireAuth>
  );
}
