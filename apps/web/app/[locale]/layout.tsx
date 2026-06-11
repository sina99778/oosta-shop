import "../globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Vazirmatn } from "next/font/google";
import { notFound } from "next/navigation";
import { getDictionary } from "./dictionaries";
import { dirFor, isLocale, locales } from "@/lib/i18n";
import { getSiteConfig, localizedSetting, themeCss } from "@/lib/settings";
import { siteUrl } from "@/lib/seo";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Track } from "@/components/track";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const vazirmatn = Vazirmatn({ variable: "--font-vazirmatn", subsets: ["arabic"] });

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
    title: { default: dict.meta.title, template: `%s — oostaAI` },
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
      lang={locale}
      dir={dirFor(locale)}
      className={`${geistSans.variable} ${geistMono.variable} ${vazirmatn.variable} h-full antialiased`}
    >
      <body className={`flex min-h-full flex-col bg-background text-foreground ${fontClass}`}>
        {/* Set the theme class before paint to avoid a flash. Defaults to dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}`,
          }}
        />
        {themeOverrides ? <style dangerouslySetInnerHTML={{ __html: themeOverrides }} /> : null}
        <Providers>
          <Track />
          {announcement ? (
            <div className="bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white">
              {announcement}
            </div>
          ) : null}
          <Header locale={locale} dict={dict.nav} themeLabel={dict.common.toggleTheme} />
          <main className="flex-1">{children}</main>
          <Footer locale={locale} dict={dict.footer} nav={dict.nav} config={config} />
        </Providers>
      </body>
    </html>
  );
}
