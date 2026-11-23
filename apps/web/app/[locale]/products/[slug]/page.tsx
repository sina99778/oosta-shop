import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { ProductDetailView } from "@/components/product-detail-view";
import { RelatedContentLinks } from "@/components/related-content-links";
import { ARTICLE_PRODUCTS, PRODUCT_API_PAIRS } from "@/lib/catalog-editorial";
import { fetchJson, siteUrl } from "@/lib/seo";
import { getSiteSettings, telegramSupportHref } from "@/lib/settings";
import { productImageUrl } from "@/lib/api";
import type { BlogPostSummary, PaymentConfig, ProductDetail } from "@/lib/types";
import { availabilityOf, canBuyPlan } from "@/lib/product-availability";
import {
  CONTENT_LOCALE,
  DEFAULT_SHARE_IMAGE,
  contentAlternates,
  metadataExcerpt,
  safeJsonLd,
} from "@/lib/page-metadata";

const loadProduct = cache(
  async (slug: string) =>
    (await fetchJson<{ product: ProductDetail }>(`/products/${encodeURIComponent(slug)}`, 0, true))
      ?.product,
);

function imageFor(p: ProductDetail): string | undefined {
  const image = productImageUrl(p);
  if (!image) return undefined;
  try {
    const url = new URL(image, siteUrl());
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return undefined;
  }
}

function productUrl(locale: string, slug: string) {
  return `${siteUrl()}/${locale}/products/${encodeURIComponent(slug)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const p = await loadProduct(slug);
  if (!p) return { title: "Not found" };

  const title = p.metaTitle || p.name;
  const description = p.metaDescription || p.shortDescription || metadataExcerpt(p.description);
  const image = imageFor(p);
  // Product copy is stored in Persian only, so /en/products/<slug> is the same
  // content in English chrome: both locales canonicalize to the Persian URL.
  const url = productUrl(CONTENT_LOCALE, p.slug);

  return {
    title,
    description,
    alternates: contentAlternates(`/products/${encodeURIComponent(p.slug)}`),
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: image ? [{ url: image }] : [DEFAULT_SHARE_IMAGE],
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const rawPlan = (await searchParams)?.plan;
  const requestedPlanId = Array.isArray(rawPlan) ? "" : rawPlan;
  const [dict, p, settings] = await Promise.all([
    getDictionary(locale),
    loadProduct(slug),
    getSiteSettings(),
  ]);
  // A missing/inactive product must be a real 404 (matches blog/[slug] and p/[slug]),
  // not a 200 soft-404 that search engines penalize.
  if (!p) notFound();
  const localPlans = p.plans.filter((plan) => availabilityOf(plan) === "LOCAL_STOCK");
  const articles = Object.entries(ARTICLE_PRODUCTS)
    .filter(([, products]) => products.includes(p.slug))
    .map(([article]) => article);
  const apiSlug = Object.hasOwn(PRODUCT_API_PAIRS, p.slug) ? PRODUCT_API_PAIRS[p.slug] : undefined;
  const appSlug = Object.entries(PRODUCT_API_PAIRS).find(([, api]) => api === p.slug)?.[0];
  const relatedSlug = apiSlug ?? appSlug;
  const [payment, blog, counterpart] = await Promise.all([
    localPlans.length ? fetchJson<PaymentConfig>("/payments/config", 0) : null,
    articles.length
      ? fetchJson<{ posts: Pick<BlogPostSummary, "slug" | "title">[] }>("/blog")
      : null,
    relatedSlug
      ? fetchJson<{ product: Pick<ProductDetail, "slug" | "name"> }>(
          `/products/${encodeURIComponent(relatedSlug)}`,
        )
      : null,
  ]);
  const fa = locale === "fa";
  const relatedLinks = [
    ...(counterpart
      ? [
          {
            href: `/${locale}/products/${encodeURIComponent(counterpart.product.slug)}`,
            label: apiSlug
              ? fa
                ? `اعتبار API برای ${p.name}`
                : `${p.name} API credits`
              : fa
                ? `اشتراک ${counterpart.product.name}`
                : `${counterpart.product.name} subscription`,
          },
        ]
      : []),
    ...(blog?.posts ?? [])
      .filter((post) => articles.includes(post.slug))
      .map((post) => ({
        href: `/${locale}/blog/${encodeURIComponent(post.slug)}`,
        label: post.title,
      })),
  ];
  const prices = localPlans.flatMap((plan) => {
    if (!canBuyPlan(plan, payment)) return [];
    const price =
      plan.currency === "IRT"
        ? plan.effectivePrice * 10
        : plan.currency === "IRR"
          ? plan.effectivePrice
          : null;
    return price !== null && Number.isFinite(price) && price > 0 ? [{ price }] : [];
  });
  const offer = prices.reduce<(typeof prices)[number] | undefined>(
    (cheapest, item) => (!cheapest || item.price < cheapest.price ? item : cheapest),
    undefined,
  );
  const url = productUrl(CONTENT_LOCALE, p.slug);
  const jsonLd =
    offer || p.rating.count > 0
      ? {
          "@type": "Product",
          "@id": `${url}#product`,
          url,
          sku: p.id,
          name: p.name,
          description: p.shortDescription || metadataExcerpt(p.description, 200),
          image: imageFor(p) ? [imageFor(p)] : undefined,
          category: p.category.name,
          offers: offer
            ? {
                "@type": "Offer",
                url,
                price: offer.price,
                priceCurrency: "IRR",
                availability: "https://schema.org/InStock",
              }
            : undefined,
          aggregateRating:
            p.rating.count > 0
              ? {
                  "@type": "AggregateRating",
                  ratingValue: p.rating.average,
                  reviewCount: p.rating.count,
                }
              : undefined,
        }
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              ...(jsonLd ? [jsonLd] : []),
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: locale === "fa" ? "خانه" : "Home",
                    item: `${siteUrl()}/${locale}`,
                  },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: p.category.name,
                    item: `${siteUrl()}/${locale}/products?category=${encodeURIComponent(p.category.slug)}`,
                  },
                  {
                    "@type": "ListItem",
                    position: 3,
                    name: p.name,
                    item: productUrl(locale, p.slug),
                  },
                ],
              },
            ],
          }),
        }}
      />
      <ProductDetailView
        key={JSON.stringify([p.id, requestedPlanId])}
        requestedPlanId={requestedPlanId}
        locale={locale}
        product={p}
        payment={payment ? { online: payment.online, cardToCard: payment.cardToCard } : null}
        supportHref={telegramSupportHref(settings)}
        dict={dict}
      />
      <RelatedContentLinks
        title={fa ? "راهنماها و گزینه‌های مرتبط" : "Related guides and options"}
        links={relatedLinks}
      />
    </>
  );
}
