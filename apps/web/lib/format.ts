import type { Locale } from "./i18n";

function tag(locale: Locale): string {
  return locale === "fa" ? "fa-IR" : "en-US";
}

export function formatPrice(amount: number, currency: string, locale: Locale): string {
  // Persian shoppers think in Toman, but IRR amounts are stored in Rial — so when
  // we relabel to تومان we MUST divide by 10, otherwise every price reads 10x high.
  if (locale === "fa" && currency === "IRR") {
    return `${new Intl.NumberFormat("fa-IR").format(amount / 10)} تومان`;
  }
  return `${new Intl.NumberFormat(tag(locale)).format(amount)} ${currency}`;
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
