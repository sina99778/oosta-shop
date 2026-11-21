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
let interactive;
const interactionReact = {
  ...React,
  useState(initial) {
    if (!interactive) return React.useState(initial);
    const index = interactive.index++;
    const values = interactive.values;
    if (!(index in values)) values[index] = initial;
    return [values[index], (value) => (values[index] = value)];
  },
  useRef: (initial) => (interactive ? { current: initial } : React.useRef(initial)),
  useEffect: (...args) => (interactive ? undefined : React.useEffect(...args)),
};
const navigations = [];
let cartChanges = 0;
let noticeChanges = 0;
let noticeRefreshes = 0;
let publishedPosts = [];
let signedIn = true;
let viewedProduct = p;
let paymentOptions = { online: false, cardToCard: false, card: null };
let requestedCatalog = "";
Module._load = function (request, ...args) {
  if (request === "react") return interactionReact;
  if (request === "@/lib/cart-events") return { notifyCartChanged: () => cartChanges++ };
  if (request === "@/lib/notification-events")
    return { notifyNotificationsChanged: () => noticeChanges++ };
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
    return {
      useAuth: () =>
        signedIn ? { user: { id: "synthetic" }, token: "synthetic" } : { user: null, token: null },
    };
  if (request === "next/navigation")
    return {
      useRouter: () => ({ push: (url) => navigations.push(url) }),
      useParams: () => ({ locale: "fa" }),
    };
  if (request === "@/lib/use-api")
    return {
      useApi: (url) => ({
        data:
          url === "/payments/config"
            ? paymentOptions
            : url === null
              ? null
              : url.startsWith("/auth/stock-alerts/")
                ? { active: false }
                : url === "/auth/notifications"
                  ? {
                      notifications: [
                        {
                          id: "notice-fixture",
                          title: "Restocked product",
                          body: "A synthetic body.",
                          href: "/en/products/fixture?plan=one",
                          readAt: null,
                          createdAt: "2026-11-21T12:00:00.000Z",
                        },
                      ],
                      unreadCount: 1,
                    }
                  : { product: viewedProduct },
        error: null,
        loading: false,
        refetch: () => noticeRefreshes++,
      }),
    };
  return load.call(this, request, ...args);
};
const { ProductDetailView } = require("../apps/web/components/product-detail-view.tsx");
const { SupplierQuotePanel } = require("../apps/web/components/supplier-quote-panel.tsx");
const { StockAlertButton } = require("../apps/web/components/stock-alert-button.tsx");
const { AccountNotifications } = require("../apps/web/components/account-notifications.tsx");
const { HomeCatalog } = require("../apps/web/components/home-catalog.tsx");
const { HomeSections } = require("../apps/web/components/home-sections.tsx");
const {
  ProductsBrowser,
  readCatalogFilters,
} = require("../apps/web/components/products-browser.tsx");
Module._load = load;
const dict = require("../apps/web/app/[locale]/dictionaries/fa.json");
const en = require("../apps/web/app/[locale]/dictionaries/en.json");
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
const { api, ApiError, productImageUrl } = require("../apps/web/lib/api.ts");
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
assert(html.includes("موجود نزد تأمین‌کننده"));
assert(html.includes("افزودن به سبد خرید"));
assert(!html.includes("استعلام قیمت"));
assert(html.includes("۲ عدد نزد تأمین‌کننده"), "Render the count for a fresh matching supplier");
assert(!html.includes("۷۷۷٬۷۷۷"), "Stored placeholder price must never appear for supplier offers");
function renderReturn(requestedPlanId, product = p) {
  return renderToStaticMarkup(
    React.createElement(ProductDetailView, {
      locale: "en",
      product,
      payment: paymentOptions,
      dict,
      requestedPlanId,
    }),
  );
}
assert.match(
  renderReturn(p.plans[1].id),
  /checked="" value="fixture-manual"|value="fixture-manual" checked=""/,
  "Restore the exact non-default plan after sign-in",
);
const productWithSoldOutPlan = {
  ...p,
  plans: [
    ...p.plans,
    {
      ...p.plans[0],
      id: "sold-out",
      inStock: false,
      availability: "OUT_OF_STOCK",
    },
  ],
};
for (const id of ["missing-id", ""]) {
  const stale = renderReturn(id, productWithSoldOutPlan);
  assert.match(stale, /role="alert"/);
  assert.doesNotMatch(stale, /checked=""|>Check price<|>Recheck stock and price</);
}
signedIn = false;
const soldOut = renderReturn("sold-out", productWithSoldOutPlan);
assert.match(soldOut, /checked="" value="sold-out"|value="sold-out" checked=""/);
assert.match(soldOut, /Notify me when available/);
assert.doesNotMatch(soldOut, /Add to cart/);
const guest = renderReturn(p.plans[1].id, { ...p, hasImage: false });
assert.match(guest, /Add to cart/);
const requestOnly = renderReturn(p.plans[1].id, {
  ...p,
  plans: [{ ...p.plans[1], availableStock: 0, availability: "ON_REQUEST" }],
});
assert.match(requestOnly, /Sign in to request a quote/);
assert.doesNotMatch(requestOnly, /Add to cart/);
assert.match(
  requestOnly,
  /href="\/en\/login\?next=%2Fen%2Fproducts%2Ffixture%3Fplan%3Dfixture-manual"/,
);
assert.match(guest, /<h1[^>]*><span[^>]*data-kind="ACCOUNT"/);
signedIn = true;
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
assert.doesNotMatch(home, /<select[^>]+name="sort"/);
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
const cartButton = "افزودن به سبد خرید";
assert(!closed.includes(cartButton));
paymentOptions = { online: false, cardToCard: true, card: null };
const open = renderProduct();
assert(open.includes("آمادهٔ خرید"));
assert(open.includes(cartButton));
assert(!open.includes(`>${dict.checkout.payCardToCard}</button>`));
paymentOptions = { online: true, cardToCard: true, card: null };
assert(renderProduct().includes(cartButton));
viewedProduct = {
  ...p,
  plans: [{ ...p.plans[0], variant: null, inStock: false, availability: "OUT_OF_STOCK" }],
};
const gone = renderProduct();
assert(gone.includes("موجود شد خبرم کن"));
assert(!gone.includes("بررسی دوبارهٔ موجودی و قیمت"));
assert(!gone.includes("۷۷۷٬۷۷۷"));
assert(!gone.includes(cartButton));

