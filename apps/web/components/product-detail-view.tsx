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
import { ProductCard, monogram } from "@/components/product-card";
import { IndicativePriceLabel } from "./indicative-price";
import { ProductPurchaseAction } from "./product-purchase-action";
import { VariantSelector } from "./variant-selector";
import { SupplierQuotePanel } from "./supplier-quote-panel";
import { StockAlertButton } from "./stock-alert-button";
import layout from "./product-detail.module.css";
import { consumePlanReturn, trackStorefrontStep } from "@/lib/storefront-metrics";
import styles from "./shop.module.css";
import { cn } from "@/lib/cn";
import { formatPrice, formatDate } from "@/lib/format";
import { planDisplayLabel, planTrustSummary } from "@/lib/product-variant";
import {
  availabilityLabel,
  availabilityOf,
  canBuyPlan,
  isStockedPlan,
  plansByAvailability,
} from "@/lib/product-availability";
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
  const stocked = plansByAvailability(product.plans).filter(isStockedPlan);
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
          <IndicativePriceLabel
            price={supplierCart ? plan.indicativePrice : null}
            locale={locale}
          />
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
        setBuyError(
          localeFa
            ? "وضعیت ورود مشخص نیست. صفحه را تازه کن."
            : "Reload to check your sign-in status.",
        );
        return;
      }
      if (!user) {
        if (addGuestCartItem(plan.id) === "full") {
          setBuyError(
            localeFa
              ? "سبد مهمان پر است و تا ۱۰ قلم جا دارد."
              : "Your guest cart already has ten items.",
          );
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

  const planPicker = (
    <VariantSelector
      key={slug + JSON.stringify(product.plans.map((p) => [p.id, p.variant, p.durationDays]))}
      plans={product.plans}
      value={activePlanId}
      onChange={selectPlan}
      locale={locale}
    />
  );

  const specsTable =
    product.specs.length === 0 ? (
      <p className="text-muted">{t.noSpecs}</p>
    ) : (
      <dl className={layout.specs}>
        {product.specs.map((s, i) => (
          <div key={i}>
            <dt>{s.label}</dt>
            <dd>
              <bdi>{s.value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
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

      <div className={layout.overview}>
        {/* Info */}
        <div className={cn(layout.intro, styles.detailInfo)}>
          <div className={layout.head}>
            <div className={layout.tile} data-kind={images.length ? "image" : "mark"}>
              {images.length ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[activeImage] ?? images[0]}
                  fetchPriority="high"
                  alt={product.name}
                />
              ) : (
                <span aria-hidden="true">{monogram(product.name)}</span>
              )}
            </div>
            <div className={layout.headText}>
              <div className={layout.chips}>
                <Badge tone="muted">{product.category.name}</Badge>
                {product.isFeatured && <Badge tone="primary">{t.featured}</Badge>}
                {plan?.onSale && (
                  <Badge tone="sale">
                    {new Intl.NumberFormat(localeFa ? "fa-IR" : "en-US", {
                      style: "percent",
                    }).format(plan.discountPercent / 100)}{" "}
                    {t.off}
                  </Badge>
                )}
              </div>
              <h1 className={layout.title}>
                <bdi>{product.name}</bdi>
              </h1>
              {product.rating.count > 0 && (
                <p className={layout.rating}>
                  <span aria-hidden="true">{stars(product.rating.average)}</span>{" "}
                  <span>
                    {numbers.format(product.rating.average)} ·{" "}
                    {numbers.format(product.rating.count)} {t.reviewsCount}
                  </span>
                </p>
              )}
            </div>
          </div>

          {product.shortDescription && <p className={layout.lead}>{product.shortDescription}</p>}

          {images.length > 1 && (
            <div className={layout.thumbs}>
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${product.name} — ${numbers.format(i + 1)}`}
                  aria-pressed={activeImage === i}
                  onClick={() => setActiveImage(i)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Purchase summary */}
        <aside className={layout.purchase} aria-labelledby="purchase-title">
          <Card className={cn(layout.purchaseCard, styles.planCard)}>
            <div className={layout.purchaseHead}>
              <span>{localeFa ? "پلن انتخاب‌شده" : "Selected plan"}</span>
              {plan && canBuy && (
                <span className={layout.ready}>
                  {localeFa ? "آمادهٔ خرید" : "Ready to purchase"}
                </span>
              )}
            </div>
            <h2 id="purchase-title" className={layout.purchaseTitle}>
              {plan ? (
                <bdi>{planDisplayLabel(plan.label, localeFa)}</bdi>
              ) : localeFa ? (
                "هنوز پلنی انتخاب نشده"
              ) : (
                "No plan selected yet"
              )}
            </h2>
            {plan && (
              <div className={layout.purchaseBadges} aria-live="polite">
                <Badge tone={availabilityOf(plan) === "LOCAL_STOCK" ? "success" : "muted"}>
                  {availabilityLabel(plan, locale)}
                </Badge>
                {plan.onSale && !plan.quoteRequired && (
                  <span className={layout.oldPrice}>
                    {formatPrice(plan.price, plan.currency, locale)}
                  </span>
                )}
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
              <p className={cn(layout.price, styles.detailPrice)}>
                <bdi>{formatPrice(plan.effectivePrice, plan.currency, locale)}</bdi>
              </p>
            )}

            {trustSummary && (
              <dl
                className={layout.trustSummary}
                aria-label={
                  localeFa ? "خلاصهٔ ضمانت و تحویل پلن" : "Plan warranty and delivery summary"
                }
              >
                <div className={layout.trustSummaryRow}>
                  <ClockIcon />
                  <dt>{localeFa ? "دسترسی و مدت" : "Access & term"}</dt>
                  <dd>{trustSummary.access}</dd>
                </div>
                <div className={layout.trustSummaryRow}>
                  <BoltIcon />
                  <dt>{localeFa ? "روش تحویل" : "Delivery"}</dt>
                  <dd>{trustSummary.delivery}</dd>
                </div>
                <div className={layout.trustSummaryRow}>
                  <ShieldIcon />
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
                  <ChatIcon />
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

            {plan && availabilityOf(plan) === "OUT_OF_STOCK" && user?.role !== "ADMIN" && (
              <StockAlertButton
                key={`alert:${plan.id}:${token ?? ""}`}
                planId={plan.id}
                locale={locale}
                loginPath={loginPath}
                token={user?.role === "USER" ? token : null}
                purchaseSummary={purchaseSummary}
              />
            )}
            {plan?.quoteRequired && availabilityOf(plan) === "ON_REQUEST" && (
              <SupplierQuotePanel
                key={`quote:${plan.id}:${JSON.stringify(plan.variant)}:${token ?? "anonymous"}`}
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
              <div className={layout.buy}>
                <ProductPurchaseAction
                  key={`buy:${plan?.id ?? ""}`}
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
                  <Button
                    type="button"
                    size="lg"
                    disabled={buying || authLoading}
                    onClick={addToCart}
                  >
                    {buying ? <Spinner /> : null}
                    {localeFa ? "افزودن به سبد خرید" : "Add to cart"}
                  </Button>
                </ProductPurchaseAction>
              </div>
            )}
            {supplierCart && (
              <p className={layout.purchaseNote}>
                {localeFa
                  ? "قیمت و موجودی تأمین‌کننده پیش از پرداخت در فاکتور دوباره بررسی می‌شود."
                  : "We’ll recheck supplier price and stock on the invoice before payment."}
              </p>
            )}

            {plan && !plan.quoteRequired && availabilityOf(plan) === "LOCAL_STOCK" && !canBuy && (
              <p role="status" className={layout.purchaseNote}>
                {localeFa
                  ? "خرید این پلن فعلاً فعال نیست."
                  : "Checkout is currently unavailable for this plan."}
              </p>
            )}
          </Card>
        </aside>

        {/* Plan picker */}
        <section className={layout.choose} aria-labelledby="plan-choose-title">
          <h2 id="plan-choose-title">{t.perPlan}</h2>
          {staleSelection && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {localeFa
                ? "پلن قبلی دیگر در دسترس نیست. یک پلن را دوباره انتخاب کن."
                : "Your previous plan is unavailable. Please choose a plan again."}
            </p>
          )}
          {product.plans.length > 0 && planPicker}
          {plan && (plan.activationTerms || plan.variant) && (
            <details key={`terms:${plan.id}`} className={layout.termsBox}>
              <summary className="oosta-disclosure min-h-12 p-4 text-sm font-medium">
                {plan.activationTerms
                  ? locale === "fa"
                    ? "شرایط و ضوابط فعال‌سازی این پلن"
                    : "Activation rules and plan terms"
                  : locale === "fa"
                    ? "شرایط اشتراک انتخاب‌شده"
                    : "Selected subscription terms"}
              </summary>
              <div className="space-y-3 border-t border-border p-4 text-sm leading-7">
                {plan.activationTerms ? (
                  <Markdown
                    text={plan.activationTerms.replace(
                      "پیش‌نیاز اختصاصی دیگری برای این گزینه از متن عرضه قابل تأیید نبود. اگر شرط خاصی برای حساب، منطقه یا دستگاه داری، قبل از خرید از پشتیبانی بپرس.",
                      "اگر دربارهٔ شرایط حساب، منطقه یا دستگاه سؤال دارید، پیش از خرید از پشتیبانی بپرسید.",
                    )}
                  />
                ) : (
                  <p className="text-muted">
                    {locale === "fa"
                      ? "اگر برای فعال‌سازی به کمک نیاز دارید، شمارهٔ سفارش و شرح مشکل را در تیکت بنویسید. رمز عبور یا کد تأیید را ارسال نکنید."
                      : "For support, include the order number and error description in a ticket. Keep passwords and verification codes out of tickets."}
                  </p>
                )}
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
        </section>

        <div className={cn(layout.support, styles.supportNote)}>
          <span>
            <InfoIcon />
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
        <div role="tablist" aria-label={product.name} className={layout.tablist}>
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
            >
              {label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id="product-panel"
          aria-labelledby={`product-tab-${tab}`}
          className={layout.panel}
        >
          {tab === "description" && (
            <div className={cn(layout.descGrid, product.specs.length > 0 && layout.withSpecs)}>
              <Markdown
                text={product.description}
                headingOffset={0}
                className={cn("text-muted [&_p]:leading-8", layout.desc)}
              />
              {product.specs.length > 0 && (
                <aside className={layout.specsCard} aria-labelledby="specs-aside-title">
                  <h2 id="specs-aside-title">{t.tabSpecs}</h2>
                  {specsTable}
                </aside>
              )}
            </div>
          )}

          {tab === "specs" && <div className={layout.specsOnly}>{specsTable}</div>}

          {tab === "reviews" && (
            <div className={layout.reviewsGrid}>
              <div className={layout.reviewList}>
                {reviewsList.length === 0 ? (
                  <p className="text-muted">{t.noReviews}</p>
                ) : (
                  reviewsList.map((r) => (
                    <article key={r.id} className={layout.review}>
                      <div className={layout.reviewHead}>
                        <span className={layout.avatar} aria-hidden="true">
                          {Array.from(r.userName.trim())[0] ?? "?"}
                        </span>
                        <span className={layout.reviewWho}>
                          <strong>
                            <bdi>{r.userName}</bdi>
                          </strong>
                          {r.isPendingLocal && (
                            <span className={layout.pending}>{dict.admin.reviews.pending}</span>
                          )}
                          <small>{formatDate(r.createdAt, locale)}</small>
                        </span>
                        <span
                          className={layout.reviewStars}
                          role="img"
                          aria-label={`${numbers.format(r.rating)} / ${numbers.format(5)}`}
                        >
                          {stars(r.rating)}
                        </span>
                      </div>
                      {r.comment && <p>{r.comment}</p>}
                    </article>
                  ))
                )}
              </div>

              {/* Write a review */}
              <Card className={layout.reviewForm}>
                <h3>{t.writeReview}</h3>
                {!user ? (
                  <Link
                    href={loginPath}
                    className="mt-2 inline-block text-sm text-primary hover:underline"
                  >
                    {t.loginToReview}
                  </Link>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className={layout.ratePick}>
                      <span id="review-rating-label">{t.yourRating}</span>
                      <div role="group" aria-labelledby="review-rating-label">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            aria-label={`${n} / 5`}
                            aria-pressed={n === rating}
                            type="button"
                            onClick={() => setRating(n)}
                            data-on={n <= rating}
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
                      aria-label={t.yourComment}
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
        <section className={layout.related} aria-labelledby="related-title">
          <h2 id="related-title">{t.related}</h2>
          <div className={layout.relatedGrid}>
            {product.related.map((rp) => (
              <ProductCard key={rp.id} product={rp} locale={locale} labels={cardLabels} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg {...iconProps}>
      <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
