// Server-side dictionary loader. Translation JSON is imported on demand and only
// runs on the server, so it never bloats the client bundle.

import type { Locale } from "@/lib/i18n";

const dictionaries = {
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  fa: () => import("./dictionaries/fa.json").then((m) => m.default),
};

export async function getDictionary(locale: Locale) {
  return dictionaries[locale]();
}

export type Dictionary = Awaited<ReturnType<typeof getDictionary>>;
