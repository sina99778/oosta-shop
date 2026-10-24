import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { AdminShell } from "@/components/admin/admin-nav";

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
      <AdminShell
        locale={locale}
        labels={{
          dashboard: dict.admin.dashboardTab,
          products: dict.admin.products,
          orders: dict.admin.orders,
          receipts: dict.admin.receipts.tab,
          coupons: dict.admin.coupons.tab,
          reviews: dict.admin.reviews.tab,
          tickets: dict.admin.ticketsTab,
          customers: dict.admin.customers.tab,
          broadcasts: dict.admin.broadcasts.tab,
          blog: dict.admin.blogTab,
          api: dict.admin.apiTab,
          settings: dict.admin.settingsTab,
          sidebarTitle: dict.admin.sidebarTitle,
          sidebarSubtitle: dict.admin.sidebarSubtitle,
          groupSales: dict.admin.groupSales,
          groupCatalog: dict.admin.groupCatalog,
          groupCustomers: dict.admin.groupCustomers,
          groupSystem: dict.admin.groupSystem,
          backToStore: dict.admin.backToStore,
        }}
      >
        {children}
      </AdminShell>
    </RequireAuth>
  );
}
