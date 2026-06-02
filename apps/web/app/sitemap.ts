import type { MetadataRoute } from "next";
import { fetchJson, siteUrl } from "@/lib/seo";
import { locales } from "@/lib/i18n";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    entries.push({ url: `${site}/${locale}`, changeFrequency: "daily", priority: 1 });
    entries.push({ url: `${site}/${locale}/products`, changeFrequency: "daily", priority: 0.8 });
  }

  const data = await fetchJson<{ items: { slug: string }[] }>("/products?pageSize=50");
  for (const product of data?.items ?? []) {
    for (const locale of locales) {
      entries.push({
        url: `${site}/${locale}/products/${product.slug}`,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  return entries;
}
