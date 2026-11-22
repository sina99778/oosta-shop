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
  slug: "buy-chatgpt-plus-iran",
  title: "Synthetic </script><script>unsafe()</script> post",
  excerpt: "A synthetic excerpt",
  hasCover: false,
  publishedAt: "2026-11-17T10:00:00.000Z",
  updatedAt: "2026-11-18T09:30:00.000Z",
  content: "## Body",
};
const cmsPage = {
  id: "synthetic-page",
  slug: "about",
  title: "About",
  content:
    "## About\n\n[Read the policy](/fa/p/terms)\n\n" +
    "Complete sentences for customers. ".repeat(12),
  updatedAt: "2026-11-17T10:00:00.000Z",
};
let cmsAvailable = true;
let cmsContactAvailable = false;
let contactSettings = {
  contactEmail: "support@example.test",
  contactPhone: "+98 (21) 1234 5678",
  contactTelegram: "@FixtureSupport",
  contactInstagram: "https://www.instagram.com/fixture.official/?igsh=fixture",
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
        if (route === "/pages/about" && cmsAvailable) return { page: cmsPage };
        if (route === "/pages/contact" && cmsContactAvailable)
          return { page: { ...cmsPage, slug: "contact", title: "Published contact details" } };
        if (route === "/pages") return { pages: [cmsPage] };
        if (route === "/products/chatgpt") return { product: { slug: "chatgpt", name: "ChatGPT" } };
        if (route.startsWith("/products?")) return { items: [], pagination: { totalPages: 1 } };
        return null;
      },
    };
  if (/dictionaries$/.test(request)) return { getDictionary };
  if (request === "@/lib/settings")
    return {
      ...originalLoad.call(this, path.resolve(__dirname, "../apps/web/lib/settings.ts"), ...args),
      getSiteSettings: async () => contactSettings,
    };
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
  if (request === "@/components/ui/container") return { Container: ({ children }) => children };
  if (request === "@/components/markdown")
    return originalLoad.call(
      this,
      path.resolve(__dirname, "../apps/web/components/markdown.tsx"),
      ...args,
    );
  if (request.startsWith("@/components/") && request !== "@/components/related-content-links")
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
const privatePages = [
  "dashboard/layout.tsx",
  "support/layout.tsx",
  "checkout/layout.tsx",
  "admin/layout.tsx",
  "cart/page.tsx",
  "cart/review/[id]/page.tsx",
].map((file) => [file, app(file)]);
const sitemap = require("../apps/web/app/sitemap.ts").default;
const robots = require("../apps/web/app/robots.ts").default;
const { safeJsonLd } = require("../apps/web/lib/page-metadata.ts");
const { analyzeSeo } = require("../apps/web/lib/seo-analyzer.ts");
const nextConfig = require("../apps/web/next.config.ts").default;
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
  const seoInput = { slug: "fixture", shortDescription: "", description: "", metaDescription: "" };
  const titleCheck = (length) =>
    analyzeSeo({ ...seoInput, metaTitle: "a".repeat(length) }, "").checks[0].status;
  assert.equal(titleCheck(50), "good");
  assert.equal(titleCheck(51), "warn");
  assert(
    (await nextConfig.redirects()).some(
      (rule) =>
        rule.source === "/:locale(en|fa)/products/deepseek" &&
        rule.destination === "/:locale/products/deepseek-api" &&
        rule.permanent,
    ),
  );
  for (const slug of ["about", "contact"]) {
    assert(
      (await nextConfig.redirects()).some(
        (rule) =>
          rule.source === `/:locale(en|fa)/${slug}` &&
          rule.destination === `/:locale/p/${slug}` &&
          rule.permanent,
      ),
      `missing localized redirect for ${slug}`,
    );
  }

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
      const html = renderToStaticMarkup(
        await mod.default({
          ...params(locale),
          searchParams: Promise.resolve({}),
        }),
      );
      const graph = jsonLdFrom(html)["@graph"];
      assert.equal(
        graph.find((item) => item["@type"] === "CollectionPage").url,
        meta.openGraph.url,
      );
      assert.equal(
        graph.find((item) => item["@type"] === "BreadcrumbList").itemListElement.at(-1).item,
        meta.openGraph.url,
      );
      // Social cards: a 1200x630 landscape image (a square one renders as a small thumbnail).
      assert.deepEqual(
        [
          meta.openGraph.images[0].url,
          meta.openGraph.images[0].width,
          meta.openGraph.images[0].height,
        ],
        ["/brand/oosta-og-1200x630.jpg", 1200, 630],
      );
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
  for (const [segment, mod] of privatePages) {
    assert.deepEqual(mod.metadata.robots, { index: false, follow: false }, segment);
    assert.equal(mod.metadata.alternates, null, segment);
    assert.equal(mod.metadata.openGraph, null, segment);
  }
  const [rule] = robots().rules;
  for (const locale of ["fa", "en"]) {
    for (const route of ["cart", "checkout", "login", "signup"]) {
      assert(rule.disallow.includes(`/${locale}/${route}`));
    }
  }
  assert(rule.disallow.includes("/api/"));
  assert(rule.allow.includes("/api/products/*/image"));

  const canonicalPost = `${SITE}/fa/blog/${post.slug}`;
  for (const locale of ["fa", "en"]) {
    const meta = await blogPost.generateMetadata(params(locale, { slug: post.slug }));
    assert.equal(meta.alternates.canonical, canonicalPost);
    assert.equal(meta.alternates.languages.en, undefined);
    assert.equal(meta.openGraph.url, canonicalPost);
    assert.equal(meta.openGraph.publishedTime, post.publishedAt);
    assert.equal(meta.openGraph.modifiedTime, post.updatedAt);
    const pageMeta = await cms.generateMetadata(params(locale, { slug: cmsPage.slug }));
    assert.equal(pageMeta.alternates.canonical, `${SITE}/fa/p/about`);
    assert.equal(pageMeta.openGraph.images[0].url, "/brand/oosta-og-1200x630.jpg");
    assert.match(pageMeta.description, /^About Read the policy Complete sentences/);
    assert(!/[\n[\]/]/.test(pageMeta.description));
    assert(pageMeta.description.length <= 160);
    assert(pageMeta.description.endsWith("customers.…"));
  }
  const postHtml = renderToStaticMarkup(await blogPost.default(params("en", { slug: post.slug })));
  assert(!postHtml.includes("</script><script>unsafe()"));
  assert.match(postHtml, /href="\/en\/products\/chatgpt"/);
  const article = jsonLdFrom(postHtml);
  assert.equal(article["@type"], "BlogPosting");
  assert.equal(article.mainEntityOfPage, canonicalPost);
  assert.equal(article.datePublished, post.publishedAt);
  assert.equal(article.dateModified, post.updatedAt);
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
  const postEntry = (await sitemap()).find((entry) => entry.url === canonicalPost);
  assert.equal(postEntry.lastModified.toISOString(), post.updatedAt);
  assert(urls.includes(`${SITE}/fa/p/about`));
  const cmsAbout = await cms.generateMetadata(params("fa", { slug: "about" }));
  assert.equal(cmsAbout.title, cmsPage.title);
  assert.match(
    renderToStaticMarkup(await cms.default(params("fa", { slug: "about" }))),
    /<h2[^>]*>About<\/h2>/,
  );
  cmsAvailable = false;
  for (const [locale, titles] of [
    ["fa", ["درباره ما", "تماس با ما"]],
    ["en", ["About us", "Contact us"]],
  ]) {
    for (const [i, slug] of ["about", "contact"].entries()) {
      const pageParams = params(locale, { slug });
      assert.equal((await cms.generateMetadata(pageParams)).title, titles[i]);
      const rendered = renderToStaticMarkup(await cms.default(pageParams));
      assert(rendered.includes(titles[i]));
      if (slug === "contact") {
        for (const href of [
          `/${locale}/support`,
          "https://t.me/FixtureSupport",
          "mailto:support@example.test",
          "tel:+982112345678",
          "https://instagram.com/fixture.official",
        ])
          assert(rendered.includes(`href="${href}"`), href);
      }
    }
  }
  cmsContactAvailable = true;
  const cmsContact = params("fa", { slug: "contact" });
  assert.equal((await cms.generateMetadata(cmsContact)).title, "Published contact details");
  assert(
    renderToStaticMarkup(await cms.default(cmsContact)).includes(
      'href="https://t.me/FixtureSupport"',
    ),
  );
  contactSettings = {
    contactEmail: "someone?subject=unexpected@example.test",
    contactPhone: "123;ext=4",
    contactInstagram: "https://unrelated.example.test/",
  };
  const safeContact = renderToStaticMarkup(await cms.default(params("en", { slug: "contact" })));
  assert(safeContact.includes('href="/en/support"'));
  assert(!/subject=|ext=|unrelated\.example/.test(safeContact));
  const expectedPolicyTerms = {
    terms: {
      fa: ["قیمت تقریبی", "فاکتور نهایی", "سبد مهمان", "کارت‌به‌کارت"],
      en: ["Estimated price", "final invoice", "Guest cart", "24 hours"],
    },
    "return-policy": {
      fa: ["ضمانت کامل", "ضمانت فقط مشکل ورود", "بدون ضمانت", "بازگشت وجه"],
      en: ["Full coverage", "Login issues only", "No warranty", "Refunds"],
    },
    "privacy-policy": {
      fa: ["اعلان موجودی به ایمیل حساب", "بازنشانی رمز", "آمار بازدید", "گوگل آنالیتیکس"],
      en: ["account email to reset", "stock-availability alert", "without cookies", "Google Analytics"],
    },
  };
  for (const slug of ["terms", "return-policy", "privacy-policy"]) {
    const canonical = `${SITE}/fa/p/${slug}`;
    const metadata = await cms.generateMetadata(params("fa", { slug }));
    assert.equal(metadata.alternates.canonical, canonical);
    for (const locale of ["fa", "en"]) {
      const html = renderToStaticMarkup(await cms.default(params(locale, { slug })));
      assert.match(html, /<h1[^>]*>[^<]+<\/h1>/);
      assert.match(html, /<h2[^>]*>[^<]+<\/h2>/, `${slug} (${locale}) needs h2 section headings`);
      for (const phrase of expectedPolicyTerms[slug][locale]) {
        assert(html.includes(phrase), `Missing "${phrase}" in ${slug} (${locale})`);
      }
    }
  }

  const {
    parseGaMeasurementId,
    isGaTrackablePath,
    gaPageViewFields,
  } = require("../apps/web/lib/google-analytics.ts");
  assert.equal(parseGaMeasurementId(" G-AB12CD34EF "), "G-AB12CD34EF");
  for (const bad of ["", undefined, "G-bad!", "<script>alert(1)</script>", "UA-123456-1", "G-12"]) {
    assert.equal(parseGaMeasurementId(bad), null, `Reject GA ID ${String(bad)}`);
  }
  for (const ok of ["/fa", "/en", "/fa/products/chatgpt", "/fa/p/about", "/en/blog"]) {
    assert.equal(isGaTrackablePath(ok), true, `Track public path ${ok}`);
  }
  for (const blocked of [
    "/fa/admin",
    "/en/admin/orders",
    "/fa/dashboard",
    "/fa/dashboard/inbox",
    "/fa/support",
    "/fa/checkout/card/123",
    "/fa/cart/review/1",
    "/fa/cart",
    "/fa/login",
    "/fa/signup",
    "/api/health",
    "/fa/products/chatgpt?token=secret",
    "/fa/products/chatgpt/extra",
    "//example.invalid/fa/products/chatgpt",
    "/fa/reset-password",
    "/fa/forgot-password",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isGaTrackablePath(blocked), false, `Skip GA on private path ${String(blocked)}`);
  }
  assert.deepEqual(
    gaPageViewFields("/fa/products/chatgpt", SITE, "https://external.example/private?token=secret"),
    {
      page_path: "/fa/products/chatgpt",
      page_location: `${SITE}/fa/products/chatgpt`,
      page_referrer: "https://external.example/",
      page_title: "/fa/products/chatgpt",
    },
  );
  assert.equal(gaPageViewFields("/fa", SITE, "").page_referrer, `${SITE}/`);
  assert.equal(gaPageViewFields("/fa", SITE, "invalid referrer").page_referrer, `${SITE}/`);
  assert.equal(gaPageViewFields("/fa", SITE, "file:///private/path").page_referrer, `${SITE}/`);
  assert.equal(gaPageViewFields("/fa/cart", SITE, ""), null);
  await assert.rejects(cms.default(params("fa", { slug: "missing" })), /NOT_FOUND/);
  assert(urls.includes(`${SITE}/en/products`) && urls.includes(`${SITE}/en/blog`));
  assert(!urls.some((url) => /\/en\/(blog|p|products)\/./.test(url)));

  console.log(
    "PASS: storefront SEO, localized About/Contact redirects, CMS priority and validated contact channels",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
