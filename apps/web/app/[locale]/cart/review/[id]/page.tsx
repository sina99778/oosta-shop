import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRIVATE_PAGE_METADATA } from "@/lib/page-metadata";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { CartReview } from "@/components/shopping-cart";

export const metadata: Metadata = PRIVATE_PAGE_METADATA;
export default async function CartReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ with?: string | string[] }>;
}) {
  const { locale, id } = await params;
  const { with: group } = await searchParams;
  if (Array.isArray(group)) notFound();
  const extraIds = group ? group.split(",") : [];
  const ids = [id, ...extraIds];
  if (
    !isLocale(locale) ||
    ids.length > 10 ||
    new Set(ids).size !== ids.length ||
    ids.some((value) => !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
  )
    notFound();
  return (
    <RequireAuth locale={locale}>
      <CartReview key={ids.join(",")} locale={locale} id={id} extraIds={extraIds} />
    </RequireAuth>
  );
}
