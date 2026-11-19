"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { Locale } from "@/lib/i18n";
import styles from "./admin.module.css";

export function AdminNav({
  locale,
  labels,
}: {
  locale: Locale;
  labels: Record<
    "products" | "orders" | "receipts" | "reviews" | "tickets" | "blog" | "api" | "settings",
    string
  >;
}) {
  const pathname = usePathname();
  const { logout, token } = useAuth();
  const { data: supplierQueue, refetch } = useApi<{ enabled: boolean; count: number }>(
    token ? "/admin/suppliers/manual/pending" : null,
    token ?? undefined,
  );
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, 30000);
    return () => clearInterval(timer);
  }, [token, refetch]);
  const [open, setOpen] = useState(false);
  const fa = locale === "fa";
  const base = `/${locale}/admin`;
  const groups = [
    {
      label: fa ? "عملیات فروش" : "Operations",
      links: [
        { path: "", label: fa ? "نمای کلی" : "Overview" },
        { path: "/orders", label: labels.orders },
        ...(supplierQueue?.enabled
          ? [
              {
                path: "/orders#supplier-orders",
                label:
                  (fa ? "سفارش‌های تأمین‌کننده" : "Supplier orders") +
                  (supplierQueue.count ? ` (${supplierQueue.count})` : ""),
              },
            ]
          : []),
        { path: "/receipts", label: labels.receipts },
        { path: "/tickets", label: labels.tickets },
      ],
    },
    {
      label: fa ? "فروشگاه" : "Store",
      links: [
        { path: "/products", label: labels.products },
        { path: "/suppliers", label: fa ? "تأمین‌کننده‌ها" : "Suppliers" },
        { path: "/reviews", label: labels.reviews },
        { path: "/blog", label: labels.blog },
      ],
    },
    {
      label: fa ? "مدیریت سیستم" : "System",
      links: [
        { path: "/settings", label: labels.settings },
        { path: "/api-keys", label: labels.api },
      ],
    },
  ];
  const matches = (path: string) => {
    const href = base + path;
    return path
      ? pathname === href || pathname.startsWith(href + "/")
      : pathname === base || pathname === base + "/dashboard";
  };
  const activeLabel = groups.flatMap(({ links }) => links).find(({ path }) => matches(path))?.label;
  const storefront = fa ? "فروشگاه" : "Storefront";

  return (
    <>
      <div className={styles.topbar}>
        <Link href={base} className={styles.brand}>
          <Image src="/brand/oosta-ai-mark.png" width={38} height={38} alt="" />
          <span>{fa ? "مدیریت اوستا" : "Oosta admin"}</span>
        </Link>
        <div className={styles.topActions}>
          <Link href={`/${locale}`} className={styles.storeLink}>
            {storefront} <span aria-hidden="true">↗</span>
          </Link>
          <button type="button" className={styles.logout} onClick={() => void logout()}>
            {fa ? "خروج" : "Sign out"}
          </button>
        </div>
      </div>
      <aside className={styles.sidebar}>
        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={open}
          aria-controls="admin-navigation"
          onClick={() => setOpen(!open)}
        >
          <span>{fa ? "منوی مدیریت" : "Admin menu"}</span>
          <span className={styles.menuCurrent}>{activeLabel}</span>
          <span className={styles.chevron} aria-hidden="true">
            {open ? "−" : "+"}
          </span>
        </button>
        <nav
          id="admin-navigation"
          aria-label={fa ? "بخش‌های مدیریت" : "Admin navigation"}
          className={styles.navigation}
          data-open={open}
        >
          {groups.map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <p>{group.label}</p>
              {group.links.map(({ path, label }) => (
                <Link
                  key={path}
                  href={base + path}
                  aria-current={matches(path) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
