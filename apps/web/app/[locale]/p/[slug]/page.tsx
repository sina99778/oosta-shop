import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Markdown } from "@/components/markdown";
import { fetchJson } from "@/lib/seo";
import { contentAlternates, DEFAULT_SHARE_IMAGE, metadataExcerpt } from "@/lib/page-metadata";
import { sitePolicy } from "@/lib/site-policies";

export const revalidate = 300;

type PublicPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
};

const load = cache(async (slug: string): Promise<PublicPage | null> => {
  const data = await fetchJson<{ page: PublicPage }>(`/pages/${encodeURIComponent(slug)}`);
  return data?.page ?? null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const page = (await load(slug)) ?? sitePolicy(slug, locale);
  if (!page) return { title: "Not found" };
  const description = metadataExcerpt(page.content);
  const alternates = contentAlternates(`/p/${encodeURIComponent(page.slug)}`);
  const url = alternates.canonical as string;
  return {
    title: page.title,
    description,
    alternates,
    openGraph: {
      title: page.title,
      description,
      url,
      type: "website",
      images: [DEFAULT_SHARE_IMAGE],
    },
  };
}

export default async function CmsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const page = (await load(slug)) ?? sitePolicy(slug, locale);
  if (!page) notFound();

  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page.title}</h1>
      <article className="mt-6 text-foreground/90">
        <Markdown text={page.content} />
      </article>
    </Container>
  );
}
