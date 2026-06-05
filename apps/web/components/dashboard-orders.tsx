"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { OrderSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function statusTone(status: string): "success" | "muted" | "danger" {
  if (status === "PAID") return "success";
  if (status === "PENDING") return "muted";
  return "danger";
}

export function DashboardOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const { data, loading } = useApi<{ orders: OrderSummary[] }>(
    token ? "/orders" : null,
    token ?? undefined,
  );
  const d = dict.dashboard;
  const statusMap = d.status as Record<string, string>;

  return (
    <Container className="py-10 animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold">{d.orders}</h1>
      {loading ? (
        <Spinner className="size-6" />
      ) : !data || data.orders.length === 0 ? (
        <p className="text-muted">{d.noOrders}</p>
      ) : (
        <div className="space-y-3">
          {data.orders.map((order) => (
            <Link key={order.id} href={`/${locale}/dashboard/orders/${order.id}`} className="block">
              <Card className="flex items-center justify-between gap-4 transition-colors hover:border-primary">
                <div>
                  <p className="font-medium">
                    {d.orderNo} #{order.id.slice(-8)}
                  </p>
                  <p className="text-sm text-muted">
                    {formatDate(order.createdAt, locale)} · {order.itemCount} {d.items}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold">
                    {formatPrice(order.totalAmount, order.currency, locale)}
                  </span>
                  <Badge tone={statusTone(order.paymentStatus)}>
                    {statusMap[order.paymentStatus] ?? order.paymentStatus}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
