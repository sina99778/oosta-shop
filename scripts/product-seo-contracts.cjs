/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
process.env.NEXT_PUBLIC_API_URL = "/api";
require("tsx/cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { Markdown } = require("../apps/web/components/markdown.tsx");
const body = renderToStaticMarkup(
  React.createElement(Markdown, {
    text: "## Product section\n\n### Product question",
    headingOffset: 0,
  }),
);
assert.match(body, /<h2[^>]*>Product section<\/h2>/);
assert.match(body, /<h3[^>]*>Product question<\/h3>/);
const legacyBody = renderToStaticMarkup(
  React.createElement(Markdown, { text: "# Existing section\n\n## Existing subsection" }),
);
assert.match(legacyBody, /<h3[^>]*>Existing section<\/h3>/);
assert.match(legacyBody, /<h4[^>]*>Existing subsection<\/h4>/);
const links = renderToStaticMarkup(
  React.createElement(Markdown, {
    text: "[Internal](/fa/products/chatgpt) [External](https://example.test) [Network path](//example.test) [Backslash](/\\example.test) [Normalized](/p/..//example.test) [Control](/\texample.test) ![Image](//example.test/image.png)",
  }),
);
assert.match(links, /<a(?![^>]*target=)[^>]*href="\/fa\/products\/chatgpt"[^>]*>Internal<\/a>/);
assert.match(links, /<a[^>]*href="https:\/\/example\.test"[^>]*target="_blank"/);
assert.equal((links.match(/<a\b/g) ?? []).length, 2);
assert(!links.includes("<img"));
const product = {
  id: "synthetic-product",
  slug: "synthetic",
  name: "Synthetic",
  description: "A safe description",
  shortDescription: "A useful summary",
  metaTitle: "Synthetic product title",
  metaDescription: "Synthetic product description",
  image: null,
  hasImage: true,
  imageVersion: "123",
  updatedAt: "2026-11-17T10:00:00.000Z",
  category: { name: "Tools", slug: "tools" },
  plans: [
    {
      id: "synthetic-plan",
      source: "INTERNAL",
      quoteRequired: false,
      availability: "LOCAL_STOCK",
      availableStock: 1,
      inStock: true,
      effectivePrice: 25000,
      currency: "IRT",
    },
  ],
  rating: { average: 0, count: 0 },
};
let payment = { online: true, cardToCard: false };
let missing = false;
let fetches = 0;
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "@/lib/seo")
    return {
      siteUrl: () => "https://oostaai.store",
      fetchJson: async (route) => {
        fetches++;
        if (route.startsWith("/products?"))
          return {
            items: [product, { slug: "deepseek" }, { slug: "deepseek-api" }],
            pagination: { totalPages: 1 },
          };
        if (route === "/blog")
          return { posts: [{ slug: "buy-chatgpt-plus-iran", title: "ChatGPT guide" }] };
        if (route === "/pages") return { pages: [] };
        return route === "/payments/config" ? payment : missing ? null : { product };
      },
    };
  if (request === "@/components/product-detail-view")
    return { ProductDetailView: () => React.createElement("div", null, "Synthetic product") };
  if (request === "../../dictionaries") return { getDictionary: async () => ({}) };
  if (request === "next/navigation")
    return {
      notFound: () => {
        throw new Error("NOT_FOUND");
      },
    };
  return originalLoad.call(this, request, ...args);
};
const page = require("../apps/web/app/[locale]/products/[slug]/page.tsx");
const sitemap = require("../apps/web/app/sitemap.ts").default;
Module._load = originalLoad;
const props = { params: Promise.resolve({ locale: "fa", slug: product.slug }) };
async function graphs(locale = "fa") {
  const html = renderToStaticMarkup(
    await page.default({ params: Promise.resolve({ locale, slug: product.slug }) }),
  );
  const script = html.match(/<script[^>]+application\/ld\+json[^>]*>(.*?)<\/script>/s);
  assert(script);
  const data = JSON.parse(script[1]);
  return { html, entities: data["@graph"] ?? [data] };
}
async function main() {
  const metadata = await page.generateMetadata(props);
  assert.equal(metadata.alternates.canonical, "https://oostaai.store/fa/products/synthetic");
  assert.equal(metadata.alternates.languages.fa, "https://oostaai.store/fa/products/synthetic");
  // Product copy is Persian-only: no English hreflang, and /en canonicalizes to /fa.
  assert.equal(metadata.alternates.languages.en, undefined);
  assert.equal(metadata.alternates.languages["x-default"], metadata.alternates.canonical);
  const englishMetadata = await page.generateMetadata({
    params: Promise.resolve({ locale: "en", slug: product.slug }),
  });
  assert.equal(englishMetadata.alternates.canonical, metadata.alternates.canonical);
  assert.equal(
    metadata.openGraph.images[0].url,
    "https://oostaai.store/api/products/synthetic-product/image?v=123",
  );
  const available = (await graphs()).entities;
  const item = available.find((entry) => entry["@type"] === "Product");
  assert.equal(item.offers.priceCurrency, "IRR");
  assert.equal(item.offers.price, 250000);
  assert.equal(item.offers.url, metadata.alternates.canonical);
  assert(!item.aggregateRating);
  const sitemapEntries = await sitemap();
  assert(!sitemapEntries.some((entry) => entry.url.endsWith("/products/deepseek")));
  assert(sitemapEntries.some((entry) => entry.url.endsWith("/products/deepseek-api")));
  assert(!sitemapEntries.some((entry) => entry.url.includes("/en/products/")));
  const listed = sitemapEntries.find((entry) => entry.url === metadata.alternates.canonical);
  assert.equal(listed.lastModified.toISOString(), product.updatedAt);
  product.updatedAt = "invalid";
  assert(
    !(await sitemap()).find((entry) => entry.url === metadata.alternates.canonical).lastModified,
  );
  const breadcrumb = available.find((entry) => entry["@type"] === "BreadcrumbList");
  assert.equal(breadcrumb.itemListElement.at(-1).item, metadata.alternates.canonical);
  const englishBreadcrumb = (await graphs("en")).entities.find(
    (entry) => entry["@type"] === "BreadcrumbList",
  );
  assert.equal(
    englishBreadcrumb.itemListElement.at(-1).item,
    "https://oostaai.store/en/products/synthetic",
  );
  payment = { online: false, cardToCard: false };
  assert(!(await graphs()).entities.some((entry) => entry["@type"] === "Product"));
  product.plans[0].quoteRequired = true;
  product.plans[0].source = "SUPPLIER";
  payment = { online: true, cardToCard: true };
  assert(!(await graphs()).entities.some((entry) => entry["@type"] === "Product"));
  product.rating = { average: 4.5, count: 2 };
  const rated = (await graphs()).entities.find((entry) => entry["@type"] === "Product");
  assert.equal(rated.aggregateRating.reviewCount, 2);
  assert(!rated.offers);
  product.name = "</script><script>unsafe()</script>";
  assert(!(await graphs()).html.includes("</script><script>unsafe()"));
  product.slug = "chatgpt";
  assert.match((await graphs()).html, /href="\/fa\/blog\/buy-chatgpt-plus-iran"/);
  product.slug = "synthetic";
  product.image = "javascript:unsafe()";
  const unsafeImages = (await page.generateMetadata(props)).openGraph.images;
  assert.deepEqual(
    unsafeImages.map((image) => image.url),
    ["/brand/oosta-og-1200x630.jpg"],
    "an unsafe product image falls back to the brand image",
  );
  const before = fetches;
  await assert.rejects(
    page.generateMetadata({ params: Promise.resolve({ locale: "bad", slug: product.slug }) }),
    /NOT_FOUND/,
  );
  assert.equal(fetches, before);
  missing = true;
  await assert.rejects(page.default(props), /NOT_FOUND/);
  console.log(
    "PASS: product Persian canonical/hreflang, absolute images, IRR offer, truthful availability, breadcrumbs and safe JSON-LD",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
