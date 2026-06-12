import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDictionary } from "./dictionaries";
import { isLocale } from "@/lib/i18n";
import { getSiteSettings, localizedSetting } from "@/lib/settings";
import { HomeSections } from "@/components/home-sections";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const settings = await getSiteSettings();
  const heroTitle = localizedSetting(settings, "heroTitle", locale) ?? dict.home.heroTitle;
  const heroSubtitle = localizedSetting(settings, "heroSubtitle", locale) ?? dict.home.heroSubtitle;

  return (
    <HomeSections locale={locale} dict={dict} heroTitle={heroTitle} heroSubtitle={heroSubtitle} />
  );
}
