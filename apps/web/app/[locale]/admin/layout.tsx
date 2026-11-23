import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { RequireAuth } from "@/components/require-auth";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "@/components/admin/admin.module.css";
import { PRIVATE_PAGE_METADATA } from "@/lib/page-metadata";

export const metadata: Metadata = PRIVATE_PAGE_METADATA;

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
      <div data-admin-shell className={styles.shell}>
        <AdminNav
          locale={locale}
          labels={{
            products: dict.admin.products,
            orders: dict.admin.orders,
            receipts: dict.admin.receipts.tab,
            reviews: dict.admin.reviews.tab,
            tickets: dict.admin.ticketsTab,
            blog: dict.admin.blogTab,
            api: dict.admin.apiTab,
            settings: dict.admin.settingsTab,
          }}
        />
        <div id="admin-content" className={styles.content}>
          {children}
        </div>
      </div>
    </RequireAuth>
  );
}
