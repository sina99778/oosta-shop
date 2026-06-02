"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import { api, ApiError, productImageUrl } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { CreateOrderResponse, PaymentConfig, PaymentMethod, ProductDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function ProductDetailView({
  locale,
  slug,
  dict,
}: {
  locale: Locale;
  slug: string;
  dict: Dictionary;
}) {
  const { data, loading, error } = useApi<{ product: ProductDetail }>(`/products/${slug}`);
  const paymentConfig = useApi<PaymentConfig>("/payments/config");
  const { user, token } = useAuth();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [buying, setBuying] = useState<PaymentMethod | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  if (loading) {
    return (
      <Container className="py-20 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }
  if (error || !data) {
    return <Container className="py-20 text-center text-muted">{dict.product.notFound}</Container>;
  }

  const product = data.product;
  const activePlanId =
    selectedPlan ?? product.plans.find((p) => p.inStock)?.id ?? product.plans[0]?.id ?? null;
  const plan = product.plans.find((p) => p.id === activePlanId) ?? null;

  async function buy(method: PaymentMethod) {
    if (!plan) return;
    if (!user || !token) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/products/${slug}`)}`);
      return;
    }
    setBuying(method);
    setBuyError(null);
    try {
      const res = await api.post<CreateOrderResponse>(
        "/orders",
        { items: [{ planId: plan.id, quantity: 1 }], method },
        token,
      );
      if (method === "card_to_card") {
        router.push(`/${locale}/checkout/card/${res.order.id}`);
        return;
      }
      if (res.payment?.redirectUrl) {
        window.location.href = res.payment.redirectUrl;
        return;
      }
      setBuyError(dict.common.somethingWrong);
      setBuying(null);
    } catch (e) {
      setBuyError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
      setBuying(null);
    }
  }

  return (
    <Container className="py-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          {productImageUrl(product) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={productImageUrl(product)!}
              alt={product.name}
              className="mb-5 aspect-[16/10] w-full rounded-xl border border-border object-cover"
            />
          )}
          <Badge tone="muted">{product.category.name}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{product.name}</h1>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-muted">
            {product.description}
          </p>
        </div>

        <Card className="h-fit">
          <h2 className="font-semibold">{dict.product.perPlan}</h2>
          <div className="mt-4 space-y-2">
            {product.plans.map((pl) => (
              <label
                key={pl.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors",
                  activePlanId === pl.id ? "border-primary bg-surface" : "border-border",
                  !pl.inStock && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="plan"
                    className="accent-primary"
                    checked={activePlanId === pl.id}
                    disabled={!pl.inStock}
                    onChange={() => setSelectedPlan(pl.id)}
                  />
                  <span className="font-medium">{pl.label}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">
                    {formatPrice(pl.price, pl.currency, locale)}
                  </span>
                  <Badge tone={pl.inStock ? "success" : "danger"}>
                    {pl.inStock ? dict.common.inStock : dict.common.outOfStock}
                  </Badge>
                </span>
              </label>
            ))}
          </div>

          {buyError && <p className="mt-3 text-sm text-danger">{buyError}</p>}

          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={!plan || !plan.inStock || buying !== null}
            onClick={() => buy("online")}
          >
            {buying === "online" ? (
              <>
                <Spinner /> {dict.product.purchasing}
              </>
            ) : !product.inStock ? (
              dict.product.soldOut
            ) : !user ? (
              dict.product.loginToBuy
            ) : (
              dict.common.buyNow
            )}
          </Button>

          {paymentConfig.data?.cardToCard && product.inStock && (
            <Button
              className="mt-2 w-full"
              size="lg"
              variant="outline"
              disabled={!plan || !plan.inStock || buying !== null}
              onClick={() => buy("card_to_card")}
            >
              {buying === "card_to_card" ? (
                <>
                  <Spinner /> {dict.checkout.cardToCard.uploading}
                </>
              ) : (
                dict.checkout.payCardToCard
              )}
            </Button>
          )}
        </Card>
      </div>
    </Container>
  );
}