function actionIn(node, action) {
  if (!React.isValidElement(node)) return undefined;
  if (node.props.onClick?.name === action) return node.props.onClick;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = actionIn(child, action);
    if (found) return found;
  }
}

async function checkCartActions() {
  const originalPost = api.post;
  const localPlan = {
    ...p.plans[0],
    source: "INTERNAL",
    quoteRequired: false,
    availability: "LOCAL_STOCK",
  };
  const errors = [
    [409, "CART_FULL", /Your cart is full/i],
    [409, "OUT_OF_STOCK", /sold out/i],
    [409, "ORDER_IN_PROGRESS", /this option already has an open order/i],
    [401, "UNAUTHORIZED", /sign in again/i],
    [403, "FORBIDDEN", /access to this action/i],
  ];
  try {
    for (const entry of ["local", "supplier-stock", "supplier-on-request"]) {
      const quoted = entry === "supplier-on-request";
      const plan = entry === "local" ? localPlan : p.plans[0];
      const priorNavigationCount = navigations.length;
      const priorCartChanges = cartChanges;
      const states = [];
      const view = () => {
        interactive = { values: states, index: 0 };
        try {
          return quoted
            ? SupplierQuotePanel({ plan, token: "synthetic", locale: "en", loginPath: "/en/login" })
            : ProductDetailView({
                locale: "en",
                dict: en,
                payment: paymentOptions,
                product: { ...p, plans: [plan] },
              });
        } finally {
          interactive = undefined;
        }
      };
      if (quoted) {
        api.post = async (url) => {
          assert.equal(url, "/supplier-quotes");
          return {
            quote: {
              id: "fixture-quote",
              planId: plan.id,
              kind: "FIRM",
              checkoutEnabled: true,
              currency: "IRR",
              amount: 10000,
              range: { min: 10000, max: 10000 },
              expiresAt: "2099-01-01T00:00:00Z",
              methods: { online: true },
            },
          };
        };
        await actionIn(view(), "inquire")();
      }
      for (const [status, code, message] of errors) {
        api.post = async (url, body, token) => {
          assert.equal(url, "/cart/items");
          assert.deepEqual(body, { planId: plan.id });
          assert.equal(token, "synthetic");
          throw new ApiError("SYNTHETIC_PRIVATE_ERROR", status, code);
        };
        await actionIn(view(), "addToCart")();
        const html = renderToStaticMarkup(view());
        const alert = html.match(/<p role="alert"[^>]*>([^<]*)<\/p>/)?.[1];
        assert.match(alert ?? "", message, `${entry} add to cart reports ${code}`);
        assert.doesNotMatch(html, /SYNTHETIC_PRIVATE_ERROR/);
      }
      assert.equal(navigations.length, priorNavigationCount);
      assert.equal(cartChanges, priorCartChanges);
      api.post = async () => ({ id: "synthetic-cart-item" });
      await actionIn(view(), "addToCart")();
      assert.equal(navigations.at(-1), "/en/cart");
    }
    assert.equal(cartChanges, 3);
    const storefront = require("node:fs").readFileSync(
      path.resolve(__dirname, "../apps/web/components/storefront.module.css"),
      "utf8",
    );
    const promptShadows = [...storefront.matchAll(/\.promptPaper\s*\{([^}]+)\}/g)].filter(
      ([, rules]) => rules.includes("box-shadow:"),
    );
    assert.equal(promptShadows.length, 1, "The prompt card shares its shadow across breakpoints");
  } finally {
    api.post = originalPost;
  }
}

