import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <Suspense>
      <AuthForm mode="login" locale={locale} dict={dict} />
    </Suspense>
  );
}
