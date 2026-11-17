import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { fetchJson } from "@/lib/seo";
import { Journal } from "@/components/journal";
import type { BlogPostSummary } from "@/lib/types";

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const data = await fetchJson<{ posts: BlogPostSummary[] }>("/blog", 0);
  return <Journal locale={locale} dict={dict} posts={data?.posts ?? []} unavailable={!data} />;
}
