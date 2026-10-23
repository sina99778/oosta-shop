import Link from "next/link";
import { fetchJson } from "@/lib/seo";
import { ProductCard } from "@/components/product-card";
import { Diamond, Postmark, ProductStamp, StampArt } from "@/components/stamp";
import { Container } from "@/components/ui/container";
import { categoryName } from "@/lib/category-name";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductSummary, ProductType } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

// Category slug -> which stamp series art represents it.
const SERIES: Record<string, { type: ProductType; slug: string }> = {
  "ai-accounts": { type: "ACCOUNT", slug: "chatgpt" },
  "software-licenses": { type: "LICENSE", slug: "windows" },
  "gift-cards": { type: "GIFTCARD", slug: "google-play" },
};

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden
      className="ltr:-scale-x-100"
    >
      <path d="M15 6l-6 6 6 6" />
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
  const h = dict.home;
  const base = `/${locale}`;

  const cardLabels = {
    from: dict.common.from,
    inStock: dict.common.inStock,
    outOfStock: dict.common.outOfStock,
    featured: dict.product.featured,
    off: dict.product.off,
    left: dict.product.left,
  };

  // Three stamps stuck on the hero envelope: real bestsellers when we have them.
  const envelopeStamps = best.slice(0, 3);
  const stampSpots = [
    "top-[120px] end-[60px] rotate-[5deg]",
    "top-[150px] end-[196px] -rotate-[4deg]",
    "top-[110px] start-[40px] rotate-[9deg]",
  ];

  return (
    <>
      {/* ---- Hero: the promise + an airmail envelope ---- */}
      <Container className="grid items-center gap-12 py-12 lg:grid-cols-2 lg:py-16">
        <div className="flex flex-col gap-5">
          <span className="flex items-center gap-2 text-sm font-bold text-primary">
            <span aria-hidden className="w-6 border-t-2 border-primary" />
            {h.heroKicker}
          </span>
          <h1 className="text-4xl leading-[1.3] font-black tracking-tight sm:text-5xl">
            {heroTitle}
            <br />
            <span className="text-primary">{h.heroAccent}</span>
          </h1>
          <p className="max-w-xl text-base leading-8 text-muted sm:text-lg sm:leading-9">
            {heroSubtitle}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`${base}/products`}
              className="inline-flex h-13 items-center gap-2 rounded-[10px] bg-primary px-6 font-extrabold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              {h.browse}
              <ChevronIcon />
            </Link>
            <a
              href="#how"
              className="inline-flex h-13 items-center rounded-[10px] border border-foreground px-5 font-bold transition-colors hover:border-primary hover:text-primary"
            >
              {h.howCta}
            </a>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-7 gap-y-2 border-t border-dashed border-border pt-4 text-sm text-muted">
            <Diamond>{h.trust1}</Diamond>
            <Diamond>{h.trust2}</Diamond>
            <Diamond>{h.trust3}</Diamond>
          </ul>
        </div>

        <div aria-hidden className="airmail rounded-md p-2.5">
          <div className="relative h-[340px] overflow-hidden rounded-sm bg-[#f6f1e7] text-[#1b2433] sm:h-[380px]">
            <div className="absolute inset-x-7 top-6 flex justify-between text-[13px] text-[#6d6656]">
              <div className="flex w-[46%] flex-col gap-1.5">
                <span>{h.envelopeTo}</span>
                <span className="border-b border-[#cfc5b2] pb-1 font-bold text-[#1b2433]">
                  {h.envelopeDashboard}
                </span>
                <span className="border-b border-[#cfc5b2] pb-1">{h.envelopeVault}</span>
              </div>
              <span className="font-mono text-xs tracking-[2px]" dir="ltr">
                PAR AVION
              </span>
            </div>
            {envelopeStamps.map((p, i) => (
              <span key={p.id} className={`absolute ${stampSpots[i]}`}>
                <ProductStamp
                  slug={p.slug}
                  type={p.type}
                  name={p.name}
                  size={i === 1 ? "lg" : "md"}
                  hole="#f6f1e7"
                  series={categoryName(p.category, locale)}
                />
              </span>
            ))}
            <Postmark
              label={h.postmarkLabel}
              id="hero-postmark"
              className="absolute bottom-6 start-16 w-[230px] -rotate-12 text-[rgba(160,40,22,0.82)]"
            />
          </div>
        </div>
      </Container>

      {/* ---- The three series ---- */}
      {categories.length > 0 && (
        <section aria-labelledby="series-title">
          <Container className="pb-12">
            <h2 id="series-title" className="text-2xl font-black">
              {h.seriesTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">{h.seriesSubtitle}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => {
                const series = SERIES[c.slug] ?? { type: "ACCOUNT" as ProductType, slug: c.slug };
                return (
                  <Link
                    key={c.id}
                    href={`${base}/products?category=${c.slug}`}
                    className="group flex items-center gap-5 rounded-[14px] border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/50"
                  >
                    <ProductStamp
                      slug={series.slug}
                      type={series.type}
                      name={c.name}
                      size="sm"
                      hole="var(--c-card)"
                    />
                    <span className="flex flex-col gap-0.5">
                      <strong className="text-lg group-hover:text-primary">
                        {categoryName(c, locale)}
                      </strong>
                      <span className="text-sm text-muted">
                        {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(
                          c.productCount,
                        )}{" "}
                        {h.seriesItems}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </Container>
        </section>
      )}

      {/* ---- Bestsellers ---- */}
      <section aria-labelledby="best-title">
        <Container className="pb-14">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 id="best-title" className="text-2xl font-black">
                {h.bestsellers}
              </h2>
              <p className="mt-1 text-sm text-muted">{h.bestsellersSubtitle}</p>
            </div>
            <Link
              href={`${base}/products`}
              className="shrink-0 border-b border-foreground text-sm font-bold hover:border-primary hover:text-primary"
            >
              {h.allProducts}
            </Link>
          </div>
          {best.length === 0 ? (
            <p className="text-muted">{h.noProducts}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {best.map((p) => (
                <ProductCard key={p.id} product={p} locale={locale} labels={cardLabels} />
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* ---- How delivery works ---- */}
      <section id="how" aria-labelledby="how-title" className="bg-ink text-[#f3eee4]">
        <Container className="py-12">
          <h2 id="how-title" className="text-2xl font-black">
            {h.howTitle}
          </h2>
          <p className="mt-1.5 text-sm text-[#c3cad6]">{h.howSubtitle}</p>
          <ol className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              [h.step1Title, h.step1Text],
              [h.step2Title, h.step2Text],
              [h.step3Title, h.step3Text],
            ].map(([title, text], i) => (
              <li
                key={title}
                className="flex items-start gap-4 rounded-[14px] border border-[rgba(243,238,228,0.16)] p-5"
              >
                <span
                  aria-hidden
                  className="grid size-13 shrink-0 -rotate-[10deg] place-items-center rounded-full border-2 border-[#e98a73] text-xl font-black text-[#f2a08c]"
                >
                  {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(i + 1)}
                </span>
                <span>
                  <strong className="mb-1 block text-base">{title}</strong>
                  <span className="text-[13px] leading-7 text-[#c3cad6]">{text}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex items-center gap-3 text-[#e98a73]">
            <StampArt kind="knot" className="size-6" />
            <span className="text-sm text-[#c3cad6]">{dict.footer.tagline}</span>
          </div>
        </Container>
      </section>
    </>
  );
}
