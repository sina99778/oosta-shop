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
let hydrated = false;
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
  useSyncExternalStore: (subscribe, getSnapshot, getServerSnapshot) =>
    hydrated
      ? getSnapshot()
      : React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
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
assert(html.includes("<dl"), "Trust summary list must be rendered beside buy action");
assert(html.includes("۳۰ روز ضمانت · پوشش کامل"));
assert(html.includes('href="/fa/p/return-policy"'));
assert(html.includes('href="/fa/p/contact"'));
assert(!html.includes("تلگرام پیش از خرید"), "Omit Telegram link when supportHref is absent");
assert(
  renderToStaticMarkup(
    React.createElement(ProductDetailView, {
      locale: "fa",
      product: viewedProduct,
      payment: paymentOptions,
      supportHref: "https://t.me/oostaAiSupport",
      dict,
    }),
  ).includes('href="https://t.me/oostaAiSupport"'),
);
assert(html.includes('value="fixture-manual"'), "Preserve the original plan ID");
assert(html.includes("شمارهٔ سفارش و شرح مشکل را در تیکت بنویسید"));
const termsHtml = renderToStaticMarkup(
  React.createElement(ProductDetailView, {
    locale: "fa",
    product: {
      ...viewedProduct,
      plans: [
        {
          ...viewedProduct.plans[0],
          variant: null,
          activationTerms:
            "## نکات فعال‌سازی\n- فقط یک دستگاه\n\nپیش‌نیاز اختصاصی دیگری برای این گزینه از متن عرضه قابل تأیید نبود. اگر شرط خاصی برای حساب، منطقه یا دستگاه داری، قبل از خرید از پشتیبانی بپرس.\n\nشمارهٔ سفارش را در تیکت بنویسید.\n\n[Unsafe](javascript:alert(1)) · [تماس](/fa/p/contact)",
        },
      ],
    },
    payment: paymentOptions,
    dict,
  }),
);
assert(termsHtml.includes("شرایط و ضوابط فعال‌سازی این پلن"));
assert(
  !/<details[^>]*\bopen(?:=|[\s>])[^>]*>\s*<summary[^>]*>شرایط و ضوابط فعال‌سازی این پلن/.test(
    termsHtml,
  ),
  "Keep activation terms collapsed initially",
);
assert(termsHtml.includes("نکات فعال‌سازی"));
assert(termsHtml.includes("فقط یک دستگاه"));
assert(
  termsHtml.includes(
    "اگر دربارهٔ شرایط حساب، منطقه یا دستگاه سؤال دارید، پیش از خرید از پشتیبانی بپرسید.",
  ),
);
assert(!termsHtml.includes("از متن عرضه قابل تأیید نبود"));
assert(termsHtml.includes("شمارهٔ سفارش را در تیکت بنویسید"));
assert(!termsHtml.includes("شمارهٔ سفارش و شرح مشکل را در تیکت بنویسید"));
assert(!/<a\b[^>]*href=["']?javascript:/i.test(termsHtml));
assert(!termsHtml.includes(">Unsafe</a>"));
assert(termsHtml.includes('href="/fa/p/contact"'));
const {
  planDisplayLabel,
  planOptionValue,
  planTrustSummary,
} = require("../apps/web/lib/product-variant.ts");
assert.deepEqual(
  planTrustSummary(
    {
      durationDays: 30,
      quoteRequired: false,
      variant: {
        plan: "Plus",
        access: "PERSONAL",
        fulfillment: "ACCOUNT",
        delivery: "AUTOMATIC",
        warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" },
        region: "GLOBAL",
        quota: "UNSPECIFIED",
      },
    },
    "fa",
  ),
  {
    warranty: "۳۰ روز ضمانت · پوشش کامل",
    delivery: "اکانت آماده · تحویل خودکار",
    access: "اختصاصی · ۳۰ روز · جهانی",
  },
);
assert.deepEqual(
  planTrustSummary(
    {
      durationDays: 30,
      quoteRequired: true,
      variant: {
        plan: "Plus",
        access: "SHARED",
        fulfillment: "INVITE",
        delivery: "MANUAL",
        warranty: { kind: "WARRANTED", days: 7, coverage: "LOGIN" },
        region: "UNSPECIFIED",
        quota: "UNSPECIFIED",
      },
    },
    "fa",
    { cardToCard: true },
  ),
  {
    warranty: "۷ روز ضمانت · فقط مشکل ورود",
    delivery: "اینوایتی · تحویل دستی (کارت‌به‌کارت پس از تأیید رسید)",
    access: "اشتراکی · ۳۰ روز",
  },
);
assert.equal(
  planTrustSummary(
    {
      durationDays: null,
      quoteRequired: false,
      variant: {
        plan: "Starter",
        access: "PERSONAL",
        fulfillment: "CODE",
        delivery: "AUTOMATIC",
        warranty: { kind: "NONE", days: 0, coverage: "NONE" },
        region: "UNSPECIFIED",
        quota: "UNSPECIFIED",
      },
    },
    "en",
  ).warranty,
  "No warranty",
);
assert.deepEqual(
  planTrustSummary({ durationDays: 90, quoteRequired: false, variant: null }, "fa"),
  {
    warranty: "ضمانت مشخص نشده",
    delivery: "تحویل طبق مشخصات پلن",
    access: "۹۰ روز · نوع دسترسی مشخص نشده",
  },
);
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
const preferredPlans = {
  ...p,
  plans: p.plans.map((plan, index) => ({ ...plan, sortOrder: index ? 100 : 0 })),
};
const checkedPlan = (html, id) =>
  new RegExp(`<input(?=[^>]*checked="")(?=[^>]*value="${id}")[^>]*>`).test(html);
assert(checkedPlan(renderReturn(undefined, preferredPlans), "fixture-manual"));
assert(checkedPlan(renderReturn("fixture-auto", preferredPlans), "fixture-auto"));
for (const availability of ["OUT_OF_STOCK", "ON_REQUEST"]) {
  const fallback = {
    ...preferredPlans,
    plans: [
      preferredPlans.plans[0],
      {
        ...preferredPlans.plans[1],
        availability,
        availableStock: 0,
        inStock: availability === "ON_REQUEST",
      },
    ],
  };
  assert(checkedPlan(renderReturn(undefined, fallback), "fixture-auto"));
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
assert.doesNotMatch(soldOut.split('aria-label="Quick plan selection"')[0], /Price on request/);
const staleSupplier = renderReturn("sold-out", {
  ...productWithSoldOutPlan,
  plans: productWithSoldOutPlan.plans.map((plan) =>
    plan.id === "sold-out" ? { ...plan, supplierStockUnconfirmed: true } : plan,
  ),
});
assert.match(staleSupplier, /Price on request/);
assert.doesNotMatch(staleSupplier, /Add to cart/);
const guest = renderReturn(p.plans[1].id, { ...p, hasImage: false });
assert.match(guest, /Add to cart/);
const indicativePrice = {
  amount: 2600000,
  currency: "IRR",
  expiresAt: new Date(Date.now() + 30000).toISOString(),
};
const supplierEstimateProduct = {
  ...p,
  plans: p.plans.map((plan) => ({
    ...plan,
    indicativePrice: plan.id === p.plans[0].id ? indicativePrice : null,
  })),
};
const guestEstimate = renderReturn(p.plans[0].id, supplierEstimateProduct);
const { VariantSelector } = require("../apps/web/components/variant-selector.tsx");
const selectorPlans = [
  { ...supplierEstimateProduct.plans[0], sortOrder: 20 },
  {
    ...p.plans[1],
    sortOrder: 30,
    availability: "LOCAL_STOCK",
    source: "INTERNAL",
    quoteRequired: false,
  },
  ...[100, 70, 50].map((sortOrder) => ({
    ...p.plans[0],
    id: `stock-${sortOrder}`,
    label: `Fixture ${sortOrder}`,
    sortOrder,
  })),
  {
    ...p.plans[0],
    id: "unavailable",
    sortOrder: 1000,
    availability: "OUT_OF_STOCK",
    inStock: false,
  },
];
function renderSelector(plans, value = "stock-70") {
  return renderToStaticMarkup(
    React.createElement(VariantSelector, {
      plans,
      value,
      locale: "en",
      onChange: () => {},
    }),
  );
}
const selectorHtml = renderSelector(selectorPlans);
const [quick, complete] = selectorHtml.split("<details");
assert.match(quick, /aria-label="Quick plan selection"/);
assert.deepEqual(
  [...quick.matchAll(/data-plan-id="([^"]+)"/g)].map((m) => m[1]),
  ["stock-100", "stock-70", "stock-50", "fixture-manual"],
);
assert.match(
  quick,
  /aria-pressed="true"[^>]*data-plan-id="stock-70"|data-plan-id="stock-70"[^>]*aria-pressed="true"/,
);
assert.deepEqual(
  [...complete.matchAll(/type="radio"[^>]*value="([^"]+)"/g)].map((m) => m[1]),
  ["stock-100", "stock-70", "stock-50", "fixture-manual", "fixture-auto", "unavailable"],
);
assert.match(complete, /Estimated price/);
assert.match(complete, /2,600,000 IRR/);
const identicalPlans = [
  {
    ...selectorPlans[0],
    id: "expensive",
    label: "CHATGPT PRO 200 1 MONTH (3D warranty)",
    indicativePrice: { ...indicativePrice, amount: 5000000 },
  },
  { ...selectorPlans[0], id: "cheap", label: "ChatGPT Pro 200 1 month (no warranty)" },
  {
    ...selectorPlans[0],
    id: "manual",
    label: "ChatGPT Pro 200 1 month (no warranty)",
    variant: { ...selectorPlans[0].variant, delivery: "MANUAL" },
  },
];
const [similarCards, similarList] = renderSelector(identicalPlans).split("<details");
assert.deepEqual(
  [...similarCards.matchAll(/data-plan-id="([^"]+)"/g)].map((m) => m[1]),
  ["cheap", "manual"],
);
assert.match(similarCards, /Manual delivery/);
assert.match(similarList, /value="expensive"/);
assert.match(quick, /(?:Individual|Team|Shared)/);
assert.match(quick, /(?:No warranty|days warranty)/);
assert.doesNotMatch(complete, /text-3xl/);
hydrated = true;
const staleSelector = renderSelector([
  {
    ...selectorPlans[0],
    indicativePrice: { ...indicativePrice, expiresAt: "2000-01-01T00:00:00.000Z" },
  },
  selectorPlans[1],
]);
hydrated = false;
assert.match(staleSelector, /Price on request/);
assert.doesNotMatch(staleSelector, /2,600,000 IRR/);
assert.doesNotMatch(renderSelector([selectorPlans[0]]), /Quick plan selection/);
assert.doesNotMatch(
  renderSelector([selectorPlans.at(-1), { ...selectorPlans.at(-1), id: "none" }]),
  /Quick plan selection/,
);
assert.match(guestEstimate, /Estimated price/);
assert.match(guestEstimate, /2,600,000 IRR/);
assert.doesNotMatch(
  renderReturn(p.plans[1].id, supplierEstimateProduct).split(
    'aria-label="Quick plan selection"',
  )[0],
  /2,600,000 IRR/,
);
hydrated = true;
const expiredEstimate = renderReturn(p.plans[0].id, {
  ...supplierEstimateProduct,
  plans: [
    {
      ...supplierEstimateProduct.plans[0],
      indicativePrice: { ...indicativePrice, expiresAt: "2000-01-01T00:00:00.000Z" },
    },
  ],
});
hydrated = false;
assert.match(expiredEstimate, /Price on request/);
assert.doesNotMatch(expiredEstimate, /2,600,000 IRR/);
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
// Imageless products get the Figma monogram tile beside the title, hidden from assistive tech.
assert.match(guest, /data-kind="mark"><span aria-hidden="true">FI<\/span>/);
assert.match(guest, /<h1[^>]*><bdi>Fixture<\/bdi><\/h1>/);
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
assert(home.includes("انتخاب پلن"), "Purchasable cards invite choosing a plan");
assert.match(home, /href="\/fa\/products\?category=fixture"/);
assert.doesNotMatch(home, /<select[^>]+name="sort"/);
assert(!home.includes("Empty category"));
assert(!home.includes("اشتراک و حساب کاربری"));
const homeEstimate = renderToStaticMarkup(
  React.createElement(HomeCatalog, {
    locale: "fa",
    products: [{ ...p, indicativePriceFrom: indicativePrice }],
    categories: [],
    categoryLabels: {},
    unavailable: false,
  }),
);
assert.match(homeEstimate, /قیمت تقریبی از/);
assert.match(homeEstimate, /<bdi>۲۶۰٬۰۰۰ تومان<\/bdi>/);
assert.match(homeEstimate, /href="\/fa\/products\/fixture"/);
const staleHome = renderToStaticMarkup(
  React.createElement(HomeCatalog, {
    locale: "fa",
    products: [{ ...p, availability: "OUT_OF_STOCK", supplierStockUnconfirmed: true }],
    categories: [],
    categoryLabels: {},
    unavailable: false,
  }),
);
assert.match(staleHome, /قیمت با استعلام/);
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

function assertUniqueSiblingKeys(node, trail = "root") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    const keys = new Set();
    for (const child of node) {
      if (React.isValidElement(child) && child.key !== null) {
        assert(!keys.has(child.key), `Duplicate React sibling key "${child.key}" at ${trail}`);
        keys.add(child.key);
      }
      assertUniqueSiblingKeys(child, trail);
    }
    return;
  }
  if (React.isValidElement(node)) {
    const name =
      typeof node.type === "function" ? node.type.name || "Component" : String(node.type);
    assertUniqueSiblingKeys(node.props?.children, `${trail}>${name}`);
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
      if (!quoted) assertUniqueSiblingKeys(view());
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
    for (const availability of ["OUT_OF_STOCK", "ON_REQUEST"]) {
      interactive = { values: [], index: 0 };
      try {
        assertUniqueSiblingKeys(
          ProductDetailView({
            locale: "en",
            dict: en,
            payment: paymentOptions,
            product: {
              ...p,
              plans: [{ ...p.plans[0], availableStock: 0, availability }],
            },
          }),
        );
      } finally {
        interactive = undefined;
      }
    }
    const storefront = require("node:fs").readFileSync(
      path.resolve(__dirname, "../apps/web/components/home.module.css"),
      "utf8",
    );
    const promptShadows = [...storefront.matchAll(/\.labMock\s*\{([^}]+)\}/g)].filter(([, rules]) =>
      rules.includes("box-shadow:"),
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
  assert.match(
    catalog,
    /<nav[^>]*aria-label="دسته‌بندی محصولات"[^>]*>.*aria-current="page"/s,
    "Category chips stay visible and mark the current category",
  );
  assert.match(catalog, /<aside[^>]*aria-labelledby="filters-title"/);
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
    detailSource.indexOf("className={layout.purchase}") <
      detailSource.indexOf("className={layout.choose}"),
    "Show the selected plan summary above the plan picker",
  );
  assert(detailSource.indexOf("onClick={addToCart}") > 0);
  assert(detailSource.indexOf("onClick={addToCart}") < detailSource.indexOf("className={layout.choose}"));
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
