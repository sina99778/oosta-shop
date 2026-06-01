"use client";

import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type AdminOrder = {
  id: string;
  totalAmount: number;
  currency: string;
  paymentStatus: string;
  itemCount: number;
  createdAt: string;
  user: { name: string; email: string | null; phone: string | null };
};

function statusTone(status: string): "success" | "muted" | "danger" {
  if (status === "PAID") return "success";
  if (status === "PENDING") return "muted";
  return "danger";
}

export function AdminOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin;
  const { data, loading } = useApi<{ items: AdminOrder[] }>(
    token ? "/admin/orders" : null,
    token ?? undefined,
  );
  const statusMap = dict.dashboard.status as Record<string, string>;

  return (
    <Container className="py-8">
      {loading ? (
        <Spinner className="size-6" />
      ) : !data || data.items.length === 0 ? (
        <p className="text-muted">{t.noOrders}</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((order) => (
            <Card key={order.id} className="flex items-center justify-between gap-4 text-sm">
              <div>
                <p className="font-medium">#{order.id.slice(-8)}</p>
                <p className="text-muted">
                  {order.user.name} · {order.user.email ?? order.user.phone ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted">{formatDate(order.createdAt, locale)}</span>
                <span className="font-semibold">
                  {formatPrice(order.totalAmount, order.currency, locale)}
                </span>
                <Badge tone={statusTone(order.paymentStatus)}>
                  {statusMap[order.paymentStatus] ?? order.paymentStatus}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
