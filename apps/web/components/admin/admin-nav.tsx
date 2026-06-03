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
  };
}) {
  const pathname = usePathname();
  const base = `/${locale}/admin`;
  const dashHref = `${base}/dashboard`;
  const ordersHref = `${base}/orders`;
  const receiptsHref = `${base}/receipts`;
  const reviewsHref = `${base}/reviews`;
  const ticketsHref = `${base}/tickets`;
  const blogHref = `${base}/blog`;
  const apiHref = `${base}/api-keys`;
  const onDash = pathname.startsWith(dashHref);
  const onOrders = pathname.startsWith(ordersHref);
  const onReceipts = pathname.startsWith(receiptsHref);
  const onReviews = pathname.startsWith(reviewsHref);
  const onTickets = pathname.startsWith(ticketsHref);
  const onBlog = pathname.startsWith(blogHref);
  const onApi = pathname.startsWith(apiHref);

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
        <Link href={dashHref} className={tab(onDash)}>
          {labels.dashboard}
        </Link>
        <Link
          href={base}
          className={tab(
            !onDash && !onOrders && !onReceipts && !onReviews && !onTickets && !onBlog && !onApi,
          )}
        >
          {labels.products}
        </Link>
        <Link href={ordersHref} className={tab(onOrders)}>
          {labels.orders}
        </Link>
        <Link href={receiptsHref} className={tab(onReceipts)}>
          {labels.receipts}
        </Link>
        <Link href={reviewsHref} className={tab(onReviews)}>
          {labels.reviews}
        </Link>
        <Link href={ticketsHref} className={tab(onTickets)}>
          {labels.tickets}
        </Link>
        <Link href={blogHref} className={tab(onBlog)}>
          {labels.blog}
        </Link>
        <Link href={apiHref} className={tab(onApi)}>
          {labels.api}
        </Link>
      </Container>
    </div>
  );
}
