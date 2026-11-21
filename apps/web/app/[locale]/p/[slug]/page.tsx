import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Markdown } from "@/components/markdown";
import { fetchJson } from "@/lib/seo";
import { contentAlternates, DEFAULT_SHARE_IMAGE, metadataExcerpt } from "@/lib/page-metadata";
import { sitePolicy } from "@/lib/site-policies";
import { getSiteSettings, publicContactLinks, telegramSupportHref } from "@/lib/settings";

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

  const fa = locale === "fa";
  const settings = slug === "contact" ? await getSiteSettings() : null;

  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page.title}</h1>
      <article className="mt-6 text-foreground/90">
        <Markdown text={page.content} />
      </article>
      {slug === "about" && (
        <Link
          href={`/${locale}/p/contact`}
          className="mt-6 inline-flex text-sm font-semibold text-primary underline underline-offset-4"
        >
          {fa ? "تماس با ما" : "Contact us"}
        </Link>
      )}
      {settings && (
        <section
          className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-6"
          aria-labelledby="contact-channels"
        >
          <h2 id="contact-channels" className="text-lg font-bold">
            {fa ? "راه‌های ارتباطی" : "Contact options"}
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/support`}
              className="oosta-button inline-flex min-h-11 items-center px-4 text-sm"
              data-button-variant="primary"
            >
              {fa ? "ثبت و پیگیری تیکت" : "Open or track a ticket"}
            </Link>
            <a
              href={telegramSupportHref(settings)}
              className="oosta-button inline-flex min-h-11 items-center px-4 text-sm"
              data-button-variant="outline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {fa ? "پشتیبانی تلگرام" : "Telegram support"}
            </a>
          </div>
          {publicContactLinks(settings).map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="mt-3 block w-fit max-w-full wrap-anywhere text-sm underline underline-offset-4"
              dir="ltr"
              target={href.startsWith("https:") ? "_blank" : undefined}
              rel={href.startsWith("https:") ? "noopener noreferrer" : undefined}
            >
              {label}
            </a>
          ))}
        </section>
      )}
    </Container>
  );
}
