import { notFound } from "next/navigation";
import { getDictionary } from "../../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { CardCheckout } from "@/components/card-checkout";

export default async function CardCheckoutPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <RequireAuth locale={locale}>
      <CardCheckout locale={locale} orderId={orderId} dict={dict} />
    </RequireAuth>
  );
}
