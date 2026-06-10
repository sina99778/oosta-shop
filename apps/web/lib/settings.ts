// Site-wide runtime settings fetched from the API: theme color overrides and
// hero/announcement copy. Editable from the admin API or the Telegram AI agent,
// so the storefront restyles without a redeploy.

import { fetchJson } from "./seo";

export type SiteSettings = Partial<{
  themePrimary: string;
  themePrimaryDark: string;
  themeAccent: string;
  themeAccentDark: string;
  heroTitleEn: string;
  heroTitleFa: string;
  heroSubtitleEn: string;
  heroSubtitleFa: string;
  announcementEn: string;
  announcementFa: string;
  footerAboutEn: string;
  footerAboutFa: string;
  contactEmail: string;
  contactPhone: string;
  contactTelegram: string;
  contactInstagram: string;
  enamadLink: string;
}>;

export type SiteConfig = { settings: SiteSettings; enamadBadge: boolean };

export async function getSiteConfig(): Promise<SiteConfig> {
  const data = await fetchJson<SiteConfig>("/site-settings");
  return { settings: data?.settings ?? {}, enamadBadge: data?.enamadBadge ?? false };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  return (await getSiteConfig()).settings;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (value: string | undefined): string | null => (value && HEX.test(value) ? value : null);

// CSS override block injected by the layout. Hex values are re-validated here
// (defense in depth) so a bad DB value can never inject CSS. Dark-mode colors
// fall back to the light value; hover shades are derived with color-mix.
export function themeCss(s: SiteSettings): string {
  const primary = hex(s.themePrimary);
  const primaryDark = hex(s.themePrimaryDark) ?? primary;
  const accent = hex(s.themeAccent);
  const accentDark = hex(s.themeAccentDark) ?? accent;

  const light: string[] = [];
  const dark: string[] = [];
  if (primary) {
    light.push(
      `--c-primary:${primary}`,
      `--c-primary-hover:color-mix(in oklab, ${primary} 82%, black)`,
    );
  }
  if (primaryDark) {
    dark.push(
      `--c-primary:${primaryDark}`,
      `--c-primary-hover:color-mix(in oklab, ${primaryDark} 72%, white)`,
    );
  }
  if (accent) light.push(`--c-accent:${accent}`);
  if (accentDark) dark.push(`--c-accent:${accentDark}`);

  let css = "";
  if (light.length) css += `:root{${light.join(";")}}`;
  if (dark.length) css += `.dark{${dark.join(";")}}`;
  return css;
}

// Locale-aware text override; falls back to the other language when one is missing.
export function localizedSetting(
  s: SiteSettings,
  key: "heroTitle" | "heroSubtitle" | "announcement" | "footerAbout",
  locale: string,
): string | null {
  const fa = s[`${key}Fa`];
  const en = s[`${key}En`];
  return (locale === "fa" ? (fa ?? en) : (en ?? fa)) ?? null;
}