async function checkHomepage() {
  const props = { locale: "fa", dict, heroTitle: "اوستا", heroSubtitle: "فروشگاه" };
  const empty = renderToStaticMarkup(await HomeSections(props));
  assert(!empty.includes('id="learning"'), "Hide the journal when no articles are published");
  assert(!empty.includes("آرشیو"));
  assert(empty.includes('href="#prompt-lab"'));
  assert.match(empty, /<form[^>]*action="\/fa\/products"/);
  assert(empty.includes('name="q"'));
  assert(empty.includes("پیگیری سفارش"), "Explain which support link is for existing orders");
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
  assert.match(catalog, /<button[^>]*type="submit"[^>]*>اعمال<\/button>/);
  assert.match(catalog, /<select[^>]+name="sort"/);
  assert(catalog.includes('href="https://t.me/oostaAiSupport"'));
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
  const detailSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../apps/web/components/product-detail-view.tsx"),
    "utf8",
  );
  // Summary, price and the main action come before the plan picker once a plan is chosen.
  assert(
    detailSource.indexOf("layout.terms") < detailSource.indexOf("layout.change"),
    "Show the selected plan summary above the plan picker",
  );
  assert(detailSource.indexOf("onClick={addToCart}") > 0);
  assert(detailSource.indexOf("onClick={addToCart}") < detailSource.indexOf("layout.change"));
  assert(
    !detailSource.includes("href={`/${locale}/support`}"),
    "Pre-purchase help must not need login",
  );
  console.log("PASS: localized variants, supplier pricing and published homepage journal");
}
async function checkStockAndInbox() {
  const original = { post: api.post, del: api.del, patch: api.patch };
  const calls = [];
  const stock = [];
  const inbox = [];
  const view = (component, props, values) => {
    interactive = { values, index: 0 };
    try {
      return component(props);
    } finally {
      interactive = undefined;
    }
  };
  const tap = async (node, label) => {
    function find(element) {
      if (!React.isValidElement(element)) return;
      if (element.props.children === label && element.props.onClick) return element.props.onClick;
      for (const child of React.Children.toArray(element.props.children)) {
        const click = find(child);
        if (click) return click;
      }
    }
    const click = find(node);
    assert(click, label);
    click();
    await new Promise((resolve) => setImmediate(resolve));
  };
  const stockView = () =>
    view(
      StockAlertButton,
      {
        locale: "en",
        planId: "one",
        token: "session-synthetic",
        loginPath: "/en/login",
      },
      stock,
    );
  const inboxView = () =>
    view(AccountNotifications, { locale: "en", token: "session-synthetic" }, inbox);
  try {
    api.post = async () => {
      throw new ApiError("private detail", 409, "STOCK_ALERT_NOT_NEEDED");
    };
    await tap(stockView(), "Notify me when available");
    const failure = renderToStaticMarkup(stockView());
    assert.match(failure, /This plan is available again/);
    assert.doesNotMatch(failure, /private detail/);

    api.post = async (...args) => {
      calls.push(args);
      return { active: true };
    };
    api.del = async (...args) => {
      calls.push(args);
    };
    await tap(stockView(), "Notify me when available");
    assert.match(renderToStaticMarkup(stockView()), /Cancel stock alert/);
    await tap(stockView(), "Cancel stock alert");
    assert.match(renderToStaticMarkup(stockView()), /Stock alert canceled/);
    assert.deepEqual(calls, [
      ["/auth/stock-alerts/one", { locale: "en" }, "session-synthetic"],
      ["/auth/stock-alerts/one", "session-synthetic"],
    ]);

    api.patch = async () => {
      throw new ApiError("private detail", 403);
    };
    await tap(inboxView(), "Mark as read");
    assert.match(renderToStaticMarkup(inboxView()), /Could not update the alert/);
    assert.equal(noticeChanges, 0);
    assert.equal(noticeRefreshes, 0);
    api.patch = async (...args) => {
      calls.push(args);
    };
    await tap(inboxView(), "Mark as read");
    await tap(inboxView(), "Mark all as read");
    assert.deepEqual(calls.slice(2), [
      ["/auth/notifications/read", { id: "notice-fixture" }, "session-synthetic"],
      ["/auth/notifications/read", {}, "session-synthetic"],
    ]);
    assert.equal(noticeChanges, 2);
    assert.equal(noticeRefreshes, 2);
    console.log("PASS: stock alerts and inbox mutations, denied requests and unread refresh");
  } finally {
    Object.assign(api, original);
  }
}
checkCartActions()
  .then(checkHomepage)
  .then(checkStockAndInbox)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
