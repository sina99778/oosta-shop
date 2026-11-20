import { notFound } from "next/navigation";
import { AccountInbox } from "@/components/account-inbox";
import { RequireAuth } from "@/components/require-auth";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function InboxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <RequireAuth locale={locale}>
      <AccountInbox locale={locale} />
    </RequireAuth>
  );
}
