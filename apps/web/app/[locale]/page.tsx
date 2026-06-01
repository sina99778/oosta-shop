import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "./dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { HomeSections } from "@/components/home-sections";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <>
      <section className="border-b border-border bg-surface/40">
        <Container className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            {dict.home.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">{dict.home.heroSubtitle}</p>
          <div className="mt-8 flex justify-center">
            <Link
              href={`/${locale}/products`}
              className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              {dict.home.browse}
            </Link>
          </div>
        </Container>
      </section>
      <HomeSections locale={locale} dict={dict} />
    </>
  );
}
