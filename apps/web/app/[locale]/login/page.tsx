import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { AuthForm } from "@/components/auth-form";
import { AUTH_PAGE_METADATA } from "@/lib/page-metadata";

export const metadata: Metadata = AUTH_PAGE_METADATA;

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
