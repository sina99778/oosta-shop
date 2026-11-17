/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"),
  path = require("node:path"),
  Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");
require.extensions[".css"] = (m) => {
  m.exports = {};
};
const React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
const v = {
  plan: "PLUS",
  access: "PERSONAL",
  fulfillment: "ACCOUNT",
  delivery: "AUTOMATIC",
  warranty: { kind: "NONE", days: 0, coverage: "NONE" },
  region: "GLOBAL",
  quota: "STANDARD",
};
const p = {
  id: "fixture-product",
  name: "Fixture",
  slug: "fixture",
  type: "ACCOUNT",
  category: { id: "fixture-cat", name: "Fixture", slug: "fixture" },
  currency: "IRR",
  image: null,
  hasImage: true,
  galleryImageIds: [],
  description: "Fixture",
  shortDescription: null,
  metaTitle: null,
  metaDescription: null,
  availableStock: 2,
  availability: "SUPPLIER_STOCK",
  inStock: true,
  lowStock: false,
  isFeatured: false,
  priceFrom: null,
  originalPriceFrom: null,
  discountPercent: 0,
  ratingAverage: 0,
  ratingCount: 0,
  rating: { average: 0, count: 0 },
  reviews: [],
  related: [],
  specs: [],
  plans: [
    {
      id: "fixture-auto",
      label: "Automatic",
      durationDays: 30,
      variant: v,
      source: "SUPPLIER",
      quoteRequired: true,
      price: 7777770,
      effectivePrice: 7777770,
      salePrice: null,
      onSale: false,
      discountPercent: 0,
      currency: "IRR",
      availableStock: 2,
      inStock: true,
    },
    {
      id: "fixture-manual",
      label: "Canva Pro Team Invite Slot 3 months - full warranty",
      durationDays: 30,
      variant: {
        ...v,
        fulfillment: "INVITE",
        delivery: "MANUAL",
        warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" },
      },
      source: "SUPPLIER",
      quoteRequired: true,
      price: 7777770,
      effectivePrice: 7777770,
      salePrice: null,
      onSale: false,
      discountPercent: 0,
      currency: "IRR",
      availableStock: 2,
      inStock: true,
    },
  ],
};
const load = Module._load;
let publishedPosts = [];
let viewedProduct = p;
let paymentOptions = { online: false, cardToCard: false, card: null };
let requestedCatalog = "";
Module._load = function (request, ...args) {
  if (request === "@/lib/seo")
    return {
      fetchJson: async (url) => {
        if (url === "/blog") return { posts: publishedPosts };
        if (url === "/categories") return { categories: [{ ...p.category, productCount: 1 }] };
        if (url.startsWith("/products?")) {
          requestedCatalog = url;
          const page = Number(new URL(url, "https://example.invalid").searchParams.get("page"));
          return { items: page > 3 ? [] : [p], pagination: { page, totalPages: 3, total: 30 } };
        }
        return null;
      },
    };
  if (request === "@/lib/auth")
    return { useAuth: () => ({ user: { id: "synthetic" }, token: "synthetic" }) };
  if (request === "next/navigation")
    return { useRouter: () => ({ push: () => {} }), useParams: () => ({ locale: "fa" }) };
  if (request === "@/lib/use-api")
    return {
      useApi: (url) => ({
        data:
          url === "/payments/config"
            ? paymentOptions
            : url === null
              ? null
              : { product: viewedProduct },
        error: null,
        loading: false,
      }),
    };
  return load.call(this, request, ...args);
};
const { ProductDetailView } = require("../apps/web/components/product-detail-view.tsx");
const { HomeCatalog } = require("../apps/web/components/home-catalog.tsx");
const { HomeSections } = require("../apps/web/components/home-sections.tsx");
const {
  ProductsBrowser,
  readCatalogFilters,
} = require("../apps/web/components/products-browser.tsx");
Module._load = load;
const dict = require("../apps/web/app/[locale]/dictionaries/fa.json");
const html = renderToStaticMarkup(
  React.createElement(ProductDetailView, {
    locale: "fa",
    product: viewedProduct,
    payment: paymentOptions,
    dict,
  }),
);
assert(html.includes("ضمانت"), "Variant warranty control must be visible");
assert.match(html, /\/products\/fixture-product\/image\?v=covers-2/);
const { productImageUrl } = require("../apps/web/lib/api.ts");
assert.match(
  productImageUrl({ ...p, imageVersion: "1780000000000" }),
  /\/products\/fixture-product\/image\?v=1780000000000$/,
);
assert.equal(
  productImageUrl({ ...p, image: "https://example.com/cover.webp" }),
  "https://example.com/cover.webp",
);
assert(!html.includes("CHOOSE YOUR NEXT TOOL"), "Product art should not have a second caption");
assert(html.includes("شیوهٔ تحویل"));
assert(html.includes("<details"), "Keep subscription options in an accessible disclosure");
assert(!html.includes("<details open"), "Start with subscription options collapsed");
assert(html.includes("انتخاب نوع اشتراک"));
assert(html.includes("اینوایتی"));
assert(html.includes("Canva Pro تیمی دعوت ۳ ماهه"), "Translate the supplier's plan title");
assert(!html.includes("Invite Slot"));
assert(html.includes("۳۰ روز ضمانت · پوشش کامل"));
assert(html.includes('value="fixture-manual"'), "Preserve the original plan ID");
const { planDisplayLabel, planOptionValue } = require("../apps/web/lib/product-variant.ts");
assert.equal(
  planDisplayLabel("Gemini Pro 1 Month Personal Account", true),
  "Gemini Pro ۱ ماهه اکانت اختصاصی",
);
assert.equal(
  planDisplayLabel("Gemini Plus 1 Month Personal Account", true),
  "Gemini Plus ۱ ماهه اکانت اختصاصی",
);
assert.equal(
  planDisplayLabel("Canva Pro Team Invite Slot 3 months", false),
  "Canva Pro Team Invite Slot 3 months",
);
assert.equal(planOptionValue("GLOBAL", true), "جهانی");
assert.equal(
  planDisplayLabel("Canva Pro Edu account 3 years warranty 1 year", true),
  "Canva Pro اکانت دانشجویی ۳ ساله",
);
assert.equal(planDisplayLabel("GitHub Education", true), "GitHub آموزشی");
assert.equal(
  planDisplayLabel("Canva Pro Business Slot Invite for 99 Slots for 1 Month - full warranty", true),
  "Canva Pro Business ۹۹ جای دعوت ۱ ماهه",
);
assert(html.includes("استعلام قیمت"));
assert(html.includes("موجود نزد تأمین‌کننده"));
assert(html.includes("خرید مستقیم این پلن فعلاً فعال نیست"));
assert(html.includes("۲ عدد نزد تأمین‌کننده"), "Render the count for a fresh matching supplier");
assert(!html.includes("۷۷۷٬۷۷۷"), "Stored placeholder price must never appear for supplier offers");
const home = renderToStaticMarkup(
  React.createElement(HomeCatalog, {
    locale: "fa",
    products: [{ ...p, quoteRequired: true }],
    categories: [
      { ...p.category, productCount: 1 },
      { id: "empty", slug: "empty", name: "Empty category", productCount: 0 },
    ],
    categoryLabels: {},
    unavailable: false,
  }),
);
assert(home.includes("قیمت با استعلام"));
assert(home.includes("موجود نزد تأمین‌کننده"));
assert(home.includes("مشاهدهٔ پلن‌ها"));
assert.match(home, /href="\/fa\/products\?category=fixture"/);
assert.match(home, /<form[^>]+action="\/fa\/products"/);
assert.match(home, /<select[^>]+name="sort"/);
assert(!home.includes("Empty category"));
assert(!home.includes("اشتراک و حساب کاربری"));
const renderProduct = () =>
  renderToStaticMarkup(
    React.createElement(ProductDetailView, {
      locale: "fa",
      product: viewedProduct,
      payment: paymentOptions,
      dict,
    }),
  );
