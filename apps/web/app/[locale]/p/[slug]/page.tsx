import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Markdown } from "@/components/markdown";
import { fetchJson, siteUrl } from "@/lib/seo";

export const revalidate = 300;

type PublicPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
};

async function load(slug: string): Promise<PublicPage | null> {
  const data = await fetchJson<{ page: PublicPage }>(`/pages/${encodeURIComponent(slug)}`);
  return data?.page ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await load(slug);
  if (!page) return { title: "Not found" };
  const description = page.content.replace(/[#*!]/g, "").slice(0, 160);
  const url = `${siteUrl()}/${locale}/p/${slug}`;
  return {
    title: page.title,
    description,
    alternates: { canonical: url },
    openGraph: { title: page.title, description, url, type: "website" },
  };
}

export default async function CmsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const page = await load(slug);
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
