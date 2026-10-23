"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CredentialField } from "@/components/credential-field";
import { Envelope, ProductStamp, StatusPostmark } from "@/components/stamp";
import { postmarkTone } from "@/lib/order-status";
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
  const short = d.statusShort as Record<string, string>;
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
        → {d.backToDashboard}
      </Link>

      <Envelope className="mt-4">
        <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted" dir="ltr">
              #{order.id.slice(-8).toUpperCase()}
            </p>
            <h1 className="mt-1 text-2xl font-black">
              {d.orderNo} #{order.id.slice(-8)}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {formatDate(order.createdAt, locale)} ·{" "}
              <strong className="text-foreground">
                {formatPrice(order.totalAmount, order.currency, locale)}
              </strong>
            </p>
            <p className="mt-1 text-xs text-muted">
              {statusMap[order.paymentStatus] ?? order.paymentStatus}
            </p>
          </div>
          <StatusPostmark
            label={short[order.paymentStatus] ?? order.paymentStatus}
            tone={postmarkTone(order.paymentStatus)}
            className="size-[92px] text-xs"
          />
        </div>
      </Envelope>

      {order.paymentStatus === "PAID_UNFULFILLED" && (
        <Card className="mt-4 rounded-[14px] border-primary/40" role="status">
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
        <Card className="mt-4 rounded-[14px]" role="status">
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
          <div
            key={item.id}
            className="overflow-hidden rounded-[14px] border border-border bg-card shadow-card"
          >
            <div className="flex items-center gap-4 p-5">
              <ProductStamp
                slug={item.product.slug}
                type={item.product.type}
                name={item.product.name}
                size="sm"
                tilt={-3}
                hole="var(--c-card)"
              />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">
                  <bdi>{item.product.name}</bdi>
                </p>
                <p className="text-sm text-muted">
                  <bdi>{item.plan.label}</bdi> · ×{item.quantity}
                </p>
              </div>
              <span className="shrink-0 font-bold">
                {formatPrice(item.lineTotal, order.currency, locale)}
              </span>
            </div>

            <div className="border-t border-dashed border-border bg-surface/60 p-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-extrabold">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                {d.vault}
              </p>
              {item.credentials.length === 0 ? (
                <p className="text-sm text-muted">{d.noCredentials}</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {item.credentials.map((cred) => (
                      <CredentialBlock key={cred.id} cred={cred} dict={dict} />
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-6 text-muted">{d.privateNote}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

function CredentialBlock({ cred, dict }: { cred: Credential; dict: Dictionary }) {
  const d = dict.dashboard;
  const labels = { reveal: d.reveal, hide: d.hide, copy: d.copy, copied: d.copied };
  return (
    <div className="space-y-2 rounded-[10px] border border-dashed border-border bg-card p-3">
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
