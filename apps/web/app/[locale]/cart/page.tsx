import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRIVATE_PAGE_METADATA } from "@/lib/page-metadata";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { ShoppingCart } from "@/components/shopping-cart";

export const metadata: Metadata = PRIVATE_PAGE_METADATA;
export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <RequireAuth locale={locale}>
      <ShoppingCart locale={locale} />
    </RequireAuth>
  );
}
