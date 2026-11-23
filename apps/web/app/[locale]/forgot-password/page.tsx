import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { getDictionary } from "../dictionaries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { auth, common } = await getDictionary(locale);
  return <PasswordRecoveryForm mode="request" locale={locale} dict={{ auth, common }} />;
}
