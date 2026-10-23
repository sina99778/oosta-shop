import type { Locale } from "./i18n";

// Persian display names for the built-in categories (the API stores English names).
const FA_NAMES: Record<string, string> = {
  "ai-accounts": "اکانت هوش مصنوعی",
  "software-licenses": "لایسنس نرم‌افزار",
  "gift-cards": "گیفت‌کارت",
};

export function categoryName(category: { slug: string; name: string }, locale: Locale): string {
  return locale === "fa" ? (FA_NAMES[category.slug] ?? category.name) : category.name;
}
