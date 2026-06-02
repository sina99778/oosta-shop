"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CredentialField } from "@/components/credential-field";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Credential, OrderDetail as OrderDetailDto } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function statusTone(status: string): "success" | "muted" | "danger" {
  if (status === "PAID") return "success";
  if (status === "PENDING" || status === "PENDING_REVIEW") return "muted";
  return "danger";
}

export function OrderDetail({
  locale,
  orderId,
  dict,
}: {
  locale: Locale;
  orderId: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const { data, loading, error } = useApi<{ order: OrderDetailDto }>(
    token ? `/orders/${orderId}` : null,
    token ?? undefined,
  );
  const d = dict.dashboard;
  const statusMap = d.status as Record<string, string>;

  if (loading) {
    return (
      <Container className="py-20 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }
  if (error || !data) {
    return (
      <Container className="py-20 text-center text-muted">{dict.common.somethingWrong}</Container>
    );
  }

  const order = data.order;

  return (
    <Container className="py-10">
      <Link href={`/${locale}/dashboard`} className="text-sm text-muted hover:text-foreground">
        ← {d.backToDashboard}
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {d.orderNo} #{order.id.slice(-8)}
        </h1>
        <Badge tone={statusTone(order.paymentStatus)}>
          {statusMap[order.paymentStatus] ?? order.paymentStatus}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        {formatDate(order.createdAt, locale)} ·{" "}
        {formatPrice(order.totalAmount, order.currency, locale)}
      </p>

      {order.paymentProvider === "CARD_TO_CARD" && order.paymentStatus !== "PAID" && (
        <Card className="mt-4">
          {order.paymentStatus === "PENDING_REVIEW" ? (
            <p className="text-sm text-muted">{d.awaitingReview}</p>
          ) : (
            <Link href={`/${locale}/checkout/card/${order.id}`}>
              <Button>{d.completePayment}</Button>
            </Link>
          )}
        </Card>
      )}

      <div className="mt-6 space-y-4">
        {order.items.map((item) => (
          <Card key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{item.product.name}</p>
                <p className="text-sm text-muted">
                  {item.plan.label} · ×{item.quantity}
                </p>
              </div>
              <span className="font-semibold">
                {formatPrice(item.lineTotal, order.currency, locale)}
              </span>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">{d.vault}</p>
              {item.credentials.length === 0 ? (
                <p className="text-sm text-muted">{d.noCredentials}</p>
              ) : (
                <div className="space-y-2">
                  {item.credentials.map((cred) => (
                    <CredentialBlock key={cred.id} cred={cred} dict={dict} />
                  ))}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Container>
  );
}

function CredentialBlock({ cred, dict }: { cred: Credential; dict: Dictionary }) {
  const d = dict.dashboard;
  const labels = { reveal: d.reveal, hide: d.hide, copy: d.copy, copied: d.copied };
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      {cred.accountEmail && (
        <CredentialField label={d.fields.accountEmail} value={cred.accountEmail} {...labels} />
      )}
      {cred.accountPassword && (
        <CredentialField
          label={d.fields.accountPassword}
          value={cred.accountPassword}
          {...labels}
        />
      )}
      {cred.licenseKey && (
        <CredentialField label={d.fields.licenseKey} value={cred.licenseKey} {...labels} />
      )}
      {cred.giftCardCode && (
        <CredentialField label={d.fields.giftCardCode} value={cred.giftCardCode} {...labels} />
      )}
    </div>
  );
}
