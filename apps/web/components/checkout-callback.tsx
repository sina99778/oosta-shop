"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function CheckoutCallback({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState(dict.checkout.verifying);
  // Paid, but stock ran out at the same moment — shown here instead of the
  // generic "failed" page, because the money WAS taken and the buyer must not pay again.
  const [unfulfilledOrder, setUnfulfilledOrder] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const authority = searchParams.get("Authority");
    const status = searchParams.get("Status");
    if (!authority || !status) {
      queueMicrotask(() => setMessage(dict.checkout.missingParams));
      return;
    }

    api
      .post<{ status: string; orderId?: string }>("/payments/verify", { authority, status })
      .then((res) => {
        if (res.status === "unfulfilled" && res.orderId) {
          setUnfulfilledOrder(res.orderId);
          return;
        }
        const order = res.orderId ? `?order=${encodeURIComponent(res.orderId)}` : "";
        router.replace(
          res.status === "paid"
            ? `/${locale}/checkout/success${order}`
            : `/${locale}/checkout/cancel`,
        );
      })
      .catch(() => {
        router.replace(`/${locale}/checkout/cancel`);
      });
  }, [searchParams, router, locale, dict]);

  if (unfulfilledOrder) {
    const c = dict.checkout;
    return (
      <Container className="flex justify-center py-20">
        <div
          role="status"
          className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-card"
        >
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/15 text-2xl">
            ⏳
          </div>
          <h1 className="text-xl font-bold">{c.unfulfilledTitle}</h1>
          <p className="mt-2 text-sm text-muted">{c.unfulfilledBody}</p>
          <p className="mt-3 text-sm">
            {c.orderRef}:{" "}
            <span dir="ltr" className="font-mono">
              #{unfulfilledOrder.slice(-8)}
            </span>
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={`/${locale}/dashboard/orders/${unfulfilledOrder}`}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              {c.viewOrders}
            </Link>
            <Link
              href={`/${locale}/support`}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm hover:bg-surface"
            >
              {c.contactSupport}
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-24 text-center">
      <Spinner className="size-6" />
      <p className="mt-4 text-muted">{message}</p>
    </Container>
  );
}
