import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { JournalArticle } from "@/components/journal";
import { fetchJson, siteUrl } from "@/lib/seo";
import { assetUrl } from "@/lib/api";
import type { BlogPostDetail } from "@/lib/types";
import {
  CONTENT_LOCALE,
  DEFAULT_SHARE_IMAGE,
  contentAlternates,
  organizationJsonLd,
  safeJsonLd,
} from "@/lib/page-metadata";

async function load(slug: string): Promise<BlogPostDetail | null> {
  const data = await fetchJson<{ post: BlogPostDetail }>(`/blog/${encodeURIComponent(slug)}`, 0);
  return data?.post ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await load(slug);
  if (!post) return { title: "Not found" };
  const description = post.excerpt || post.content.replace(/[#*!]/g, "").slice(0, 160);
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
    inLanguage: "fa-IR",
    author: { "@id": `${siteUrl()}/#organization` },
    publisher: organizationJsonLd(),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <JournalArticle post={post} locale={locale} back={dict.blog.back} />
    </>
  );
}
