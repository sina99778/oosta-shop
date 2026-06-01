import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "./dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <Container className="py-20 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{dict.home.heroTitle}</h1>
        <p className="mt-4 text-lg text-muted">{dict.home.heroSubtitle}</p>
        <div className="mt-8 flex justify-center">
          <Link
            href={`/${locale}/products`}
            className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {dict.home.browse}
          </Link>
        </div>
      </div>
    </Container>
  );
}
