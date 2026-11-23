import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { JournalArticle } from "@/components/journal";
import { ARTICLE_PRODUCTS } from "@/lib/catalog-editorial";
import { fetchJson, siteUrl } from "@/lib/seo";
import { assetUrl } from "@/lib/api";
import { getSiteSettings, telegramSupportHref } from "@/lib/settings";
import type { BlogPostDetail, ProductDetail } from "@/lib/types";
import {
  CONTENT_LOCALE,
  DEFAULT_SHARE_IMAGE,
  contentAlternates,
  metadataExcerpt,
  organizationJsonLd,
  safeJsonLd,
} from "@/lib/page-metadata";

const load = cache(async (slug: string): Promise<BlogPostDetail | null> => {
  const data = await fetchJson<{ post: BlogPostDetail }>(`/blog/${encodeURIComponent(slug)}`, 0);
  return data?.post ?? null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const post = await load(slug);
  if (!post) return { title: "Not found" };
  const description = post.excerpt || metadataExcerpt(post.content);
  const image = post.hasCover
    ? new URL(assetUrl(`/blog-cover/${post.id}`), siteUrl()).href
    : undefined;
  // Posts are written in Persian only; /en/blog/<slug> canonicalizes to /fa.
  const alternates = contentAlternates(`/blog/${encodeURIComponent(post.slug)}`);
  return {
    title: post.title,
    description,
    alternates,
    openGraph: {
      title: post.title,
      description,
      url: alternates.canonical as string,
      type: "article",
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt ?? undefined,
      images: image ? [{ url: image }] : [DEFAULT_SHARE_IMAGE],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const post = await load(slug);
  if (!post) notFound();
  const editorial = Object.hasOwn(ARTICLE_PRODUCTS, post.slug) ? ARTICLE_PRODUCTS[post.slug] : [];
  // Products linked from the article body (resolved by the API) join the editorial list.
  const linked = (post.products ?? []).map((product) => product.slug);
  const productSlugs = [...new Set([...editorial, ...linked])].slice(0, 6);
  const [products, settings] = await Promise.all([
    Promise.all(
      productSlugs.map((productSlug) =>
        fetchJson<{ product: Pick<ProductDetail, "slug" | "name"> & Partial<ProductDetail> }>(
          `/products/${encodeURIComponent(productSlug)}`,
        ),
      ),
    ),
    getSiteSettings().catch(() => null),
  ]);
  // Starting price: the cheapest listed, non-quote plan of each product.
  const articleProducts = products.flatMap((result) => {
    if (!result) return [];
    const priced = (result.product.plans ?? []).filter(
      (plan) =>
        !plan.quoteRequired && plan.availability !== "OUT_OF_STOCK" && plan.effectivePrice > 0,
    );
    const cheapest = priced.reduce<(typeof priced)[number] | null>(
      (min, plan) => (!min || plan.effectivePrice < min.effectivePrice ? plan : min),
      null,
    );
    return [
      {
        slug: result.product.slug,
        name: result.product.name,
        fromPrice: cheapest?.effectivePrice ?? null,
        currency: cheapest?.currency ?? "IRR",
      },
    ];
  });

  const cover = post.hasCover ? new URL(assetUrl(`/blog-cover/${post.id}`), siteUrl()).href : null;
  const url = `${siteUrl()}/${CONTENT_LOCALE}/blog/${encodeURIComponent(post.slug)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: cover ? [cover] : undefined,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt ?? undefined,
    inLanguage: "fa-IR",
    author: { "@id": `${siteUrl()}/#organization` },
    publisher: organizationJsonLd(),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <JournalArticle
        post={post}
        locale={locale}
        back={dict.blog.back}
        products={articleProducts}
        supportHref={settings ? telegramSupportHref(settings) : ""}
        url={url}
      />
    </>
  );
}
