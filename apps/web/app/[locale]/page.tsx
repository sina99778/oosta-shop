import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "./dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { HomeSections } from "@/components/home-sections";

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const trust = [dict.home.trust1, dict.home.trust2, dict.home.trust3];

  return (
    <>
      <section className="relative overflow-hidden border-b border-border animate-fade-in">
        <div className="hero-aurora pointer-events-none absolute inset-0" />
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-40" />
        <Container className="relative py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur">
            <span className="size-1.5 rounded-full bg-brand-gradient" />
            {dict.home.heroBadge}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            {dict.home.heroTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">{dict.home.heroSubtitle}</p>
          <div className="mt-8 flex justify-center">
            <Link
              href={`/${locale}/products`}
              className="inline-flex h-12 items-center rounded-xl bg-brand-gradient px-8 text-base font-semibold text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]"
            >
              {dict.home.browse}
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted">
            {trust.map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <CheckIcon />
                {item}
              </span>
            ))}
          </div>
        </Container>
      </section>
      <HomeSections locale={locale} dict={dict} />
    </>
  );
}
