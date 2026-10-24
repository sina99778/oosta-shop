import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = { robots: { index: false } };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  return <ResetPasswordForm locale={locale} token={token} dict={dict} />;
}
