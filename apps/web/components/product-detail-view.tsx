"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import { MAX_LINE_QUANTITY, useCart } from "@/lib/cart";
import { placeOrder } from "@/lib/checkout";
import { api, ApiError, assetUrl } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Markdown } from "@/components/markdown";
import { Postmark, ProductStamp } from "@/components/stamp";
import { categoryName } from "@/lib/category-name";
import { ProductCard } from "@/components/product-card";
import { cn } from "@/lib/cn";
import { formatPrice, formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { PaymentConfig, PaymentMethod, ProductDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function stars(n: number): string {
  const r = Math.round(n);
  return "★★★★★☆☆☆☆☆".slice(5 - r, 10 - r);
}

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
  const cart = useCart();
  const router = useRouter();
  const t = dict.product;

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState<"description" | "specs" | "reviews">("description");
  const [buying, setBuying] = useState<PaymentMethod | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  // Review form
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  const [reviewsList, setReviewsList] = useState<
    Array<ProductDetail["reviews"][number] & { isPendingLocal?: boolean }>
  >([]);

  useEffect(() => {
    if (data?.product) {
      const reviews = data.product.reviews;
      queueMicrotask(() => setReviewsList(reviews));
    }
  }, [data]);

  if (loading) {
    return (
      <Container className="py-8">
        <Skeleton className="mb-4 h-4 w-48" />
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
        </div>
      </Container>
    );
  }
  if (error || !data) {
    return <Container className="py-20 text-center text-muted">{t.notFound}</Container>;
  }

  const product = data.product;
  const images = [
    ...(product.hasImage ? [assetUrl(`/products/${product.id}/image`)] : []),
    ...product.galleryImageIds.map((id) => assetUrl(`/product-images/${id}`)),
  ];
  const activePlanId =
    selectedPlan ?? product.plans.find((p) => p.inStock)?.id ?? product.plans[0]?.id ?? null;
  const plan = product.plans.find((p) => p.id === activePlanId) ?? null;
  const maxQuantity = plan ? Math.max(1, Math.min(plan.availableStock, MAX_LINE_QUANTITY)) : 1;
  const qty = Math.min(quantity, maxQuantity);

  const cardLabels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
    featured: t.featured,
    off: t.off,
    left: t.left,
  };

  async function buy(method: PaymentMethod) {
    if (!plan) return;
    if (!user || !token) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/products/${slug}`)}`);
      return;
    }
    setBuying(method);
    setBuyError(null);
    try {
      const next = await placeOrder([{ planId: plan.id, quantity: qty }], method, locale, token);
      if (next.external) window.location.assign(next.href);
      else router.push(next.href);
    } catch (e) {
      setBuyError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
      setBuying(null);
    }
  }

  function addToCart() {
    if (!plan) return;
    cart.add(
      {
        planId: plan.id,
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        productType: product.type,
        planLabel: plan.label,
        unitPrice: plan.effectivePrice,
        currency: plan.currency,
        imageUrl: images[0] ?? null,
        maxQuantity,
      },
      qty,
    );
    setAddedToCart(true);
  }

  async function submitReview() {
    if (!user || !token) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/products/${slug}`)}`);
      return;
    }
    setReviewBusy(true);
    setReviewMsg(null);
    try {
      await api.post(`/products/${product.id}/reviews`, { rating, comment }, token);

      const newReview = {
        id: `pending-${Date.now()}`,
        rating,
        comment: comment.trim() || null,
        userName: user.name,
        createdAt: new Date().toISOString(),
        isPendingLocal: true,
      };
      setReviewsList((prev) => [newReview, ...prev]);

      setComment("");
      setReviewMsg(t.reviewThanks);
    } catch (e) {
      setReviewMsg(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <Container className="py-8 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href={`/${locale}`} className="hover:text-foreground">
          {dict.nav.home}
        </Link>
        <span>/</span>
        <Link
          href={`/${locale}/products?category=${product.category.slug}`}
          className="hover:text-foreground"
        >
          {categoryName(product.category, locale)}
        </Link>
        <span>/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] border border-border bg-surface">
            {images.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[activeImage] ?? images[0]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <ProductStamp
                  slug={product.slug}
                  type={product.type}
                  name={product.name}
                  size="lg"
                  tilt={-2}
                  denomination={
                    plan
                      ? new Intl.NumberFormat("fa-IR").format(
                          plan.currency === "IRR" ? plan.effectivePrice / 10 : plan.effectivePrice,
                        )
                      : undefined
                  }
                  series={categoryName(product.category, locale)}
                />
                {product.inStock && (
                  <Postmark
                    label={t.postmark}
                    id="product-postmark"
                    className="absolute end-[3%] top-[5%] w-[130px] sm:w-[170px] -rotate-[14deg] text-[rgba(160,40,22,0.85)] dark:text-[rgba(232,115,93,0.85)]"
                  />
                )}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    "size-16 overflow-hidden rounded-lg border",
                    i === activeImage ? "border-primary" : "border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="muted">{categoryName(product.category, locale)}</Badge>
            {product.isFeatured && <Badge tone="primary">{t.featured}</Badge>}
            {plan?.onSale && (
              <Badge tone="sale">
                {plan.discountPercent}% {t.off}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>

          {(product.rating.count > 0 || (product.soldCount ?? 0) > 0) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm">
              {product.rating.count > 0 && (
                <span className="text-amber-500">
                  <span aria-hidden>{stars(product.rating.average)}</span>{" "}
                  <span className="text-muted">
                    {product.rating.average} · {product.rating.count} {t.reviewsCount}
                  </span>
                </span>
              )}
              {(product.soldCount ?? 0) > 0 && (
                <span className="text-muted">
                  {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(
                    product.soldCount ?? 0,
                  )}{" "}
                  {t.sold}
                </span>
              )}
            </p>
          )}

          {product.shortDescription && (
            <p className="mt-3 text-muted">{product.shortDescription}</p>
          )}

          {/* Price */}
          {plan && (
            <div className="mt-5 flex items-end gap-3">
              <span className="text-3xl font-bold">
                {formatPrice(plan.effectivePrice, plan.currency, locale)}
              </span>
              {plan.onSale && (
                <span className="pb-1 text-lg text-muted line-through">
                  {formatPrice(plan.price, plan.currency, locale)}
                </span>
              )}
            </div>
          )}

          {/* Plans */}
          <Card className="mt-5 h-fit">
            <h2 className="font-semibold">{t.perPlan}</h2>
            <div className="mt-3 space-y-2">
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
                      onChange={() => {
                        setSelectedPlan(pl.id);
                        setAddedToCart(false);
                      }}
                    />
                    <span className="font-medium">{pl.label}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold">
                      {pl.onSale && (
                        <span className="me-2 text-xs text-muted line-through">
                          {formatPrice(pl.price, pl.currency, locale)}
                        </span>
                      )}
                      {formatPrice(pl.effectivePrice, pl.currency, locale)}
                    </span>
                    <Badge tone={pl.inStock ? "success" : "danger"}>
                      {pl.inStock ? dict.common.inStock : dict.common.outOfStock}
                    </Badge>
                  </span>
                </label>
              ))}
            </div>

            {product.lowStock && (
              <p className="mt-3 text-sm text-danger">
                {product.availableStock} {t.left}
              </p>
            )}
            {buyError && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {buyError}
              </p>
            )}

            {plan?.inStock && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <QuantityStepper
                  value={qty}
                  max={maxQuantity}
                  onChange={(q) => {
                    setQuantity(q);
                    setAddedToCart(false);
                  }}
                  labels={{
                    quantity: dict.common.quantity,
                    increase: dict.common.increase,
                    decrease: dict.common.decrease,
                  }}
                />
                <Button
                  variant="outline"
                  className="flex-1 rounded-[10px]"
                  disabled={buying !== null}
                  onClick={addToCart}
                >
                  {t.addToCart}
                </Button>
              </div>
            )}
            <p aria-live="polite" className="mt-2 min-h-5 text-sm text-success">
              {addedToCart && (
                <>
                  {t.addedToCart}{" "}
                  <Link href={`/${locale}/cart`} className="font-medium underline">
                    {t.viewCart}
                  </Link>
                </>
              )}
            </p>

            <Button
              className="mt-2 w-full"
              size="lg"
              disabled={!plan || !plan.inStock || buying !== null}
              onClick={() => buy("online")}
            >
              {buying === "online" ? (
                <>
                  <Spinner /> {t.purchasing}
                </>
              ) : !product.inStock ? (
                t.soldOut
              ) : !user ? (
                t.loginToBuy
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

            <p className="mt-4 flex items-center justify-between rounded-[10px] bg-surface px-3 py-2.5 text-sm">
              <span className="text-muted">{t.whereDelivered}</span>
              <strong>{t.whereDeliveredValue}</strong>
            </p>

            {/* Trust signals, right where the buying decision happens */}
            <ul className="mt-4 grid gap-2 border-t border-border pt-4 text-xs text-muted sm:grid-cols-3">
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 shrink-0 rotate-45 bg-primary" />{" "}
                {t.trustInstant}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 shrink-0 rotate-45 bg-primary" />{" "}
                {t.trustSecure}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 shrink-0 rotate-45 bg-primary" />{" "}
                {t.trustSupport}
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-10">
        <div className="flex gap-1 border-b border-border">
          {(
            [
              ["description", t.tabDescription],
              ["specs", t.tabSpecs],
              ["reviews", `${t.tabReviews} (${product.rating.count})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "border-b-2 px-4 py-3 text-sm transition-colors",
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="py-6">
          {tab === "description" && <Markdown text={product.description} className="text-muted" />}

          {tab === "specs" &&
            (product.specs.length === 0 ? (
              <p className="text-muted">{t.noSpecs}</p>
            ) : (
              <div className="max-w-xl overflow-hidden rounded-lg border border-border">
                {product.specs.map((s, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex justify-between gap-4 px-4 py-2.5 text-sm",
                      i % 2 === 0 ? "bg-surface" : "",
                    )}
                  >
                    <span className="text-muted">{s.label}</span>
                    <span className="font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            ))}

          {tab === "reviews" && (
            <div className="space-y-6">
              {reviewsList.length === 0 ? (
                <p className="text-muted">{t.noReviews}</p>
              ) : (
                <div className="space-y-4">
                  {reviewsList.map((r) => (
                    <div key={r.id} className="border-b border-border pb-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium flex items-center gap-2">
                          {r.userName}
                          {r.verifiedBuyer && (
                            <Badge tone="success" className="font-normal">
                              ✓ {t.verifiedBuyer}
                            </Badge>
                          )}
                          {r.isPendingLocal && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-normal text-amber-500">
                              {dict.admin.reviews.pending}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(r.createdAt, locale)}
                        </span>
                      </div>
                      <p className="text-amber-400">{stars(r.rating)}</p>
                      {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Write a review */}
              <Card className="max-w-xl">
                <h3 className="font-semibold">{t.writeReview}</h3>
                {!user ? (
                  <Link
                    href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/products/${slug}`)}`}
                    className="mt-2 inline-block text-sm text-primary hover:underline"
                  >
                    {t.loginToReview}
                  </Link>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-sm text-muted">{t.yourRating}</label>
                      <div className="flex gap-1 text-2xl">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setRating(n)}
                            className={n <= rating ? "text-amber-400" : "text-muted/40"}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      placeholder={t.yourComment}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {reviewMsg && <p className="text-sm text-muted">{reviewMsg}</p>}
                    <Button onClick={submitReview} disabled={reviewBusy}>
                      {reviewBusy ? <Spinner /> : t.submitReview}
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Related products */}
      {product.related.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-xl font-bold">{t.related}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {product.related.map((rp) => (
              <ProductCard key={rp.id} product={rp} locale={locale} labels={cardLabels} />
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
