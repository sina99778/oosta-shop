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
  labels: { products: string; orders: string };
}) {
  const pathname = usePathname();
  const base = `/${locale}/admin`;
  const ordersHref = `${base}/orders`;
  const onOrders = pathname.startsWith(ordersHref);

  const tab = (active: boolean) =>
    cn(
      "border-b-2 px-4 py-3 text-sm transition-colors",
      active
        ? "border-primary text-foreground"
        : "border-transparent text-muted hover:text-foreground",
    );

  return (
    <div className="border-b border-border">
      <Container className="flex gap-1">
        <Link href={base} className={tab(!onOrders)}>
          {labels.products}
        </Link>
        <Link href={ordersHref} className={tab(onOrders)}>
          {labels.orders}
        </Link>
      </Container>
    </div>
  );
}
