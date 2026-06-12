import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Markdown } from "@/components/markdown";
import { fetchJson, siteUrl } from "@/lib/seo";
import { assetUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { BlogPostDetail } from "@/lib/types";

export const revalidate = 300;

async function load(slug: string): Promise<BlogPostDetail | null> {
  const data = await fetchJson<{ post: BlogPostDetail }>(`/blog/${slug}`);
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
  const image = post.hasCover ? assetUrl(`/blog-cover/${post.id}`) : undefined;
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

  const cover = post.hasCover ? assetUrl(`/blog-cover/${post.id}`) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: cover ? [cover] : undefined,
    datePublished: post.publishedAt ?? undefined,
  };

  return (
    <Container className="max-w-3xl py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Link href={`/${locale}/blog`} className="text-sm text-muted hover:text-foreground">
        ← {dict.blog.back}
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{post.title}</h1>
      {post.publishedAt && (
        <p className="mt-2 text-sm text-muted">{formatDate(post.publishedAt, locale)}</p>
      )}

      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt={post.title}
          className="mt-6 aspect-[16/9] w-full rounded-2xl border border-border object-cover"
        />
      )}

      <article className="mt-6 text-foreground/90">
        <Markdown text={post.content} />
      </article>
    </Container>
  );
}
