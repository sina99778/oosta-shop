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
    entries.push({ url: `${site}/${locale}/blog`, changeFrequency: "daily", priority: 0.6 });
  }

  // Page through the whole catalog (the API caps pageSize at 50) so products
  // beyond the first page still appear in the sitemap.
  type ProductsPage = { items: { slug: string }[]; pagination: { totalPages: number } };
  const first = await fetchJson<ProductsPage>("/products?pageSize=50&page=1", 0);
  const productSlugs = [...(first?.items ?? [])];
  const totalPages = Math.min(first?.pagination?.totalPages ?? 1, 50); // hard cap, safety
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchJson<ProductsPage>(`/products?pageSize=50&page=${page}`, 0);
    productSlugs.push(...(next?.items ?? []));
  }
  for (const product of productSlugs) {
    for (const locale of locales) {
      entries.push({
        url: `${site}/${locale}/products/${product.slug}`,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  const blog = await fetchJson<{ posts: { slug: string }[] }>("/blog", 0);
  for (const post of blog?.posts ?? []) {
    for (const locale of locales) {
      entries.push({
        url: `${site}/${locale}/blog/${post.slug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  const pages = await fetchJson<{ pages: { slug: string }[] }>("/pages", 0);
  for (const page of pages?.pages ?? []) {
    for (const locale of locales) {
      entries.push({
        url: `${site}/${locale}/p/${page.slug}`,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
