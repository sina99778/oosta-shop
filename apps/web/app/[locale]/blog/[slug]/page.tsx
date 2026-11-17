import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { JournalArticle } from "@/components/journal";
import { fetchJson, siteUrl } from "@/lib/seo";
import { assetUrl } from "@/lib/api";
import type { BlogPostDetail } from "@/lib/types";

async function load(slug: string): Promise<BlogPostDetail | null> {
  const data = await fetchJson<{ post: BlogPostDetail }>(`/blog/${encodeURIComponent(slug)}`, 0);
  return data?.post ?? null;
}

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await load(slug);
  if (!post) return { title: "Not found" };
  const description = post.excerpt || post.content.replace(/[#*!]/g, "").slice(0, 160);
  const image = post.hasCover ? new URL(assetUrl(`/blog-cover/${post.id}`), siteUrl()).href : undefined;
  const url = `${siteUrl()}/${locale}/blog/${slug}`;
  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      type: "article",
      images: image ? [{ url: image }] : undefined,
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

  const cover = post.hasCover ? new URL(assetUrl(`/blog-cover/${post.id}`), siteUrl()).href : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: cover ? [cover] : undefined,
    datePublished: post.publishedAt ?? undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <JournalArticle post={post} locale={locale} back={dict.blog.back} />
    </>
  );
}
