"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n";

export function AdminNav({
  locale,
  labels,
}: {
  locale: Locale;
  labels: {
    dashboard: string;
    products: string;
    orders: string;
    receipts: string;
    reviews: string;
    tickets: string;
    blog: string;
    api: string;
    settings: string;
  };
}) {
  const pathname = usePathname();
  const base = `/${locale}/admin`;

  const tabs = [
    { href: `${base}/dashboard`, label: labels.dashboard },
    { href: base, label: labels.products, exactish: true },
    { href: `${base}/orders`, label: labels.orders },
    { href: `${base}/receipts`, label: labels.receipts },
    { href: `${base}/reviews`, label: labels.reviews },
    { href: `${base}/tickets`, label: labels.tickets },
    { href: `${base}/blog`, label: labels.blog },
    { href: `${base}/api-keys`, label: labels.api },
    { href: `${base}/settings`, label: labels.settings },
  ];

  // "Products" is the catch-all tab: active only when no other tab matches.
  const otherActive = tabs.some((t) => !t.exactish && pathname.startsWith(t.href));

  const tab = (active: boolean) =>
    cn(
      "whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors",
      active
        ? "border-primary text-foreground"
        : "border-transparent text-muted hover:text-foreground",
    );

  return (
    <div className="border-b border-border">
      <Container className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={tab(t.exactish ? !otherActive : pathname.startsWith(t.href))}
          >
            {t.label}
          </Link>
        ))}
      </Container>
    </div>
  );
}
