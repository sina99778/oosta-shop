"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useApi } from "@/lib/use-api";
import { ApiError } from "@/lib/api";
import { placeOrder } from "@/lib/checkout";
import { formatPrice } from "@/lib/format";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import type { Locale } from "@/lib/i18n";
import type { PaymentConfig, PaymentMethod } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function CartView({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const cart = useCart();
  const { user, token, loading: authLoading } = useAuth();
  const paymentConfig = useApi<PaymentConfig>("/payments/config");
  const router = useRouter();
  const t = dict.cart;
  const [busy, setBusy] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency = cart.lines[0]?.currency ?? "IRR";
  const stepperLabels = {
    quantity: dict.common.quantity,
    increase: dict.common.increase,
    decrease: dict.common.decrease,
  };

  async function checkout(method: PaymentMethod) {
    if (!user || !token) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/cart`)}`);
      return;
    }
    setBusy(method);
    setError(null);
    try {
      const next = await placeOrder(
        cart.lines.map((l) => ({ planId: l.planId, quantity: l.quantity })),
        method,
        locale,
        token,
      );
      // The order now holds the stock — the cart has done its job.
      cart.clear();
      if (next.external) window.location.assign(next.href);
      else router.push(next.href);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
      setBusy(null);
    }
  }

  if (!cart.ready) {
    return (
      <Container className="py-10">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Container>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <Container className="py-20 text-center animate-fade-in">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="mt-3 text-muted">{t.empty}</p>
        <Link
          href={`/${locale}/products`}
          className="mt-6 inline-flex h-12 items-center bg-primary px-6 font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {t.browse}
        </Link>
      </Container>
    );
  }

  return (
    <Container className="py-10 animate-fade-in">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <span className="text-sm text-muted">
          {cart.count} {t.items}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ul className="space-y-3">
          {cart.lines.map((line) => (
            <li key={line.planId}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl font-bold text-muted/40">
                      {line.productName.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-40">
                  <Link
                    href={`/${locale}/products/${line.productSlug}`}
                    className="font-semibold hover:text-primary"
                  >
                    {line.productName}
                  </Link>
                  <p className="text-sm text-muted">{line.planLabel}</p>
                  <p className="mt-1 text-sm font-medium">
                    {formatPrice(line.unitPrice, line.currency, locale)}
                  </p>
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                  <QuantityStepper
                    value={line.quantity}
                    max={line.maxQuantity}
                    onChange={(q) => cart.setQuantity(line.planId, q)}
                    labels={stepperLabels}
                  />
                  <button
                    type="button"
                    onClick={() => cart.remove(line.planId)}
                    className="h-10 px-2 text-sm text-muted underline-offset-4 hover:text-danger hover:underline"
                  >
                    {t.remove}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <Card className="h-fit lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between">
            <span className="text-muted">{t.total}</span>
            <span className="text-2xl font-bold">{formatPrice(cart.total, currency, locale)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">{t.priceNote}</p>
          <p className="mt-1 text-xs text-muted">{t.reserveNote}</p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}

          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={busy !== null || authLoading}
            onClick={() => checkout("online")}
          >
            {busy === "online" ? (
              <>
                <Spinner /> {dict.product.purchasing}
              </>
            ) : user ? (
              `${t.checkout} — ${dict.checkout.payOnline}`
            ) : (
              t.loginToCheckout
            )}
          </Button>
          {user && paymentConfig.data?.cardToCard && (
            <Button
              className="mt-2 w-full"
              size="lg"
              variant="outline"
              disabled={busy !== null}
              onClick={() => checkout("card_to_card")}
            >
              {busy === "card_to_card" ? <Spinner /> : dict.checkout.payCardToCard}
            </Button>
          )}
          <button
            type="button"
            onClick={cart.clear}
            className="mt-4 w-full text-center text-xs text-muted hover:text-danger"
          >
            {t.clear}
          </button>
        </Card>
      </div>
    </Container>
  );
}
