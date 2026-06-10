import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { fetchJson } from "@/lib/seo";
import { assetUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { BlogPostSummary } from "@/lib/types";

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  // Request-time render + 60s cached data (a build-time prerender would bake
  // an empty post list into the static shell).
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const data = await fetchJson<{ posts: BlogPostSummary[] }>("/blog");
  const posts = data?.posts ?? [];

  return (
    <Container className="py-10">
      <h1 className="text-3xl font-bold tracking-tight">{dict.blog.title}</h1>
      <p className="mt-1 text-muted">{dict.blog.subtitle}</p>

      {posts.length === 0 ? (
        <p className="mt-8 text-muted">{dict.blog.empty}</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.id} href={`/${locale}/blog/${p.slug}`} className="group block">
              <Card className="flex h-full flex-col overflow-hidden p-0 transition-all duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-glow">
                <div className="aspect-[16/9] overflow-hidden border-b border-border bg-surface">
                  {p.hasCover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assetUrl(`/blog-cover/${p.id}`)}
                      alt={p.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-brand-gradient opacity-20" />
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-semibold leading-snug group-hover:text-primary">{p.title}</h2>
                  {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted">{p.excerpt}</p>}
                  <div className="mt-auto pt-4 text-xs text-muted">
                    {p.publishedAt ? formatDate(p.publishedAt, locale) : ""} · {dict.blog.readMore}{" "}
                    →
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
