import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { ProductDetailView } from "@/components/product-detail-view";
import { fetchJson, apiOrigin, siteUrl } from "@/lib/seo";
import type { ProductDetail } from "@/lib/types";

function imageFor(p: ProductDetail): string | undefined {
  if (p.image) return p.image;
  if (p.hasImage) return `${apiOrigin()}/products/${p.id}/image`;
  return undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await fetchJson<{ product: ProductDetail }>(`/products/${slug}`);
  const p = data?.product;
  if (!p) return { title: "Not found" };

  const title = p.metaTitle || p.name;
  const description =
    p.metaDescription || p.shortDescription || p.description.replace(/[#*]/g, "").slice(0, 160);
  const image = imageFor(p);
  const url = `${siteUrl()}/${locale}/products/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: image ? [{ url: image }] : undefined,
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
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  // Server-fetch for Product structured data (JSON-LD). The view re-fetches client-side.
  const data = await fetchJson<{ product: ProductDetail }>(`/products/${slug}`);
  const p = data?.product;
  const jsonLd = p
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.shortDescription || p.description.replace(/[#*]/g, "").slice(0, 200),
        image: imageFor(p) ? [imageFor(p)] : undefined,
        category: p.category.name,
        offers:
          p.priceFrom != null
            ? {
                "@type": "Offer",
                price: p.priceFrom,
                priceCurrency: p.currency,
                availability: p.inStock
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
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
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductDetailView locale={locale} slug={slug} dict={dict} />
    </>
  );
}
