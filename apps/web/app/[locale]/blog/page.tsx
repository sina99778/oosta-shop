import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { fetchJson } from "@/lib/seo";
import { Journal } from "@/components/journal";
import type { BlogPostSummary } from "@/lib/types";
import { collectionJsonLd, localizedPageMetadata, safeJsonLd } from "@/lib/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  return localizedPageMetadata(locale, "/blog", dict.meta.blogTitle, dict.meta.blogDescription);
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const data = await fetchJson<{ posts: BlogPostSummary[] }>("/blog", 0);
  const schema = collectionJsonLd(locale, "/blog", dict.meta.blogTitle, dict.meta.blogDescription);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
      <Journal locale={locale} dict={dict} posts={data?.posts ?? []} unavailable={!data} />
    </>
  );
}
