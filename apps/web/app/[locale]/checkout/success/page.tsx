import { redirect, notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";

// Success is displayed only by the authenticated order view after verification.
export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/dashboard`);
}
