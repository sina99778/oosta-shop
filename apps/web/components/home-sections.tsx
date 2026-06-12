import Link from "next/link";
import { fetchJson } from "@/lib/seo";
import { formatPrice } from "@/lib/format";
import { ProductCard } from "@/components/product-card";
import { ProductMark } from "@/components/product-mark";
import { Container } from "@/components/ui/container";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

const CATEGORY_ICONS: Record<string, string> = {
  "ai-accounts": "AI",
  "software-licenses": "⌁",
  "gift-cards": "□",
};

function ArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function FeatureIcon({ kind }: { kind: "bolt" | "shield" | "headset" | "return" }) {
  const paths = {
    bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8z",
    shield: "M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z",
    headset: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5Z",
    return: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

export async function HomeSections({
  locale,
  dict,
  heroTitle,
  heroSubtitle,
}: {
  locale: Locale;
  dict: Dictionary;
  heroTitle: string;
  heroSubtitle: string;
}) {
  const [categoriesData, bestData] = await Promise.all([
    fetchJson<{ categories: Category[] }>("/categories"),
    fetchJson<{ products: ProductSummary[] }>("/products/bestselling?limit=8"),
  ]);
  const categories = categoriesData?.categories ?? [];
  const best = bestData?.products ?? [];

  const copy =
    locale === "fa"
      ? {
          heroAccent: "فوری مال توئه",
          kicker: "تحویل فوری",
          primaryCta: "بزن بریم",
          live: "موجودی زنده",
          product: "محصول",
          price: "قیمت از",
          stock: "موجودی",
          delivery: "تحویل",
          instant: "آنی",
          allProducts: "مشاهده همه محصولات",
          customers: "خرید مستقیم و تحویل کاملاً خودکار",
          categoryAll: "همه",
          newPopular: "جدید و محبوب",
          dashboardTitle: "در داشبوردت تحویل بگیر",
          paymentSuccess: "پرداخت موفق",
          deliveredInfo: "اطلاعات تحویل",
          ready: "آماده مشاهده",
          email: "ایمیل / ورود",
          password: "رمز عبور",
          viewDashboard: "مشاهده در داشبورد",
          categoryNames: {
            "ai-accounts": "اکانت‌های AI",
            "software-licenses": "لایسنس نرم‌افزار",
            "gift-cards": "گیفت‌کارت",
          } as Record<string, string>,
        }
      : {
          heroAccent: "instantly yours",
          kicker: "Instant delivery",
          primaryCta: "Start shopping",
          live: "Live inventory",
          product: "Product",
          price: "From",
          stock: "Stock",
          delivery: "Delivery",
          instant: "Instant",
          allProducts: "View all products",
          customers: "Direct purchase with fully automatic delivery",
          categoryAll: "All",
          newPopular: "New and popular",
          dashboardTitle: "Delivered to your dashboard",
          paymentSuccess: "Payment successful",
          deliveredInfo: "Delivery details",
          ready: "Ready to view",
          email: "Email / Login",
          password: "Password",
          viewDashboard: "View in dashboard",
          categoryNames: {
            "ai-accounts": "AI accounts",
            "software-licenses": "Software licenses",
            "gift-cards": "Gift cards",
          } as Record<string, string>,
        };

  const labels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
    featured: dict.product.featured,
    off: dict.product.off,
    left: dict.product.left,
  };

  const liveProducts = best.slice(0, 5);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-[#0d0d0d] text-[#f7f3ea]">
        <div className="signal-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="signal-halftone pointer-events-none absolute -end-24 top-10 h-[420px] w-[440px] opacity-70" />
        <Container className="relative grid gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-16">
          <div className="lg:pe-6">
            <span className="inline-flex items-center gap-2 border border-primary px-4 py-2 text-sm font-black text-primary">
              <FeatureIcon kind="bolt" />
              {copy.kicker}
            </span>
            <h1 className="signal-display mt-7 max-w-3xl text-5xl sm:text-6xl lg:text-7xl xl:text-[86px]">
              <span className="block">{heroTitle}</span>
              <span className="mt-2 block text-primary">{copy.heroAccent}</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-[#bdb7ae] sm:text-lg">
              {heroSubtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/products`}
                className="inline-flex h-14 min-w-44 items-center justify-center gap-3 bg-primary px-7 text-base font-black text-white transition-colors hover:bg-primary-hover"
              >
                <FeatureIcon kind="bolt" />
                {copy.primaryCta}
              </Link>
              <Link
                href={`/${locale}/products`}
                className="inline-flex h-14 min-w-44 items-center justify-center gap-3 border border-[#f7f3ea] px-7 text-base font-black transition-colors hover:border-primary hover:text-primary"
              >
                {dict.home.browse}
                <span className="rtl:-scale-x-100">
                  <ArrowIcon />
                </span>
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#c9c3b9]">
              <span className="inline-flex items-center gap-2">
                <FeatureIcon kind="bolt" />
                {dict.home.trust1}
              </span>
              <span className="inline-flex items-center gap-2">
                <FeatureIcon kind="shield" />
                {dict.home.trust2}
              </span>
              <span className="inline-flex items-center gap-2">
                <FeatureIcon kind="headset" />
                {dict.home.trust3}
              </span>
            </div>
          </div>

          <div className="border-2 border-accent bg-[#111] p-4 shadow-[10px_10px_0_0_#ffd500] sm:p-5">
            <div className="mb-4 flex items-center gap-4">
              <span className="h-px flex-1 bg-accent/50" />
              <h2 className="bg-accent px-5 py-2 text-lg font-black text-black sm:text-xl">
                <span className="me-2 inline-block size-2.5 animate-pulse rounded-full bg-primary" />
                {copy.live}
              </h2>
              <span className="h-px flex-1 bg-accent/50" />
            </div>
            <div className="grid grid-cols-[minmax(0,1.65fr)_0.85fr_0.7fr_0.65fr] gap-2 border-b border-[#494949] px-2 pb-3 text-xs font-bold text-accent sm:text-sm">
              <span>{copy.product}</span>
              <span>{copy.price}</span>
              <span>{copy.stock}</span>
              <span>{copy.delivery}</span>
            </div>
            <div>
              {liveProducts.map((product) => (
                <Link
                  key={product.id}
                  href={`/${locale}/products/${product.slug}`}
                  className="grid grid-cols-[minmax(0,1.65fr)_0.85fr_0.7fr_0.65fr] items-center gap-2 border-b border-[#393939] px-2 py-3 text-xs transition-colors hover:bg-white/5 sm:text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 font-bold">
                    <ProductMark
                      name={product.name}
                      slug={product.slug}
                      type={product.type}
                      className="size-9"
                    />
                    <span className="truncate" dir="ltr">
                      {product.name.replace(" Account", "")}
                    </span>
                  </span>
                  <span className="truncate font-bold">
                    {product.priceFrom !== null
                      ? formatPrice(product.priceFrom, product.currency, locale)
                      : "—"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      product.inStock ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    <i
                      className={`size-2 rounded-full ${
                        product.inStock ? "bg-emerald-400" : "bg-red-400"
                      }`}
                    />
                    {product.inStock ? dict.common.inStock : dict.common.outOfStock}
                  </span>
                  <span className="inline-flex items-center gap-1 text-accent">
                    <FeatureIcon kind="bolt" />
                    {copy.instant}
                  </span>
                </Link>
              ))}
            </div>
            <Link
              href={`/${locale}/products`}
              className="mt-4 flex h-12 items-center justify-between bg-accent px-5 font-black text-black transition-colors hover:bg-yellow-300"
            >
              {copy.allProducts}
              <span className="rtl:-scale-x-100">
                <ArrowIcon />
              </span>
            </Link>
          </div>
        </Container>
      </section>

      <section className="signal-ticker border-b border-t border-black">
        <Container className="grid grid-cols-2 divide-x divide-black/20 py-0 md:grid-cols-4 rtl:divide-x-reverse">
          {[
            ["bolt", dict.home.featInstantTitle, dict.home.featInstantText],
            ["shield", dict.home.featSecureTitle, dict.home.featSecureText],
            ["headset", dict.home.featSupportTitle, dict.home.featSupportText],
            ["return", dict.home.featWarrantyTitle, dict.home.featWarrantyText],
          ].map(([kind, title, text]) => (
            <div key={title} className="flex min-h-24 items-center gap-3 px-3 py-4 sm:px-5">
              <span className="text-primary">
                <FeatureIcon kind={kind as "bolt" | "shield" | "headset" | "return"} />
              </span>
              <div>
                <p className="font-black">{title}</p>
                <p className="mt-1 hidden text-xs text-black/60 sm:block">{text}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      <Container className="grid gap-8 py-10 lg:grid-cols-[330px_minmax(0,1fr)] lg:py-14">
        <aside className="h-fit border border-accent bg-card p-4 lg:sticky lg:top-24">
          <h2 className="flex items-center gap-2 text-lg font-black text-accent">
            <span className="text-2xl">□</span>
            {copy.dashboardTitle}
          </h2>
          <div className="mt-4 border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs">
              <span dir="ltr">#ORD-4587</span>
              <span className="bg-success/20 px-2 py-1 font-bold text-success">
                {copy.paymentSuccess}
              </span>
            </div>
            <div className="flex items-center gap-3 border-b border-border p-4">
              <ProductMark
                name="ChatGPT Plus"
                slug="chatgpt-plus"
                type="ACCOUNT"
                className="size-12"
              />
              <div>
                <p className="font-black" dir="ltr">
                  ChatGPT Plus
                </p>
                <p className="text-xs text-muted">{dict.product.instantDelivery}</p>
              </div>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold">{copy.deliveredInfo}</span>
                <span className="text-accent">✓</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-muted">{copy.email}</span>
                <span dir="ltr">user@example.com</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-muted">{copy.password}</span>
                <span dir="ltr">••••••••</span>
              </div>
              <p className="border-t border-border pt-3 text-xs text-success">● {copy.ready}</p>
            </div>
          </div>
          <Link
            href={`/${locale}/dashboard`}
            className="mt-4 flex h-12 items-center justify-between bg-accent px-4 font-black text-black hover:bg-yellow-300"
          >
            {copy.viewDashboard}
            <span className="rtl:-scale-x-100">
              <ArrowIcon />
            </span>
          </Link>
        </aside>

        <div>
          {categories.length > 0 && (
            <nav className="grid border border-border sm:grid-cols-2 lg:grid-cols-4">
              <Link
                href={`/${locale}/products`}
                className="flex min-h-16 items-center justify-center gap-3 bg-accent px-4 font-black text-black"
              >
                <span className="text-xl">▦</span>
                {copy.categoryAll}
              </Link>
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/${locale}/products?category=${category.slug}`}
                  className="flex min-h-16 items-center justify-center gap-3 border-t border-border px-4 font-black transition-colors hover:bg-primary hover:text-white sm:border-s sm:border-t-0"
                >
                  <span className="text-xl text-primary">
                    {CATEGORY_ICONS[category.slug] ?? "•"}
                  </span>
                  {copy.categoryNames[category.slug] ?? category.name}
                </Link>
              ))}
            </nav>
          )}

          <section className="mt-8">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-3 text-2xl font-black">
                <span className="h-7 w-1 bg-primary" />
                {copy.newPopular}
              </h2>
              <Link
                href={`/${locale}/products`}
                className="text-sm font-bold text-primary hover:underline"
              >
                {dict.common.viewAll}
              </Link>
            </div>
            {best.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {best.slice(0, 4).map((product) => (
                  <ProductCard key={product.id} product={product} locale={locale} labels={labels} />
                ))}
              </div>
            ) : (
              <p className="text-muted">{dict.home.noProducts}</p>
            )}
            <p className="mt-5 flex items-center gap-2 text-sm text-muted">
              <span className="size-2 rounded-full bg-success" />
              {copy.customers}
            </p>
          </section>
        </div>
      </Container>
    </>
  );
}
