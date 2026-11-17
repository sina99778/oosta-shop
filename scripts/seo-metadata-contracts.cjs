/* eslint-disable @typescript-eslint/no-require-imports */
// Page-level SEO contracts for the storefront (synthetic data, no network):
// - catalog and blog index have their own canonical/hreflang instead of
//   inheriting the home page's `/<locale>` canonical;
// - sign-in/sign-up are noindex,follow; account, support, checkout and admin
//   are noindex,nofollow and drop the inherited canonical;
// - Persian-only content (blog posts, CMS pages) canonicalizes /en to /fa;
// - home carries Organization + WebSite JSON-LD, posts carry BlogPosting;
// - JSON-LD never lets stored text close its <script>.
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
process.env.NEXT_PUBLIC_API_URL = "/api";
require("tsx/cjs");
const { renderToStaticMarkup } = require("react-dom/server");

const SITE = "https://oostaai.store";
const post = {
  id: "synthetic-post",
  slug: "synthetic-post",
  title: "Synthetic </script><script>unsafe()</script> post",
  excerpt: "A synthetic excerpt",
  hasCover: false,
  publishedAt: "2026-11-17T10:00:00.000Z",
  content: "## Body",
};
const cmsPage = {
  id: "synthetic-page",
  slug: "about",
  title: "About",
  content: "Synthetic page",
  updatedAt: "2026-11-17T10:00:00.000Z",
};
const dictionaries = {
  fa: {
    meta: {
      title: "اوستا </script>",
      description: "توضیح",
      catalogTitle: "فهرست محصولات",
      catalogDescription: "توضیح فهرست",
      blogTitle: "وبلاگ",
      blogDescription: "توضیح وبلاگ",
    },
    home: { heroTitle: "x", heroSubtitle: "y" },
    blog: { back: "بازگشت" },
  },
  en: {
    meta: {
      title: "Oosta",
      description: "Description",
      catalogTitle: "Catalog",
      catalogDescription: "Catalog description",
      blogTitle: "Blog",
      blogDescription: "Blog description",
    },
    home: { heroTitle: "x", heroSubtitle: "y" },
    blog: { back: "Back" },
  },
};
let fetches = 0;
const getDictionary = async (locale) => dictionaries[locale];
const stubComponent = () => null;
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "@/lib/seo")
    return {
      siteUrl: () => SITE,
      fetchJson: async (route) => {
        fetches++;
        if (route.startsWith("/blog/")) return { post };
        if (route === "/blog") return { posts: [post] };
        if (route.startsWith("/pages/")) return { page: cmsPage };
        if (route === "/pages") return { pages: [cmsPage] };
        if (route.startsWith("/products?")) return { items: [], pagination: { totalPages: 1 } };
        return null;
      },
    };
  if (/dictionaries$/.test(request)) return { getDictionary };
  if (request === "@/lib/settings")
    return { getSiteSettings: async () => ({}), localizedSetting: () => undefined };
  if (request === "next/server") return { connection: async () => undefined };
  if (request === "next/navigation")
    return {
      notFound: () => {
        throw new Error("NOT_FOUND");
      },
      redirect: () => {
        throw new Error("REDIRECT");
      },
    };
  if (request.startsWith("@/components/"))
    return new Proxy({}, { get: (_target, key) => (key === "__esModule" ? false : stubComponent) });
  return originalLoad.call(this, request, ...args);
};
const app = (file) => require(path.join("../apps/web/app/[locale]", file));
const catalog = app("products/page.tsx");
const blogIndex = app("blog/page.tsx");
const blogPost = app("blog/[slug]/page.tsx");
const cms = app("p/[slug]/page.tsx");
const home = app("page.tsx");
const login = app("login/page.tsx");
const signup = app("signup/page.tsx");
const privateLayouts = ["dashboard", "support", "checkout", "admin"].map((segment) => [
  segment,
  app(`${segment}/layout.tsx`),
]);
const sitemap = require("../apps/web/app/sitemap.ts").default;
const { safeJsonLd } = require("../apps/web/lib/page-metadata.ts");
Module._load = originalLoad;

const params = (locale, extra = {}) => ({ params: Promise.resolve({ locale, ...extra }) });
function jsonLdFrom(html) {
  const script = html.match(/<script[^>]+application\/ld\+json[^>]*>(.*?)<\/script>/s);
  assert(script, "JSON-LD script present");
  return JSON.parse(script[1]);
}

