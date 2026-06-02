import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <RequireAuth locale={locale} role="ADMIN">
      <AdminNav
        locale={locale}
        labels={{
          products: dict.admin.products,
          orders: dict.admin.orders,
          receipts: dict.admin.receipts.tab,
        }}
      />
      {children}
    </RequireAuth>
  );
}