viewedProduct = {
  ...p,
  plans: [
    {
      ...p.plans[0],
      variant: null,
      source: "INTERNAL",
      quoteRequired: false,
      availableStock: 1,
      availability: "LOCAL_STOCK",
    },
    { ...p.plans[1], variant: null, availableStock: 0, availability: "ON_REQUEST" },
    {
      ...p.plans[1],
      id: "fixture-gone",
      variant: null,
      inStock: false,
      availableStock: 0,
      availability: "OUT_OF_STOCK",
    },
  ],
};
const closed = renderProduct();
assert(closed.includes("موجودی فروشگاه"));
assert(closed.includes("تأمین با استعلام"));
assert(closed.includes("ناموجود"));
assert(closed.includes("خرید این پلن فعلاً فعال نیست"));
const onlineButton = `>${dict.common.buyNow}</button>`;
assert(!closed.includes(onlineButton));
paymentOptions = { online: false, cardToCard: true, card: null };
const open = renderProduct();
assert(open.includes("آمادهٔ خرید"));
assert(open.includes(dict.checkout.payCardToCard));
assert(!open.includes(onlineButton));
paymentOptions = { online: true, cardToCard: true, card: null };
assert(renderProduct().includes(onlineButton));
viewedProduct = {
  ...p,
  plans: [{ ...p.plans[0], variant: null, inStock: false, availability: "OUT_OF_STOCK" }],
};
const gone = renderProduct();
assert(gone.includes("بررسی دوبارهٔ موجودی و قیمت"));
assert(!gone.includes("۷۷۷٬۷۷۷"));
assert(!gone.includes(onlineButton));
async function checkHomepage() {
  const props = { locale: "fa", dict, heroTitle: "اوستا", heroSubtitle: "فروشگاه" };
  const empty = renderToStaticMarkup(await HomeSections(props));
  assert(!empty.includes('id="learning"'), "Hide the journal when no articles are published");
  assert(!empty.includes("آرشیو"));
  assert(empty.includes('href="#prompt-lab"'));
  assert.match(empty, /<form[^>]*action="\/fa\/products"/);
  assert(empty.includes('name="q"'));
  assert(empty.includes("/brand/oosta-hero-v2-320.webp 320w"));
  assert(!empty.includes("/_next/image?url=%2Fbrand%2Foosta-ai-mark.png"));
  assert(empty.indexOf('id="home-catalog"') < empty.indexOf('id="prompt-lab"'));
  assert(!empty.includes("PERSIAN ROOTS. DIGITAL MIND."));
  publishedPosts = [
    {
      id: "sample-id",
      slug: "sample-post",
      title: "مقالهٔ نمونه",
      excerpt: "خلاصه",
      hasCover: true,
    },
    {
      id: "coverless-id",
      slug: "coverless-post",
      title: "بدون تصویر",
      excerpt: null,
      hasCover: false,
    },
  ];
  const populated = renderToStaticMarkup(await HomeSections(props));
  assert(populated.includes('id="learning"'));
  assert(populated.includes('href="/fa/blog/sample-post"'));
  assert(populated.includes("/blog-cover/sample-id"));
  assert(!populated.includes("/blog-cover/coverless-id"));
  assert.deepEqual(readCatalogFilters({ q: ["x"], sort: "bad", page: "-1", category: "/admin" }), {
    category: "",
    term: "",
    sort: "recommended",
    page: 1,
  });
  const params = { q: "  ChatGPT  ", sort: "available", category: "fixture", page: "2" };
  const catalog = renderToStaticMarkup(await ProductsBrowser({ locale: "fa", dict, params }));
  assert.match(catalog, /<details[^>]*>.*<summary/s);
  assert(
    !catalog.includes("<details open"),
    "Keep the category disclosure collapsed on first render",
  );
  assert(catalog.includes("دسته‌بندی محصولات"));
  const parsed = new URL(requestedCatalog, "https://example.invalid");
  assert.equal(parsed.searchParams.get("q"), "ChatGPT");
  assert.equal(parsed.searchParams.get("page"), "2");
  assert(
    catalog.includes("/fa/products?category=fixture&amp;q=ChatGPT&amp;sort=available&amp;page=3"),
  );
  assert(catalog.includes("/fa/products?category=fixture&amp;q=ChatGPT&amp;sort=available"));
  const pastEnd = renderToStaticMarkup(
    await ProductsBrowser({ locale: "fa", dict, params: { ...params, page: "4" } }),
  );
  assert(pastEnd.includes("بازگشت به صفحهٔ اول نتایج"));
  console.log("PASS: localized variants, supplier pricing and published homepage journal");
}
checkHomepage().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
