"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, assetUrl, productImageUrl } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { notifyCartChanged } from "@/lib/cart-events";
import { addGuestCartItem } from "@/lib/guest-cart";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { ProductCard } from "@/components/product-card";
import { IndicativePriceLabel } from "./indicative-price";
import { ProductPurchaseAction } from "./product-purchase-action";
import { ProductMark } from "@/components/product-mark";
import { VariantSelector } from "./variant-selector";
import { SupplierQuotePanel } from "./supplier-quote-panel";
import { StockAlertButton } from "./stock-alert-button";
import layout from "./product-detail.module.css";
import { consumePlanReturn, trackStorefrontStep } from "@/lib/storefront-metrics";
import styles from "./shop.module.css";
import { cn } from "@/lib/cn";
import { formatPrice, formatDate } from "@/lib/format";
import { planDisplayLabel, planTrustSummary } from "@/lib/product-variant";
import { availabilityLabel, availabilityOf, canBuyPlan } from "@/lib/product-availability";
import type { Locale } from "@/lib/i18n";
import type { CheckoutMethods } from "@/lib/product-availability";
import type { ProductDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

function stars(n: number): string {
  const r = Math.round(n);
  return "★★★★★☆☆☆☆☆".slice(5 - r, 10 - r);
}

export function ProductDetailView({
  locale,
  product,
  requestedPlanId,
  payment,
  supportHref,
  dict,
}: {
  locale: Locale;
  product: ProductDetail;
  requestedPlanId?: string;
  payment: CheckoutMethods | null;
  supportHref: string;
  dict: Dictionary;
}) {
  const { slug } = product;
  const { user, token, loading: authLoading, sessionError } = useAuth();
  const router = useRouter();
  const t = dict.product;

  const [selectedPlan, setSelectedPlan] = useState<string | null | undefined>(undefined);
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState<"description" | "specs" | "reviews">("description");
  const [buying, setBuying] = useState(false);
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
  const requestedPlan = product.plans.find((p) => p.id === requestedPlanId);
  const stocked = product.plans.filter((p) => {
    const availability = availabilityOf(p);
    return availability === "LOCAL_STOCK" || availability === "SUPPLIER_STOCK";
  });
  stocked.sort(
    (a, b) =>
      (b.sortOrder ?? 0) - (a.sortOrder ?? 0) ||
      Number(availabilityOf(b) === "LOCAL_STOCK") - Number(availabilityOf(a) === "LOCAL_STOCK"),
  );
  const defaultPlan =
    requestedPlanId === undefined
      ? (stocked[0] ?? product.plans.find((p) => p.inStock) ?? product.plans[0])
      : requestedPlan;
  const activePlanId = selectedPlan === undefined ? (defaultPlan?.id ?? null) : selectedPlan;
  const plan = product.plans.find((p) => p.id === activePlanId) ?? null;
  const canBuy = !!plan && canBuyPlan(plan, payment);
  const supplierCart = plan?.source === "SUPPLIER" && availabilityOf(plan) === "SUPPLIER_STOCK";
  const localeFa = locale === "fa";
  const trustSummary = plan
    ? planTrustSummary(plan, locale, { cardToCard: Boolean(payment?.cardToCard) })
    : null;
  const purchaseSummary = plan
    ? {
        label: planDisplayLabel(plan.label, localeFa),
        price: plan.quoteRequired ? (
          <IndicativePriceLabel price={supplierCart ? plan.indicativePrice : null} locale={locale} />
        ) : (
          <strong>
            <bdi>{formatPrice(plan.effectivePrice, plan.currency, locale)}</bdi>
          </strong>
        ),
      }
    : undefined;
  const unavailable = plan
    ? availabilityOf(plan) === "OUT_OF_STOCK"
    : product.availability === "OUT_OF_STOCK" || product.plans.length === 0;
  const numbers = new Intl.NumberFormat(localeFa ? "fa-IR" : "en-US", { maximumFractionDigits: 1 });
  const staleSelection = requestedPlanId !== undefined && !requestedPlan && !plan;
  const returnPath = `/${locale}/products/${encodeURIComponent(slug)}${plan ? `?plan=${encodeURIComponent(plan.id)}` : ""}`;
  const loginPath = `/${locale}/login?next=${encodeURIComponent(returnPath)}`;
  const viewedSlug = useRef<string | null>(null);

  useEffect(() => {
    if (viewedSlug.current === slug) return;
    viewedSlug.current = slug;
    trackStorefrontStep("product_viewed");
  }, [slug]);

  useEffect(() => {
    if (user && token) consumePlanReturn(locale, slug, requestedPlan?.id ?? null);
  }, [user, token, locale, slug, requestedPlan?.id]);

  function selectPlan(id: string | null) {
    setSelectedPlan(id);
    setBuyError(null);
    if (id) trackStorefrontStep("plan_selected");
  }

  const cardLabels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
    featured: t.featured,
    off: t.off,
    left: t.left,
  };

  async function addToCart() {
    if (!plan || (!canBuy && !supplierCart) || buying || authLoading) return;
    setBuying(true);
    setBuyError(null);
    try {
      if (sessionError) {
        setBuyError(localeFa ? "وضعیت ورود مشخص نیست. صفحه را تازه کن." : "Reload to check your sign-in status.");
        return;
      }
      if (!user) {
        if (addGuestCartItem(plan.id) === "full") {
          setBuyError(localeFa ? "سبد مهمان پر است و تا ۱۰ قلم جا دارد." : "Your guest cart already has ten items.");
          return;
        }
      } else {
        if (!token) return;
        await api.post("/cart/items", { planId: plan.id }, token);
        notifyCartChanged();
      }
      router.push(`/${locale}/cart`);
    } catch (error) {
      setBuyError(apiErrorMessage(error, locale, dict.common.somethingWrong));
    } finally {
      setBuying(false);
    }
  }

  async function submitReview() {
    if (!user || !token) {
      router.push(loginPath);
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
      setReviewMsg(apiErrorMessage(e, locale, dict.common.somethingWrong));
    } finally {
      setReviewBusy(false);
    }
  }

  const planPicker = product.plans.some((p) => p.variant) ? (
    <VariantSelector
      key={slug + JSON.stringify(product.plans.map((p) => [p.id, p.variant, p.durationDays]))}
      plans={product.plans}
      value={activePlanId}
      onChange={selectPlan}
      locale={locale}
    />
  ) : (
    <details className="mt-3 rounded-xl border border-border" open={product.plans.length === 1}>
      <summary className="oosta-disclosure min-h-14 p-4 font-medium">
        <span className="min-w-0">
          {locale === "fa" ? "انتخاب نوع اشتراک" : "Choose subscription"}
          {plan && (
            <bdi
              dir={localeFa ? "rtl" : "ltr"}
              className="mt-1 block text-sm font-normal text-muted"
            >
              {planDisplayLabel(plan.label, localeFa)}
            </bdi>
          )}
        </span>
      </summary>
      <div className="max-h-[32rem] space-y-2 overflow-y-auto border-t border-border p-4">
        {product.plans.map((pl) => (
          <label
            key={pl.id}
            className={cn(
              "flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border p-3 transition-colors",
              activePlanId === pl.id ? "border-primary bg-surface" : "border-border",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <input
                type="radio"
                name="plan"
                className="accent-primary"
                checked={activePlanId === pl.id}
                onChange={() => selectPlan(pl.id)}
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
  );

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

      <div
        className={cn(
          layout.overview,
          images.length > 0 ? layout.withGallery : layout.withoutGallery,
        )}
      >
        {/* Gallery */}
        {images.length > 0 && (
          <div className={layout.media}>
            <div className={styles.gallery}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[activeImage] ?? images[0]}
                fetchPriority="high"
                alt={product.name}
                className="h-full w-full object-contain"
              />
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {images.map((src, i) => (
                  <button
                    key={i}
                    aria-label={`${product.name} — ${numbers.format(i + 1)}`}
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
        )}

        {/* Info */}
        <div className={cn(layout.intro, styles.detailInfo)}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="muted">{product.category.name}</Badge>
            {product.isFeatured && <Badge tone="primary">{t.featured}</Badge>}
            {plan?.onSale && (
              <Badge tone="sale">
                {new Intl.NumberFormat(localeFa ? "fa-IR" : "en-US", { style: "percent" }).format(
                  plan.discountPercent / 100,
                )}{" "}
                {t.off}
              </Badge>
            )}
          </div>
          <h1 className={layout.title}>
            {!images.length && <ProductMark type={product.type} className={layout.mark} />}
            <bdi>{product.name}</bdi>
          </h1>

          {product.rating.count > 0 && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
              {stars(product.rating.average)}{" "}
              <span className="text-muted">
                {numbers.format(product.rating.average)} · {numbers.format(product.rating.count)}{" "}
                {t.reviewsCount}
              </span>
            </p>
          )}

          {product.shortDescription && (
            <p className="mt-3 text-muted">{product.shortDescription}</p>
          )}
        </div>
        {/* Plans */}
        <Card className={cn(layout.purchase, styles.planCard)}>
          <h2 className="font-semibold">{t.perPlan}</h2>
          {staleSelection && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {localeFa
                ? "پلن قبلی دیگر در دسترس نیست. یک پلن را دوباره انتخاب کن."
                : "Your previous plan is unavailable. Please choose a plan again."}
            </p>
          )}
          {!plan && planPicker}
          {plan && (
            <div className={layout.terms}>
              <p className="font-semibold">
                <bdi>{planDisplayLabel(plan.label, localeFa)}</bdi>
              </p>
            </div>
          )}
          {/* Price */}
          {(supplierCart || plan?.supplierStockUnconfirmed) && (
            <div className="mt-2" aria-live="polite">
              <IndicativePriceLabel
                price={supplierCart ? plan.indicativePrice : null}
                locale={locale}
              />
            </div>
          )}
          {plan && !plan.quoteRequired && (
            <div className={cn("mt-2 flex flex-wrap items-end gap-3", styles.detailPrice)}>
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
          {plan && availabilityOf(plan) === "OUT_OF_STOCK" && user?.role !== "ADMIN" && (
            <StockAlertButton
              key={JSON.stringify([plan.id, token])}
              planId={plan.id}
              locale={locale}
              loginPath={loginPath}
              token={user?.role === "USER" ? token : null}
              purchaseSummary={purchaseSummary}
            />
          )}
          {plan?.quoteRequired && availabilityOf(plan) === "ON_REQUEST" && (
            <SupplierQuotePanel
              key={plan.id + JSON.stringify(plan.variant) + (token ?? "anonymous")}
              plan={plan}
              token={token}
              locale={locale}
              loginPath={loginPath}
            />
          )}
          {plan && availabilityOf(plan) === "LOCAL_STOCK" && plan.availableStock <= 5 && (
            <p className="mt-3 text-sm text-danger">
              {plan.availableStock.toLocaleString(locale)} {t.left}
            </p>
          )}
          {(canBuy || supplierCart) && (
            <ProductPurchaseAction
              key={plan?.id}
              locale={locale}
              summary={purchaseSummary}
              feedback={
                buyError && (
                  <p role="alert" className="text-sm text-danger">
                    {buyError}
                  </p>
                )
              }
            >
              <Button type="button" size="lg" disabled={buying || authLoading} onClick={addToCart}>
                {buying ? <Spinner /> : null}
                {localeFa ? "افزودن به سبد خرید" : "Add to cart"}
              </Button>
            </ProductPurchaseAction>
          )}
          {supplierCart && (
            <p className="mt-2 text-sm text-muted">
              {localeFa
                ? "قیمت و موجودی تأمین‌کننده پیش از پرداخت در فاکتور دوباره بررسی می‌شود."
                : "We’ll recheck supplier price and stock on the invoice before payment."}
            </p>
          )}

          {plan && !plan.quoteRequired && availabilityOf(plan) === "LOCAL_STOCK" && !canBuy && (
            <p role="status" className="mt-3 text-sm text-muted">
              {localeFa
                ? "خرید این پلن فعلاً فعال نیست."
                : "Checkout is currently unavailable for this plan."}
            </p>
          )}
          {trustSummary && (
            <dl
              className={layout.trustSummary}
              aria-label={localeFa ? "خلاصهٔ ضمانت و تحویل پلن" : "Plan warranty and delivery summary"}
            >
              <div className={layout.trustSummaryRow}>
                <dt>{localeFa ? "ضمانت" : "Warranty"}</dt>
                <dd>
                  <span>{trustSummary.warranty}</span>
                  {" · "}
                  <Link href={`/${locale}/p/return-policy`}>
                    {localeFa ? "شرایط ضمانت" : "Warranty terms"}
                  </Link>
                </dd>
              </div>
              <div className={layout.trustSummaryRow}>
                <dt>{localeFa ? "روش تحویل" : "Delivery"}</dt>
                <dd>{trustSummary.delivery}</dd>
              </div>
              <div className={layout.trustSummaryRow}>
                <dt>{localeFa ? "دسترسی و مدت" : "Access & term"}</dt>
                <dd>{trustSummary.access}</dd>
              </div>
              <div className={layout.trustSummaryRow}>
                <dt>{localeFa ? "پشتیبانی" : "Support"}</dt>
                <dd>
                  <Link href={`/${locale}/p/contact`}>
                    {localeFa ? "راه‌های تماس و پیگیری سفارش" : "Contact & order support"}
                  </Link>
                  {supportHref && (
                    <>
                      {" · "}
                      <a href={supportHref} target="_blank" rel="noopener noreferrer">
                        {localeFa ? "تلگرام پیش از خرید" : "Pre-sale Telegram"}
                      </a>
                    </>
                  )}
                </dd>
              </div>
            </dl>
          )}
          {plan && (
            <div className={layout.change}>
              <h3 className="text-sm font-semibold">{localeFa ? "تغییر پلن" : "Change plan"}</h3>
              {planPicker}
            </div>
          )}
          {plan?.variant && (
            <details key={plan.id} className="mt-4 rounded-xl border border-border">
              <summary className="oosta-disclosure min-h-12 p-4 text-sm font-medium">
                {locale === "fa" ? "شرایط اشتراک انتخاب‌شده" : "Selected subscription terms"}
              </summary>
              <div className="space-y-3 border-t border-border p-4 text-sm leading-7">
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
                      document.getElementById("product-panel")?.scrollIntoView({ block: "start" });
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
        </Card>
        <div className={cn(layout.support, styles.supportNote)}>
          <span>
            {unavailable
              ? localeFa
                ? "این گزینه فعلاً ناموجود است."
                : "This option is currently unavailable."
              : localeFa
                ? "نوع دسترسی و شرایط پلن را پیش از خرید بررسی کن."
                : "Review access type and plan terms before buying."}
          </span>
          <a href={supportHref} target="_blank" rel="noopener noreferrer">
            {unavailable
              ? localeFa
                ? "پیگیری موجودی در تلگرام"
                : "Ask about availability on Telegram"
              : localeFa
                ? "پرسش پیش از خرید در تلگرام"
                : "Ask before buying on Telegram"}{" "}
            ↗
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.detailTabs}>
        <div role="tablist" aria-label={product.name} className="flex gap-1 border-b border-border">
          {(
            [
              ["description", t.tabDescription],
              ["specs", t.tabSpecs],
              ["reviews", `${t.tabReviews} (${numbers.format(product.rating.count)})`],
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
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-normal text-amber-800 dark:text-amber-300">
                              {dict.admin.reviews.pending}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(r.createdAt, locale)}
                        </span>
                      </div>
                      <p className="text-amber-700 dark:text-amber-400">{stars(r.rating)}</p>
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
                    href={loginPath}
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
                            className={
                              n <= rating ? "text-amber-700 dark:text-amber-400" : "text-muted"
                            }
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
