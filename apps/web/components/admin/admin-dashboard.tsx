"use client";

// Admin "desk": what needs doing now (receipts, unfulfilled paid orders, low
// stock), the money, and the latest envelopes — in the Digital Post language.

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Envelope, ProductStamp, StampArt, StatusPostmark } from "@/components/stamp";
import { postmarkTone } from "@/lib/order-status";
import { formatDate, formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n";
import type { AdminStats } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-[14px] border border-border bg-card p-5 shadow-card", className)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AdminDashboard({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.dash;
  const short = dict.dashboard.statusShort as Record<string, string>;
  const base = `/${locale}/admin`;
  const { data, loading } = useApi<AdminStats>(token ? "/admin/stats" : null, token ?? undefined);
  const num = (n: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);

  if (loading || !data) {
    return (
      <Container className="space-y-6 py-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-28 rounded-[14px]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-56 rounded-[14px]" />
      </Container>
    );
  }

  const urgent = [
    {
      count: data.pendingReview,
      label: t.urgentReceipts,
      href: `${base}/receipts`,
    },
    { count: data.unfulfilled ?? 0, label: t.urgentUnfulfilled, href: `${base}/orders` },
    {
      count: data.lowStock.filter((p) => p.stock === 0).length,
      label: t.urgentLowStock,
      href: base,
    },
  ].filter((u) => u.count > 0);

  const maxRev = Math.max(1, ...data.salesByDay.map((d) => d.revenue));
  const kpis: { label: string; value: string; art: "knot" | "burst" | "grid" | "person" }[] = [
    {
      label: dict.admin.dash.revenue,
      value: formatPrice(data.revenueTotal, data.currency, locale),
      art: "burst",
    },
    {
      label: dict.admin.dash.revenue30,
      value: formatPrice(data.revenue30, data.currency, locale),
      art: "knot",
    },
    { label: dict.admin.dash.paidOrders, value: num(data.paidOrders), art: "grid" },
    { label: dict.admin.dash.customers, value: num(data.customers), art: "person" },
  ];

  return (
    <Container className="space-y-6 py-8">
      <header>
        <h1 className="text-3xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
      </header>

      {/* What needs a human right now */}
      <Envelope>
        <div className="flex flex-wrap items-center gap-5 p-5">
          <StatusPostmark
            label={
              <span className="text-2xl font-black">
                {urgent.length ? num(urgent.reduce((s, u) => s + u.count, 0)) : "✓"}
              </span>
            }
            tone={urgent.length ? "progress" : "delivered"}
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold">{t.urgentTitle}</h2>
            {urgent.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{t.urgentNone}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {urgent.map((u) => (
                  <li key={u.label} className="flex flex-wrap items-center gap-x-3 text-sm">
                    <span>
                      <strong className="text-primary">{num(u.count)}</strong> {u.label}
                    </span>
                    <Link href={u.href} className="font-bold text-primary hover:underline">
                      {t.review} ←
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Envelope>

      {/* Money */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex items-center gap-3 rounded-[14px] border border-border bg-card p-4 shadow-card"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface text-primary">
              <StampArt kind={k.art} className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted">{k.label}</span>
              <span className="block text-base font-black sm:text-lg">{k.value}</span>
            </span>
          </div>
        ))}
      </div>

      <Panel title={t.salesChart}>
        {data.salesByDay.length === 0 ? (
          <p className="text-sm text-muted">{t.noData}</p>
        ) : (
          <div
            className="flex h-44 items-end gap-1.5 border-b border-dashed border-border"
            role="img"
            aria-label={t.salesChart}
          >
            {data.salesByDay.map((d) => (
              <div
                key={d.day}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <div
                  className="w-full max-w-10 rounded-t-[4px] bg-primary/85 transition-colors hover:bg-primary"
                  style={{ height: `${Math.max(4, (d.revenue / maxRev) * 100)}%` }}
                  title={`${d.day}: ${formatPrice(d.revenue, data.currency, locale)} (${d.count})`}
                />
                <span className="pb-1 text-[10px] text-muted" dir="ltr">
                  {d.day.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t.topProducts}>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted">{t.noData}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-dashed divide-border">
              {data.topProducts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 text-center text-sm font-black text-muted">
                    {num(i + 1)}
                  </span>
                  <ProductStamp
                    slug={p.slug}
                    type={p.type}
                    name={p.name}
                    size="xs"
                    hole="var(--c-card)"
                  />
                  <bdi className="min-w-0 flex-1 truncate text-sm font-bold">{p.name}</bdi>
                  <span className="text-sm text-muted">
                    {num(p.unitsSold)} {dict.admin.dash.unitsSold}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={t.lowStock}>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-muted">{t.noData}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-dashed divide-border">
              {data.lowStock.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`${base}/products/${p.id}`}
                    className="flex items-center gap-3 py-2.5 hover:text-primary"
                  >
                    <ProductStamp
                      slug={p.slug}
                      type={p.type}
                      name={p.name}
                      size="xs"
                      hole="var(--c-card)"
                    />
                    <bdi className="min-w-0 flex-1 truncate text-sm font-bold">{p.name}</bdi>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                        p.stock === 0 ? "bg-danger/15 text-danger" : "bg-surface text-foreground",
                      )}
                    >
                      {num(p.stock)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title={t.recentOrders}
        action={
          <Link href={`${base}/orders`} className="text-sm font-bold text-primary hover:underline">
            {t.allOrders}
          </Link>
        }
      >
        {data.recentOrders.length === 0 ? (
          <p className="text-sm text-muted">{t.noData}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-dashed divide-border">
            {data.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center gap-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted" dir="ltr">
                    #{o.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="mt-0.5 truncate">
                    <strong>{o.user.name}</strong>{" "}
                    <span className="text-muted" dir="ltr">
                      {o.user.email ?? o.user.phone ?? "—"}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-muted">
                    <span>{formatDate(o.createdAt, locale)}</span>
                    <strong className="text-foreground">
                      {formatPrice(o.totalAmount, o.currency, locale)}
                    </strong>
                  </p>
                </div>
                <StatusPostmark
                  label={short[o.paymentStatus] ?? o.paymentStatus}
                  tone={postmarkTone(o.paymentStatus)}
                  className="size-[58px] text-[9px]"
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Container>
  );
}
