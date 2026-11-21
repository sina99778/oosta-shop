import "../globals.css";
import type { Metadata } from "next";
import { TITLE_SUFFIX } from "@/lib/site-brand";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import Script from "next/script";
import { getDictionary } from "./dictionaries";
import { dirFor, isLocale, locales } from "@/lib/i18n";
import { getSiteConfig, localizedSetting, themeCss } from "@/lib/settings";
import { siteUrl } from "@/lib/seo";
import { DEFAULT_SHARE_IMAGE } from "@/lib/page-metadata";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Track } from "@/components/track";

const geistSans = Geist({ variable: "--font-geist-sans", preload: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", preload: false });
const estedad = localFont({
  src: "../fonts/Estedad-storefront.woff2",
  variable: "--font-estedad",
  weight: "100 900",
  preload: true,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  const base = siteUrl();
  return {
    metadataBase: new URL(base),
    title: { default: dict.meta.title, template: `%s${TITLE_SUFFIX}` },
    description: dict.meta.description,
    alternates: {
      canonical: `/${locale}`,
      // hreflang cross-linking between the locale variants for search engines.
      languages: { en: "/en", fa: "/fa", "x-default": "/fa" },
    },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      url: `${base}/${locale}`,
      siteName: "oostaAI",
      locale: locale === "fa" ? "fa_IR" : "en_US",
      type: "website",
      images: [DEFAULT_SHARE_IMAGE],
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const fontClass = locale === "fa" ? "font-fa" : "font-sans";

  // Runtime overrides set by the admin / AI agent (theme colors + announcement).
  const config = await getSiteConfig();
  const themeOverrides = themeCss(config.settings);
  const announcement = localizedSetting(config.settings, "announcement", locale);

  return (
    <html
      id="oosta-page-top"
      lang={locale}
      dir={dirFor(locale)}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${estedad.variable} h-full antialiased`}
    >
      <body className={`flex min-h-full flex-col bg-background text-foreground ${fontClass}`}>
        {/* Apply the saved preference before paint; the storefront defaults to light. */}
        <Script
          id="oosta-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.classList.toggle('dark',localStorage.getItem('theme')==='dark')}catch(e){document.documentElement.classList.remove('dark')}`,
          }}
        />
        {themeOverrides ? <style dangerouslySetInnerHTML={{ __html: themeOverrides }} /> : null}
        <Providers>
          <a className="skip-link" href="#main-content">
            {locale === "fa" ? "رفتن به محتوای اصلی" : "Skip to main content"}
          </a>
          <Track />
          {announcement ? (
            <div className="oosta-announcement bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white">
              {announcement}
            </div>
          ) : null}
          <Header locale={locale} dict={dict.nav} themeLabel={dict.common.toggleTheme} />
          <main id="main-content" tabIndex={-1} className="flex-1">
            {children}
          </main>
          <Footer locale={locale} dict={dict.footer} nav={dict.nav} config={config} />
        </Providers>
      </body>
    </html>
  );
}
