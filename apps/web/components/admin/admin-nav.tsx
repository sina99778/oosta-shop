"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { Locale } from "@/lib/i18n";
import styles from "./admin.module.css";

// Figma "07 — پنل مدیریت" sidebar icons, keyed by section path.
const icons: Record<string, string> = {
  "": "M4 19V5 M4 19h16 M8 15l3-4 3 2 5-6",
  "/orders": "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z M4 7.5l8 4.5 8-4.5 M12 12v9",
  "/orders#supplier-orders":
    "M3 7h11v9H3z M14 10h4l3 3v3h-7 M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  "/receipts": "M6 3h12v18l-3-2-3 2-3-2-3 2V3Z M9 8h6 M9 12h6",
  "/tickets": "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  "/products": "M4 9h16l-1 11H5L4 9Z M8 9V7a4 4 0 0 1 8 0v2",
  "/suppliers":
    "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M22 19v-1a4 4 0 0 0-3-3.9 M16 4.1a3 3 0 0 1 0 5.8",
  "/reviews": "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  "/blog": "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z M9 8h6 M9 12h6",
  "/settings":
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M4 12h2 M18 12h2 M12 4v2 M12 18v2 M6.3 6.3l1.4 1.4 M16.3 16.3l1.4 1.4 M6.3 17.7l1.4-1.4 M16.3 7.7l1.4-1.4",
  "/api-keys": "M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7Z",
};

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[path] ?? icons[""]} />
    </svg>
  );
}

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
  const { logout, token, user } = useAuth();
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
  const groups: { label: string; links: { path: string; label: string; count?: number }[] }[] = [
    {
      label: fa ? "عملیات فروش" : "Operations",
      links: [
        { path: "", label: fa ? "نمای کلی" : "Overview" },
        { path: "/orders", label: labels.orders },
        ...(supplierQueue?.enabled
          ? [
              {
                path: "/orders#supplier-orders",
                label: fa ? "سفارش‌های تأمین‌کننده" : "Supplier orders",
                count: supplierQueue.count,
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
          <Image src="/brand/oosta-mark-v1-96.webp" width={38} height={38} alt="" />
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
        <Link href={base} className={styles.sideBrand}>
          <Image src="/brand/oosta-mark-v1-96.webp" width={40} height={40} alt="" />
          <span>
            <strong>{fa ? "مدیریت اوستا" : "Oosta admin"}</strong>
            {user?.email && (
              <small>
                <bdi>{user.email}</bdi>
              </small>
            )}
          </span>
        </Link>
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
              {group.links.map(({ path, label, count }) => (
                <Link
                  key={path}
                  href={base + path}
                  aria-current={matches(path) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <NavIcon path={path} />
                  <span className={styles.navText}>{label}</span>
                  {count ? (
                    <span className={styles.navCount}>
                      {count.toLocaleString(fa ? "fa-IR" : "en-US")}
                      <span className="sr-only">{fa ? " در صف" : " waiting"}</span>
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          <Link href={`/${locale}`} className={styles.backToStore}>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            {fa ? "بازگشت به فروشگاه" : "Back to the store"}
          </Link>
          <button type="button" className={styles.sideLogout} onClick={() => void logout()}>
            {fa ? "خروج" : "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}
