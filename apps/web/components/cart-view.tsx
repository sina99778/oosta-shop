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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Envelope, Postmark, ProductStamp } from "@/components/stamp";
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
      <Container className="max-w-2xl py-14 animate-fade-in">
        <Envelope className="text-center">
          <div className="px-6 py-12">
            <div
              aria-hidden
              className="mx-auto grid h-24 w-40 place-items-center rounded-md border-2 border-dashed border-border text-muted"
            >
              <svg
                width="56"
                height="56"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <rect x="3" y="6" width="18" height="13" rx="1.5" />
                <path d="M3.5 7l8.5 6.5L20.5 7" />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-black">{t.empty}</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-muted">{t.emptyBody}</p>
            <Link
              href={`/${locale}/products`}
              className="mt-6 inline-flex h-12 items-center rounded-[10px] bg-primary px-6 font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              {t.browse}
            </Link>
          </div>
        </Envelope>
      </Container>
    );
  }

  return (
    <Container className="py-10 animate-fade-in">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-black">{t.title}</h1>
        <span className="text-sm text-muted">
          {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(cart.count)} {t.items}
        </span>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <section aria-labelledby="lines-title">
          <h2 id="lines-title" className="mb-3 text-sm font-bold text-muted">
            {t.linesTitle}
          </h2>
          <ul className="divide-y divide-dashed divide-border overflow-hidden rounded-[14px] border border-border bg-card shadow-card">
            {cart.lines.map((line, i) => (
              <li key={line.planId} className="flex flex-wrap items-center gap-4 p-4">
                <ProductStamp
                  slug={line.productSlug}
                  type={line.productType ?? "ACCOUNT"}
                  image={line.imageUrl}
                  name={line.productName}
                  size="sm"
                  tilt={i % 2 === 0 ? -3 : 3}
                  hole="var(--c-card)"
                />
                <div className="min-w-0 flex-1 basis-40">
                  <Link
                    href={`/${locale}/products/${line.productSlug}`}
                    className="font-extrabold hover:text-primary"
                  >
                    <bdi>{line.productName}</bdi>
                  </Link>
                  <p className="text-sm text-muted">
                    <bdi>{line.planLabel}</bdi>
                  </p>
                  <p className="mt-1 text-sm font-bold">
                    {formatPrice(line.unitPrice * line.quantity, line.currency, locale)}
                  </p>
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                  <QuantityStepper
                    value={line.quantity}
                    max={line.maxQuantity}
                    onChange={(q) => cart.setQuantity(line.planId, q)}
                    labels={stepperLabels}
                    className="rounded-[10px]"
                  />
                  <button
                    type="button"
                    onClick={() => cart.remove(line.planId)}
                    className="h-10 px-2 text-sm text-muted underline-offset-4 hover:text-danger hover:underline"
                  >
                    {t.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside aria-labelledby="send-title" className="lg:sticky lg:top-24">
          <div className="airmail rounded-md p-2">
            <div className="relative overflow-hidden rounded-sm bg-[#f6f1e7] p-5 text-[#1b2433]">
              <Postmark
                label={t.readyToSend}
                id="cart-postmark"
                className="pointer-events-none absolute -top-3 end-[-30px] w-[170px] -rotate-12 text-[rgba(160,40,22,0.35)]"
              />
              <h2 id="send-title" className="relative text-lg font-black">
                {t.sendTitle}
              </h2>
              <div className="relative mt-3 flex flex-col gap-1 text-[13px] text-[#6d6656]">
                <span>{dict.home.envelopeTo}</span>
                <span className="border-b border-[#cfc5b2] pb-1 font-bold text-[#1b2433]">
                  {user ? user.name : dict.home.envelopeDashboard}
                </span>
                <span className="border-b border-[#cfc5b2] pb-1">{dict.home.envelopeVault}</span>
              </div>

              <div className="relative mt-5 flex items-baseline justify-between border-t-2 border-double border-[#1b2433] pt-3">
                <span className="text-sm text-[#4a5366]">{t.total}</span>
                <span className="text-2xl font-black">
                  {formatPrice(cart.total, currency, locale)}
                </span>
              </div>
              <p className="relative mt-2 text-xs leading-6 text-[#4a5366]">{t.priceNote}</p>
              <p className="relative text-xs leading-6 text-[#4a5366]">{t.reserveNote}</p>

              {error && (
                <p role="alert" className="relative mt-3 text-sm text-[#b42318]">
                  {error}
                </p>
              )}

              <Button
                className="relative mt-4 w-full"
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
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => checkout("card_to_card")}
                  className="relative mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-[#1b2433] font-semibold text-[#1b2433] transition-colors hover:bg-[#1b2433] hover:text-[#f6f1e7] disabled:opacity-50"
                >
                  {busy === "card_to_card" ? <Spinner /> : dict.checkout.payCardToCard}
                </button>
              )}
              <button
                type="button"
                onClick={cart.clear}
                className="relative mt-4 w-full text-center text-xs text-[#4a5366] hover:text-[#b42318]"
              >
                {t.clear}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Container>
  );
}
