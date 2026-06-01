import type { Locale } from "./i18n";

function tag(locale: Locale): string {
  return locale === "fa" ? "fa-IR" : "en-US";
}

export function formatPrice(amount: number, currency: string, locale: Locale): string {
  const formatted = new Intl.NumberFormat(tag(locale)).format(amount);
  return `${formatted} ${currency}`;
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
