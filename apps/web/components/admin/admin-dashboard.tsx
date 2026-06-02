"use client";

import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminStats } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function statusTone(s: string): "success" | "muted" | "danger" {
  if (s === "PAID") return "success";
  if (s === "PENDING" || s === "PENDING_REVIEW") return "muted";
  return "danger";
}

export function AdminDashboard({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.dash;
  const statusMap = dict.dashboard.status as Record<string, string>;
  const { data, loading } = useApi<AdminStats>(token ? "/admin/stats" : null, token ?? undefined);

  if (loading || !data) {
    return (
      <Container className="py-20 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }

  const maxRev = Math.max(1, ...data.salesByDay.map((d) => d.revenue));
  const stats = [
    { label: t.revenue, value: formatPrice(data.revenueTotal, data.currency, locale) },
    { label: t.revenue30, value: formatPrice(data.revenue30, data.currency, locale) },
    { label: t.paidOrders, value: String(data.paidOrders) },
    { label: t.customers, value: String(data.customers) },
  ];

  return (
    <Container className="space-y-6 py-8">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="relative overflow-hidden">
            <div className="absolute inset-x-0 -top-10 h-20 bg-brand-gradient opacity-10 blur-2xl" />
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">{t.orders}</p>
          <p className="mt-1 text-xl font-semibold">{data.totalOrders}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{t.pendingReview}</p>
          <p className="mt-1 text-xl font-semibold text-primary">{data.pendingReview}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{t.customers}</p>
          <p className="mt-1 text-xl font-semibold">{data.customers}</p>
        </Card>
      </div>

      {/* Sales chart */}
      <Card>
        <h2 className="mb-4 font-semibold">{t.salesChart}</h2>
        {data.salesByDay.length === 0 ? (
          <p className="text-sm text-muted">{t.noData}</p>
        ) : (
          <div className="flex h-40 items-end gap-1.5">
            {data.salesByDay.map((d) => (
              <div
                key={d.day}
                className="group flex flex-1 flex-col items-center justify-end gap-1"
              >
                <div
                  className="w-full rounded-t bg-brand-gradient transition-all"
                  style={{ height: `${Math.max(4, (d.revenue / maxRev) * 100)}%` }}
                  title={`${d.day}: ${formatPrice(d.revenue, data.currency, locale)} (${d.count})`}
                />
                <span className="text-[10px] text-muted">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top products */}
        <Card>
          <h2 className="mb-3 font-semibold">{t.topProducts}</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted">{t.noData}</p>
          ) : (
            <div className="space-y-2">
              {data.topProducts.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    {p.name}
                  </span>
                  <span className="text-muted">
                    {p.unitsSold} {t.unitsSold}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Low stock */}
        <Card>
          <h2 className="mb-3 font-semibold">{t.lowStock}</h2>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-muted">{t.noData}</p>
          ) : (
            <div className="space-y-2">
              {data.lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <Badge tone={p.stock === 0 ? "danger" : "muted"}>{p.stock}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent orders */}
      <Card>
        <h2 className="mb-3 font-semibold">{t.recentOrders}</h2>
        {data.recentOrders.length === 0 ? (
          <p className="text-sm text-muted">{t.noData}</p>
        ) : (
          <div className="space-y-2">
            {data.recentOrders.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0"
              >
                <div>
                  <span className="font-medium">#{o.id.slice(-8)}</span>{" "}
                  <span className="text-muted">
                    {o.user.name} · {o.user.email ?? o.user.phone ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted">{formatDate(o.createdAt, locale)}</span>
                  <span className="font-semibold">
                    {formatPrice(o.totalAmount, o.currency, locale)}
                  </span>
                  <Badge tone={statusTone(o.paymentStatus)}>
                    {statusMap[o.paymentStatus] ?? o.paymentStatus}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Container>
  );
}
