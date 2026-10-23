"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CredentialField } from "@/components/credential-field";
import { orderStatusTone } from "@/lib/order-status";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Credential, OrderDetail as OrderDetailDto } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

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
  const [waiting, setWaiting] = useState(false);
  // While the order is still moving (awaiting payment/review/restock), poll so
  // the vault opens by itself the moment it is delivered.
  const { data, loading, error } = useApi<{ order: OrderDetailDto }>(
    token ? `/orders/${orderId}` : null,
    token ?? undefined,
    { refreshMs: waiting ? 15_000 : undefined },
  );
  const d = dict.dashboard;
  const statusMap = d.status as Record<string, string>;
  const status = data?.order.paymentStatus;

  useEffect(() => {
    const live =
      status === "PENDING_REVIEW" || status === "PAID_UNFULFILLED" || status === "PENDING";
    queueMicrotask(() => setWaiting(live));
  }, [status]);

  if (loading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-8 w-56" />
        <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
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
    <Container className="py-10 animate-fade-in">
      <Link href={`/${locale}/dashboard`} className="text-sm text-muted hover:text-foreground">
        ← {d.backToDashboard}
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {d.orderNo} #{order.id.slice(-8)}
        </h1>
        <Badge tone={orderStatusTone(order.paymentStatus)}>
          {statusMap[order.paymentStatus] ?? order.paymentStatus}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        {formatDate(order.createdAt, locale)} ·{" "}
        {formatPrice(order.totalAmount, order.currency, locale)}
      </p>

      {order.paymentStatus === "PAID_UNFULFILLED" && (
        <Card className="mt-4 border-primary/40" role="status">
          <p className="text-sm">{d.unfulfilledBody}</p>
          <Link
            href={`/${locale}/support`}
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            {dict.checkout.contactSupport}
          </Link>
          <p className="mt-2 text-xs text-muted">{d.autoRefresh}</p>
        </Card>
      )}

      {order.paymentProvider === "CARD_TO_CARD" && order.cardToCard && (
        <Card className="mt-4" role="status">
          {order.paymentStatus === "PENDING_REVIEW" ? (
            <>
              <p className="text-sm">{d.awaitingReview}</p>
              <p className="mt-1 text-xs text-muted">
                {d.reviewEta} {d.autoRefresh}
              </p>
            </>
          ) : (
            <>
              {order.expiresAt && (
                <p className="mb-3 text-sm text-muted">
                  {d.reservedUntil}{" "}
                  <strong className="text-foreground">{formatDate(order.expiresAt, locale)}</strong>
                </p>
              )}
              <Link href={`/${locale}/checkout/card/${order.id}`}>
                <Button>{d.completePayment}</Button>
              </Link>
            </>
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
