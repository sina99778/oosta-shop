import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { AccountSecurity } from "@/components/account-security";

export default async function AccountSecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <RequireAuth locale={locale}>
      <AccountSecurity locale={locale} />
    </RequireAuth>
  );
}
