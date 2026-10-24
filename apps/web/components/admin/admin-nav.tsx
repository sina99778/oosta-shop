"use client";

// Admin shell — the "sorting room". Desktop: a grouped sidebar beside the page.
// Phones/tablets: the same links as a scrollable strip above the page.

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandStamp } from "@/components/stamp";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n";

type Labels = {
  dashboard: string;
  products: string;
  orders: string;
  receipts: string;
  reviews: string;
  tickets: string;
  blog: string;
  api: string;
  settings: string;
  sidebarTitle: string;
  sidebarSubtitle: string;
  groupSales: string;
  groupCatalog: string;
  groupCustomers: string;
  groupSystem: string;
  backToStore: string;
};

type IconName =
  | "desk"
  | "products"
  | "orders"
  | "receipts"
  | "reviews"
  | "tickets"
  | "blog"
  | "api"
  | "settings";

const ICONS: Record<IconName, string> = {
  desk: "M4 5h16v10H4zM2 19h20M9 15v4M15 15v4",
  products: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h3",
  orders: "M3 6h18v13H3zM3.5 7l8.5 6.5L20.5 7",
  receipts: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  reviews: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
  tickets: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
  blog: "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 16h6",
  api: "M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-2-4-2 .5-1.5-1.5L16 4l-4-1-1 2H9L8 3 4 4l.5 2L3 7.5 1 7v5l2 1v2l-2 1 1 4 2-.5L5.5 19 5 21l4 1 1-2h2l1 2 4-1-.5-2 1.5-1.5 2 .5 1-4-2-1z",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
      className="shrink-0"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function AdminShell({
  locale,
  labels,
  children,
}: {
  locale: Locale;
  labels: Labels;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const base = `/${locale}/admin`;

  const groups: {
    title: string;
    items: { href: string; label: string; icon: IconName; exactish?: boolean }[];
  }[] = [
    {
      title: labels.groupSales,
      items: [
        { href: `${base}/dashboard`, label: labels.dashboard, icon: "desk" },
        { href: `${base}/orders`, label: labels.orders, icon: "orders" },
        { href: `${base}/receipts`, label: labels.receipts, icon: "receipts" },
      ],
    },
    {
      title: labels.groupCatalog,
      items: [
        { href: base, label: labels.products, icon: "products", exactish: true },
        { href: `${base}/reviews`, label: labels.reviews, icon: "reviews" },
        { href: `${base}/blog`, label: labels.blog, icon: "blog" },
      ],
    },
    {
      title: labels.groupCustomers,
      items: [{ href: `${base}/tickets`, label: labels.tickets, icon: "tickets" }],
    },
    {
      title: labels.groupSystem,
      items: [
        { href: `${base}/settings`, label: labels.settings, icon: "settings" },
        { href: `${base}/api-keys`, label: labels.api, icon: "api" },
      ],
    },
  ];
  const all = groups.flatMap((g) => g.items);
  // "Products" lives at /admin itself, so it is active only when no other section matches.
  const otherActive = all.some((t) => !t.exactish && pathname.startsWith(t.href));
  const isActive = (t: (typeof all)[number]) =>
    t.exactish ? !otherActive : pathname.startsWith(t.href);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col lg:flex-row">
      {/* Phones/tablets: section strip */}
      <nav
        aria-label={labels.sidebarTitle}
        className="flex gap-1 overflow-x-auto border-b border-border px-4 lg:hidden"
      >
        {all.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive(t) ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors",
              isActive(t)
                ? "border-primary font-bold text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            <Icon name={t.icon} />
            {t.label}
          </Link>
        ))}
      </nav>

      {/* Desktop: sidebar */}
      <aside className="hidden w-64 shrink-0 border-e border-border lg:block">
        <div className="sticky top-[70px] flex max-h-[calc(100vh-70px)] flex-col gap-6 overflow-y-auto px-4 py-6">
          <div className="flex items-center gap-3 rounded-[12px] bg-ink p-3 text-[#f3eee4]">
            <BrandStamp hole="var(--c-ink)" className="size-9" />
            <span className="flex flex-col leading-tight">
              <strong className="text-sm">{labels.sidebarTitle}</strong>
              <span className="text-[11px] text-[#c3cad6]">{labels.sidebarSubtitle}</span>
            </span>
          </div>
          <nav aria-label={labels.sidebarTitle} className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.title}>
                <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wide text-muted">
                  {g.title}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((t) => (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        aria-current={isActive(t) ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors",
                          isActive(t)
                            ? "bg-card font-bold text-foreground shadow-card ring-1 ring-border"
                            : "text-muted hover:bg-surface hover:text-foreground",
                        )}
                      >
                        <span className={isActive(t) ? "text-primary" : undefined}>
                          <Icon name={t.icon} />
                        </span>
                        {t.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <Link
            href={`/${locale}`}
            className="mt-auto border-t border-dashed border-border px-3 pt-4 text-xs text-muted hover:text-primary"
          >
            → {labels.backToStore}
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
