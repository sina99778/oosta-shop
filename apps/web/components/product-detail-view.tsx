"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, ApiError, assetUrl, productImageUrl } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { ProductCard } from "@/components/product-card";
import { ProductMark } from "@/components/product-mark";
import { VariantSelector } from "./variant-selector";
import { SupplierQuotePanel } from "./supplier-quote-panel";
import styles from "./shop.module.css";
import { cn } from "@/lib/cn";
import { formatPrice, formatDate } from "@/lib/format";
import { planDisplayLabel, variantDescription } from "@/lib/product-variant";
import { availabilityLabel, availabilityOf, canBuyPlan } from "@/lib/product-availability";
import type { Locale } from "@/lib/i18n";
import type { CheckoutMethods } from "@/lib/product-availability";
import type { CreateOrderResponse, PaymentMethod, ProductDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function stars(n: number): string {
  const r = Math.round(n);
  return "★★★★★☆☆☆☆☆".slice(5 - r, 10 - r);
}

export function ProductDetailView({
  locale,
  product,
  payment,
  dict,
}: {
  locale: Locale;
  product: ProductDetail;
  payment: CheckoutMethods | null;
  dict: Dictionary;
}) {
  const { slug } = product;
  const { user, token } = useAuth();
  const router = useRouter();
  const t = dict.product;

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState<"description" | "specs" | "reviews">("description");
  const [buying, setBuying] = useState<PaymentMethod | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  // Review form
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  const [reviewsList, setReviewsList] = useState<
    Array<ProductDetail["reviews"][number] & { isPendingLocal?: boolean }>
  >(product.reviews);

  const images = [
    ...(productImageUrl(product) ? [productImageUrl(product)!] : []),
    ...product.galleryImageIds.map((id) => assetUrl(`/product-images/${id}`)),
  ];
  const activePlanId =
    selectedPlan === null
      ? (product.plans.find((p) => availabilityOf(p) === "LOCAL_STOCK")?.id ??
        product.plans.find((p) => p.inStock)?.id ??
        product.plans[0]?.id ??
        null)
      : selectedPlan;
  const plan = product.plans.find((p) => p.id === activePlanId) ?? null;
  const canBuy = !!plan && canBuyPlan(plan, payment);
  const localeFa = locale === "fa";

  const cardLabels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
    featured: t.featured,
    off: t.off,
    left: t.left,
  };

  async function buy(method: PaymentMethod) {
    const methodEnabled = method === "online" ? payment?.online : payment?.cardToCard;
    if (!plan || !canBuy || !methodEnabled || buying !== null) return;
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
        window.location.assign(res.payment.redirectUrl);
        return;
      }
      setBuyError(dict.common.somethingWrong);
      setBuying(null);
    } catch (e) {
      setBuyError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
      setBuying(null);
    }
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
      setReviewsList((prev) => [newReview, ...prev.filter((r) => !r.isPendingLocal)]);

      setComment("");
      setReviewMsg(t.reviewThanks);
    } catch (e) {
      setReviewMsg(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <Container className={styles.detail}>
      {/* Breadcrumb */}
      <nav
        aria-label={locale === "fa" ? "مسیر صفحه" : "Breadcrumb"}
        className={cn("flex flex-wrap items-center text-muted", styles.detailBreadcrumb)}
      >
        <Link href={`/${locale}`} className="hover:text-foreground">
          {dict.nav.home}
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/${locale}/products?category=${product.category.slug}`}
          className="hover:text-foreground"
        >
          {product.category.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground" aria-current="page">
          <bdi>{product.name}</bdi>
        </span>
      </nav>

      <div className={cn("grid lg:grid-cols-2", styles.detailGrid)}>
        {/* Gallery */}
        <div>
          <div className={styles.gallery}>
            {images.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[activeImage] ?? images[0]}
                fetchPriority="high"
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <ProductMark type={product.type} className={styles.galleryMark} />
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <button
                  key={i}
                  aria-label={`${product.name} — ${i + 1}`}
                  aria-pressed={activeImage === i}
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
        <div className={styles.detailInfo}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="muted">{product.category.name}</Badge>
            {product.isFeatured && <Badge tone="primary">{t.featured}</Badge>}
            {plan?.onSale && (
              <Badge tone="sale">
                {plan.discountPercent}% {t.off}
              </Badge>
            )}
          </div>
          <h1>
            <bdi>{product.name}</bdi>
          </h1>

          {product.rating.count > 0 && (
            <p className="mt-2 text-sm text-amber-400">
              {stars(product.rating.average)}{" "}
              <span className="text-muted">
                {product.rating.average} · {product.rating.count} {t.reviewsCount}
              </span>
            </p>
          )}

          {product.shortDescription && (
            <p className="mt-3 text-muted">{product.shortDescription}</p>
          )}

          {/* Price */}
          {plan && !plan.quoteRequired && (
            <div className={cn("mt-5 flex flex-wrap items-end gap-3", styles.detailPrice)}>
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
          <Card className={cn("h-fit", styles.planCard)}>
            <h2 className="font-semibold">{t.perPlan}</h2>
            {product.plans.some((p) => p.variant) ? (
              <VariantSelector
                key={
                  slug + JSON.stringify(product.plans.map((p) => [p.id, p.variant, p.durationDays]))
                }
                plans={product.plans}
                value={activePlanId}
                onChange={(id) => setSelectedPlan(id ?? "")}
                locale={locale}
              />
            ) : (
              <details
                className="mt-3 rounded-xl border border-border"
                open={product.plans.length === 1}
              >
                <summary className="min-h-14 cursor-pointer p-4 font-medium">
                  {locale === "fa" ? "انتخاب نوع اشتراک" : "Choose subscription"}
                  {plan && (
                    <bdi className="mt-1 block text-sm font-normal text-muted">
                      {planDisplayLabel(plan.label, localeFa)}
                    </bdi>
                  )}
                </summary>
                <div className="max-h-[32rem] space-y-2 overflow-y-auto border-t border-border p-4">
                  {product.plans.map((pl) => (
                    <label
                      key={pl.id}
                      className={cn(
                        "flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border p-3 transition-colors",
                        activePlanId === pl.id ? "border-primary bg-surface" : "border-border",
                        !pl.inStock && !pl.quoteRequired && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <input
                          type="radio"
                          name="plan"
                          className="accent-primary"
                          checked={activePlanId === pl.id}
                          disabled={!pl.inStock && !pl.quoteRequired}
                          onChange={() => setSelectedPlan(pl.id)}
                        />
                        <span className="break-words font-medium">
                          <bdi>{planDisplayLabel(pl.label, locale === "fa")}</bdi>
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-3">
                        {!pl.quoteRequired && (
                          <span className="font-semibold">
                            {pl.onSale && (
                              <span className="me-2 text-xs text-muted line-through">
                                {formatPrice(pl.price, pl.currency, locale)}
                              </span>
                            )}
                            {formatPrice(pl.effectivePrice, pl.currency, locale)}
                          </span>
                        )}
                        <Badge tone={availabilityOf(pl) === "LOCAL_STOCK" ? "success" : "muted"}>
                          {availabilityLabel(pl, locale)}
                        </Badge>
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            )}
            {plan?.variant && (
              <details key={plan.id} className="mt-4 rounded-xl border border-border">
                <summary className="min-h-12 cursor-pointer p-4 text-sm font-medium">
                  {locale === "fa" ? "شرایط اشتراک انتخاب‌شده" : "Selected subscription terms"}
                </summary>
                <div className="space-y-3 border-t border-border p-4 text-sm leading-7">
                  <p>
                    <bdi>{planDisplayLabel(plan.label, locale === "fa")}</bdi>
                  </p>
                  <p>{variantDescription(plan.variant, locale === "fa")}</p>
                  <p className="text-muted">
                    {locale === "fa"
                      ? "برای پیگیری مشکل، شمارهٔ سفارش و شرح خطا را در تیکت ثبت کن. رمز حساب و کد تأیید را در تیکت ننویس."
                      : "For support, include the order number and error description in a ticket. Keep passwords and verification codes out of tickets."}
                  </p>
                  <button
                    type="button"
                    className="min-h-11 text-primary underline underline-offset-4"
                    onClick={() => {
                      setTab("description");
                      requestAnimationFrame(() => {
                        document
                          .getElementById("product-tab-description")
                          ?.focus({ preventScroll: true });
                        document
                          .getElementById("product-panel")
                          ?.scrollIntoView({ block: "start" });
                      });
                    }}
                  >
                    {locale === "fa"
                      ? "خواندن توضیحات و شرایط کامل محصول"
                      : "Read the full product description and terms"}
                  </button>
                </div>
              </details>
            )}
            {plan && (
              <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
                <Badge tone={availabilityOf(plan) === "LOCAL_STOCK" ? "success" : "muted"}>
                  {availabilityLabel(plan, locale)}
                </Badge>
                {canBuy && (
                  <span className="text-sm text-primary">
                    {localeFa ? "آمادهٔ خرید" : "Ready to purchase"}
                  </span>
                )}
              </div>
            )}
            {plan?.quoteRequired && (
              <SupplierQuotePanel
                key={plan.id + JSON.stringify(plan.variant)}
                plan={plan}
                token={token}
                locale={locale}
                onLogin={() =>
                  router.push(
                    `/${locale}/login?next=${encodeURIComponent(`/${locale}/products/${slug}`)}`,
                  )
                }
              />
            )}
            {plan && availabilityOf(plan) === "LOCAL_STOCK" && plan.availableStock <= 5 && (
              <p className="mt-3 text-sm text-danger">
                {plan.availableStock.toLocaleString(locale)} {t.left}
              </p>
            )}
            {buyError && <p className="mt-3 text-sm text-danger">{buyError}</p>}

            {plan && !plan.quoteRequired && availabilityOf(plan) === "LOCAL_STOCK" && (
              <>
                {canBuy && payment?.online && (
                  <Button
                    className="mt-4 w-full"
                    size="lg"
                    disabled={buying !== null}
                    onClick={() => buy("online")}
                  >
                    {buying === "online" ? (
                      <>
                        <Spinner /> {t.purchasing}
                      </>
                    ) : !user ? (
                      t.loginToBuy
                    ) : (
                      dict.common.buyNow
                    )}
                  </Button>
                )}

                {canBuy && payment?.cardToCard && (
                  <Button
                    className="mt-2 w-full"
                    size="lg"
                    variant="outline"
                    disabled={buying !== null}
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

                {!canBuy && (
                  <p role="status" className="mt-3 text-sm text-muted">
                    {localeFa
                      ? "خرید این پلن فعلاً فعال نیست."
                      : "Checkout is currently unavailable for this plan."}
                  </p>
                )}
                {canBuy && payment?.cardToCard && (
                  <p className="mt-2 text-center text-xs text-muted">
                    {locale === "fa"
                      ? "تحویل کارت‌به‌کارت پس از تأیید رسید توسط پشتیبانی انجام می‌شود."
                      : "Card transfers are delivered after receipt approval."}
                  </p>
                )}
              </>
            )}
          </Card>
          <div className={styles.supportNote}>
            <span>
              {locale === "fa"
                ? "نوع دسترسی و شرایط پلن را پیش از خرید بررسی کن."
                : "Review access type and plan terms before buying."}
            </span>
            <Link href={`/${locale}/support`}>
              {locale === "fa" ? "سؤال دربارهٔ محصول" : "Ask about this tool"} ↗
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.detailTabs}>
        <div role="tablist" aria-label={product.name} className="flex gap-1 border-b border-border">
          {(
            [
              ["description", t.tabDescription],
              ["specs", t.tabSpecs],
              ["reviews", `${t.tabReviews} (${product.rating.count})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              id={`product-tab-${key}`}
              aria-controls="product-panel"
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                const keys = ["description", "specs", "reviews"] as const;
                const index = keys.indexOf(key);
                let next = index;
                if (event.key === "Home") next = 0;
                else if (event.key === "End") next = keys.length - 1;
                else if (event.key === "ArrowRight")
                  next = (index + (locale === "fa" ? -1 : 1) + keys.length) % keys.length;
                else if (event.key === "ArrowLeft")
                  next = (index + (locale === "fa" ? 1 : -1) + keys.length) % keys.length;
                else return;
                event.preventDefault();
                setTab(keys[next]);
                document.getElementById(`product-tab-${keys[next]}`)?.focus();
              }}
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

        <div
          role="tabpanel"
          id="product-panel"
          aria-labelledby={`product-tab-${tab}`}
          className="py-6"
        >
          {tab === "description" && (
            <Markdown
              text={product.description}
              headingOffset={0}
              className="max-w-4xl text-muted [&_p]:leading-8"
            />
          )}

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
                            aria-label={`${n} / 5`}
                            aria-pressed={n === rating}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {product.related.map((rp) => (
              <ProductCard key={rp.id} product={rp} locale={locale} labels={cardLabels} />
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