async function main() {
  // The escaper must turn every "<" into the JSON escape, not leave it as "<".
  assert.equal(safeJsonLd({ a: "</script>" }), '{"a":"\\u003c/script>"}');

  for (const [route, mod, title] of [
    ["/products", catalog, "catalogTitle"],
    ["/blog", blogIndex, "blogTitle"],
  ]) {
    for (const locale of ["fa", "en"]) {
      const meta = await mod.generateMetadata(params(locale));
      assert.equal(meta.alternates.canonical, `${SITE}/${locale}${route}`);
      assert.notEqual(meta.alternates.canonical, `${SITE}/${locale}`);
      assert.equal(meta.alternates.languages.fa, `${SITE}/fa${route}`);
      assert.equal(meta.alternates.languages.en, `${SITE}/en${route}`);
      assert.equal(meta.alternates.languages["x-default"], `${SITE}/fa${route}`);
      assert.equal(meta.title, dictionaries[locale].meta[title]);
      assert.equal(meta.openGraph.url, meta.alternates.canonical);
      assert(meta.openGraph.images.length > 0);
    }
    const before = fetches;
    await assert.rejects(mod.generateMetadata(params("de")), /NOT_FOUND/);
    assert.equal(fetches, before);
  }

  for (const mod of [login, signup]) {
    assert.deepEqual(mod.metadata.robots, { index: false, follow: true });
    assert.equal(mod.metadata.alternates, null);
    // These pages are prerendered; on the VPS the build has no public origin,
    // so inherited og:url/og:image would point at localhost.
    assert.equal(mod.metadata.openGraph, null);
  }
  for (const [segment, mod] of privateLayouts) {
    assert.deepEqual(mod.metadata.robots, { index: false, follow: false }, segment);
    assert.equal(mod.metadata.alternates, null, segment);
    assert.equal(mod.metadata.openGraph, null, segment);
  }

  const canonicalPost = `${SITE}/fa/blog/${post.slug}`;
  for (const locale of ["fa", "en"]) {
    const meta = await blogPost.generateMetadata(params(locale, { slug: post.slug }));
    assert.equal(meta.alternates.canonical, canonicalPost);
    assert.equal(meta.alternates.languages.en, undefined);
    assert.equal(meta.openGraph.url, canonicalPost);
    assert.equal(meta.openGraph.publishedTime, post.publishedAt);
    const pageMeta = await cms.generateMetadata(params(locale, { slug: cmsPage.slug }));
    assert.equal(pageMeta.alternates.canonical, `${SITE}/fa/p/about`);
  }
  const postHtml = renderToStaticMarkup(await blogPost.default(params("en", { slug: post.slug })));
  assert(!postHtml.includes("</script><script>unsafe()"));
  const article = jsonLdFrom(postHtml);
  assert.equal(article["@type"], "BlogPosting");
  assert.equal(article.mainEntityOfPage, canonicalPost);
  assert.equal(article.datePublished, post.publishedAt);
  assert.equal(article.inLanguage, "fa-IR");
  assert.equal(article.publisher["@type"], "Organization");
  assert.equal(article.author["@id"], article.publisher["@id"]);

  const homeHtml = renderToStaticMarkup(await home.default(params("fa")));
  assert(!homeHtml.includes('اوستا </script>"'));
  const graph = jsonLdFrom(homeHtml)["@graph"];
  const organization = graph.find((entry) => entry["@type"] === "Organization");
  const website = graph.find((entry) => entry["@type"] === "WebSite");
  assert.equal(organization.logo.url, `${SITE}/brand/oosta-ai.png`);
  assert.equal(website.publisher["@id"], organization["@id"]);
  assert.equal(
    website.potentialAction.target.urlTemplate,
    `${SITE}/fa/products?q={search_term_string}`,
  );

  const urls = (await sitemap()).map((entry) => entry.url);
  assert(urls.includes(canonicalPost));
  assert(urls.includes(`${SITE}/fa/p/about`));
  assert(urls.includes(`${SITE}/en/products`) && urls.includes(`${SITE}/en/blog`));
  assert(!urls.some((url) => /\/en\/(blog|p|products)\/./.test(url)));

  console.log(
    "PASS: list-page canonicals, noindex auth/private pages, Persian content canonicals, Organization/WebSite/BlogPosting JSON-LD and Persian-only sitemap",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
