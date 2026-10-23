"use client";

// The buyer's "vault": every order is an envelope with its products' stamps and
// a postmark showing where it is (delivered, awaiting payment, in review…).

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Envelope, ProductStamp, StatusPostmark } from "@/components/stamp";
import { postmarkTone } from "@/lib/order-status";
import { formatDate, formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { OrderSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function DashboardOrders({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { user, token } = useAuth();
  const { data, loading } = useApi<{ orders: OrderSummary[] }>(
    token ? "/orders" : null,
    token ?? undefined,
  );
  const d = dict.dashboard;
  const short = d.statusShort as Record<string, string>;
  const orders = data?.orders ?? [];
  const num = (n: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);

  const delivered = orders.filter((o) => o.paymentStatus === "PAID");
  const waiting = orders.filter((o) => postmarkTone(o.paymentStatus) === "progress");
  const spent = delivered.reduce((sum, o) => sum + o.totalAmount, 0);
  const currency = delivered[0]?.currency ?? "IRR";

  return (
    <Container className="py-10 animate-fade-in">
      <header className="flex flex-col gap-1">
        {user && <span className="text-sm text-muted">{user.name}</span>}
        <h1 className="text-3xl font-black">{d.orders}</h1>
        <p className="text-sm text-muted">{d.vaultSubtitle}</p>
      </header>

      {!loading && orders.length > 0 && (
        <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-border bg-border text-center">
          <div className="bg-card px-2 py-4">
            <dt className="text-xs text-muted">{d.statDelivered}</dt>
            <dd className="mt-1 text-xl font-black">{num(delivered.length)}</dd>
          </div>
          <div className="bg-card px-2 py-4">
            <dt className="text-xs text-muted">{d.statWaiting}</dt>
            <dd className="mt-1 text-xl font-black">{num(waiting.length)}</dd>
          </div>
          <div className="bg-card px-2 py-4">
            <dt className="text-xs text-muted">{d.statSpent}</dt>
            <dd className="mt-1 text-base font-black sm:text-xl">
              {formatPrice(spent, currency, locale)}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-[14px]" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <Envelope className="text-center">
            <div className="px-6 py-12">
              <div className="mx-auto flex w-fit -space-x-4 rtl:space-x-reverse">
                <ProductStamp slug="chatgpt" type="ACCOUNT" name="" size="sm" tilt={-6} />
                <ProductStamp slug="windows" type="LICENSE" name="" size="sm" tilt={5} />
              </div>
              <h2 className="mt-6 text-lg font-extrabold">{d.noOrders}</h2>
              <p className="mt-1 text-sm text-muted">{d.emptyBody}</p>
              <Link
                href={`/${locale}/products`}
                className="mt-5 inline-flex h-11 items-center rounded-[10px] bg-primary px-5 font-bold text-primary-foreground hover:bg-primary-hover"
              >
                {d.browse}
              </Link>
            </div>
          </Envelope>
        ) : (
          <ul className="space-y-4">
            {orders.map((order) => {
              const tone = postmarkTone(order.paymentStatus);
              const needsPayment =
                order.paymentProvider === "CARD_TO_CARD" &&
                ["PENDING", "REJECTED", "EXPIRED"].includes(order.paymentStatus);
              const href = needsPayment
                ? `/${locale}/checkout/card/${order.id}`
                : `/${locale}/dashboard/orders/${order.id}`;
              return (
                <li key={order.id}>
                  <Link href={href} className="group block">
                    <Envelope className="transition-colors group-hover:border-primary/50">
                      <div className="flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
                        <div className="hidden w-[130px] shrink-0 sm:block">
                          <div className="flex ps-1">
                            {(order.products ?? []).map((p, i) => (
                              <ProductStamp
                                key={`${p.slug}-${i}`}
                                slug={p.slug}
                                type={p.type}
                                name={p.name}
                                size="sm"
                                tilt={i % 2 === 0 ? -4 : 5}
                                hole="var(--c-card)"
                                className={i > 0 ? "-ms-7" : undefined}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs text-muted" dir="ltr">
                            #{order.id.slice(-8).toUpperCase()}
                          </p>
                          <p className="mt-1 truncate font-extrabold">
                            <bdi>
                              {(order.products ?? []).map((p) => p.name).join("، ") ||
                                `${d.orderNo} #${order.id.slice(-8)}`}
                            </bdi>
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {formatDate(order.createdAt, locale)} · {num(order.itemCount)}{" "}
                            {d.itemsInEnvelope}
                          </p>
                          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <strong>
                              {formatPrice(order.totalAmount, order.currency, locale)}
                            </strong>
                            <span className="text-sm font-bold text-primary group-hover:underline">
                              {needsPayment
                                ? d.completePayment
                                : tone === "delivered"
                                  ? d.openEnvelope
                                  : d.viewDetails}{" "}
                              ←
                            </span>
                          </p>
                        </div>
                        <StatusPostmark
                          label={short[order.paymentStatus] ?? order.paymentStatus}
                          tone={tone}
                        />
                      </div>
                    </Envelope>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Container>
  );
}
