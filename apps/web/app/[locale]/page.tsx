import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDictionary } from "./dictionaries";
import { isLocale } from "@/lib/i18n";
import { getSiteSettings, localizedSetting } from "@/lib/settings";
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

// Decorative floating "product" chips for the hero visual.
const HERO_CHIPS = [
  { name: "ChatGPT Plus", emoji: "🤖", cls: "left-2 top-4 rotate-[-4deg]" },
  { name: "Claude Pro", emoji: "✨", cls: "right-0 top-20 rotate-[3deg]" },
  { name: "Gemini Advanced", emoji: "💎", cls: "left-8 top-40 rotate-[2deg]" },
  { name: "Spotify Premium", emoji: "🎧", cls: "right-6 top-56 rotate-[-3deg]" },
];

const FEATURE_ICONS: Record<string, string> = {
  instant: "M13 2 3 14h7l-1 8 10-12h-7l1-8z",
  secure: "M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z",
  support: "M21 11.5a8.5 8.5 0 1 1-4.1-7.3M22 4 12 14l-3-3",
  warranty: "M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
};

function FeatureIcon({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  // Render at request time (never bake build-time data into the static shell),
  // while fetchJson results still come from the 60s data cache — fast AND fresh.
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const trust = [dict.home.trust1, dict.home.trust2, dict.home.trust3];

  // Hero copy can be overridden live from the admin / AI agent.
  const settings = await getSiteSettings();
  const heroTitle = localizedSetting(settings, "heroTitle", locale) ?? dict.home.heroTitle;
  const heroSubtitle = localizedSetting(settings, "heroSubtitle", locale) ?? dict.home.heroSubtitle;

  const features = [
    {
      icon: FEATURE_ICONS.instant,
      title: dict.home.featInstantTitle,
      text: dict.home.featInstantText,
    },
    {
      icon: FEATURE_ICONS.secure,
      title: dict.home.featSecureTitle,
      text: dict.home.featSecureText,
    },
    {
      icon: FEATURE_ICONS.support,
      title: dict.home.featSupportTitle,
      text: dict.home.featSupportText,
    },
    {
      icon: FEATURE_ICONS.warranty,
      title: dict.home.featWarrantyTitle,
      text: dict.home.featWarrantyText,
    },
  ];

  return (
    <>
      <section className="relative overflow-hidden border-b border-border animate-fade-in">
        <div className="hero-aurora pointer-events-none absolute inset-0" />
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-40" />
        <Container className="relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div className="text-center lg:text-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-gradient" />
              {dict.home.heroBadge}
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:mx-0 xl:text-6xl">
              {heroTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted lg:mx-0">
              {heroSubtitle}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                href={`/${locale}/products`}
                className="inline-flex h-12 items-center rounded-xl bg-brand-gradient px-8 text-base font-semibold text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {dict.home.browse}
              </Link>
              <Link
                href={`/${locale}/blog`}
                className="inline-flex h-12 items-center rounded-xl border border-border bg-surface/70 px-6 text-base font-medium text-foreground backdrop-blur transition-colors hover:border-primary hover:text-primary"
              >
                {dict.home.browseSecondary}
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted lg:justify-start">
              {trust.map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <CheckIcon />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Decorative floating product chips (hidden on small screens). */}
          <div className="relative hidden h-80 lg:block" aria-hidden dir="ltr">
            <div className="absolute inset-0 rounded-[2.5rem] bg-brand-gradient opacity-[0.07] blur-2xl" />
            {HERO_CHIPS.map((chip, i) => (
              <div
                key={chip.name}
                className={`pulse-glow absolute ${chip.cls} flex items-center gap-3 rounded-2xl px-5 py-4 glass-panel shadow-card`}
                style={{ animationDelay: `${i * 0.9}s` }}
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-xl">
                  {chip.emoji}
                </span>
                <div>
                  <p className="text-sm font-semibold">{chip.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
                    <span className="size-1.5 rounded-full bg-success" />
                    {dict.common.inStock}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-border bg-surface/30">
        <Container className="grid grid-cols-1 gap-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-4 rounded-2xl p-5 glass-panel">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <FeatureIcon d={f.icon} />
              </span>
              <div>
                <p className="font-semibold">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      <HomeSections locale={locale} dict={dict} />
    </>
  );
}
