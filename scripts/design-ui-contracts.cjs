/* eslint-disable @typescript-eslint/no-require-imports */
// Render the storefront-redesign UI with synthetic DTOs: plan comparison, device
// sessions, ticket screenshot rules, review spam hint and catalog filters. No network.
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const sessions = [
  {
    id: "current-session-id",
    browser: "Safari",
    os: "iOS",
    ipPrefix: "85.185.x.x",
    createdAt: "2026-11-20T08:00:00Z",
    lastSeenAt: "2026-11-23T08:00:00Z",
    current: true,
  },
  {
    id: "other-session-id",
    browser: "Chrome",
    os: "Windows",
    ipPrefix: null,
    createdAt: "2026-11-19T08:00:00Z",
    lastSeenAt: "2026-11-22T08:00:00Z",
    current: false,
  },
];
let sessionData = { sessions, currentTracked: true };
let cartData = { lines: [] };
let guestEntries = [];
let authState = { token: "synthetic", user: { role: "USER", name: "Synthetic" } };
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request.endsWith(".module.css"))
    return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  if (request === "@/lib/use-api")
    return {
      useApi: (url) => ({
        data: url === "/auth/sessions" ? sessionData : url === "/cart" ? cartData : null,
        loading: false,
        error: null,
        refetch: () => {},
      }),
    };
  if (request === "@/lib/auth")
    return {
      useAuth: () => ({
        ...authState,
        loading: false,
        sessionError: null,
        guestCartTransfer: null,
        retrySession: () => {},
        retryGuestCartTransfer: () => {},
        logoutAll: async () => {},
      }),
    };
  if (request === "@/lib/guest-cart")
    return {
      useGuestCart: () => guestEntries,
      guestCartLifetime: 24 * 60 * 60 * 1000,
      removeGuestCartItem: () => {},
    };
  if (request === "next/navigation")
    return { useRouter: () => ({ replace: () => {}, push: () => {} }), useParams: () => ({}) };
  return originalLoad.call(this, request, ...args);
};
const { HomeCompare } = require("../apps/web/components/home-compare.tsx");
const { AccountSessions } = require("../apps/web/components/account-sessions.tsx");
const { ticketImageError } = require("../apps/web/components/tickets/ticket-attachment.tsx");
const { looksPromotional } = require("../apps/web/components/admin/admin-reviews.tsx");
const { readExtraFilters } = require("../apps/web/components/products-browser.tsx");
const { buildPrompt } = require("../apps/web/lib/prompt-lab.ts");
const { PromptLab } = require("../apps/web/components/prompt-lab.tsx");
const { ShoppingCart } = require("../apps/web/components/shopping-cart.tsx");
Module._load = originalLoad;

assert.equal(buildPrompt("   ", "extra", "auto", "fa"), null);
const request = "یه ایمیل کوتاه بنویس\nجلسهٔ چهارشنبه را عقب بنداز";
const email = buildPrompt(request, "خطاب به مدیر پروژه، بدون عذرخواهی", "auto", "fa");
assert.equal(email.kind, "email");
assert.equal(email.entries[1].value, request);
assert(email.entries.some((entry) => entry.value.includes("خطاب به مدیر پروژه، بدون عذرخواهی")));
assert(email.entries.some((entry) => entry.value.includes("موضوع ایمیل")));
const code = buildPrompt("Debug this TypeScript function", "Keep its public API", "auto", "en");
assert.equal(code.kind, "code");
assert(code.entries.some((entry) => entry.value.includes("tests")));
const research = buildPrompt("Compare the best options", "", "auto", "en");
assert.equal(research.kind, "research");
assert(research.entries.some((entry) => entry.value.includes("sources")));
assert.equal(buildPrompt("پرامپت ساخت تصویر یک کوه", "", "auto", "fa").kind, "image");
assert.equal(buildPrompt("یک کپشن برای اینستاگرام بنویس", "", "auto", "fa").kind, "writing");
assert.equal(buildPrompt("ایمیل بنویس", "", "general", "fa").kind, "general");
const labHtml = renderToStaticMarkup(React.createElement(PromptLab, { locale: "fa" }));
assert.match(labHtml, /id="lab-kind"/);
assert.match(labHtml, /<button[^>]*disabled[^>]*>کپی پرامپت<\/button>/);
assert(!labHtml.includes("حداکثر ۱۵۰ کلمه"));

// ---------------- Cart (Figma checkout layout) ----------------
const cartLine = (id, product, amount, extra = {}) => ({
  id,
  product,
  slug: product.toLowerCase(),
  label: "1 Month",
  notice: null,
  currency: "IRR",
  amount,
  savedAmount: amount,
  expiresAt: "2026-11-24T08:00:00Z",
  supplier: false,
  ...extra,
});
cartData = {
  lines: [
    cartLine("line-a", "ChatGPT", "14900000"),
    cartLine("line-b", "Gemini", "9900000", { notice: "PRICE_INCREASE" }),
    cartLine("line-s", "Canva", "5000000", { supplier: true }),
  ],
};
const cart = renderToStaticMarkup(React.createElement(ShoppingCart, { locale: "fa" }));
assert.match(cart, /<li[^>]*aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*سبد خرید/);
assert.match(cart, /۳ قلم/);
// Store lines of one currency share one invoice; the supplier line keeps its own.
assert.match(cart, /href="\/fa\/cart\/review\/line-a\?with=line-b"[^>]*>بازبینی فاکتور ۲ کالا/);
assert.match(cart, /href="\/fa\/cart\/review\/line-s"[^>]*>بازبینی فاکتور جداگانه/);
assert.match(cart, /۲٬۴۸۰٬۰۰۰ تومان/, "Store subtotal sums only shared-invoice lines");
assert.match(cart, /aria-label="حذف ChatGPT از سبد"/);
assert.match(cart, /دست‌کم ۱۰۰ هزار تومان افزایش/);
assert.doesNotMatch(cart, /ورود برای تکمیل خرید/);
cartData = { lines: [] };
const emptyCart = renderToStaticMarkup(React.createElement(ShoppingCart, { locale: "fa" }));
assert.match(emptyCart, /سبد خریدت خالی است/);
assert.match(emptyCart, /href="\/fa\/products"[^>]*>رفتن به فروشگاه/);
assert.doesNotMatch(emptyCart, /\/cart\/review\//);
// Admins never get a checkout action, even with lines returned.
authState = { token: "synthetic-admin", user: { role: "ADMIN", name: "Admin" } };
cartData = { lines: [cartLine("line-a", "ChatGPT", "14900000")] };
const adminCart = renderToStaticMarkup(React.createElement(ShoppingCart, { locale: "fa" }));
assert.match(adminCart, /برای خرید وارد حساب مشتری شو/);
assert.doesNotMatch(adminCart, /\/cart\/review\//);
// Guests see their saved items with a sign-in step instead of an invoice link.
authState = { token: null, user: null };
guestEntries = [{ planId: "plan-a", addedAt: Date.parse("2026-11-23T08:00:00Z") }];
const guestCart = renderToStaticMarkup(React.createElement(ShoppingCart, { locale: "fa" }));
assert.match(guestCart, /href="\/fa\/login\?next=%2Ffa%2Fcart"[^>]*>ورود برای تکمیل خرید/);
assert.doesNotMatch(guestCart, /\/cart\/review\//);
authState = { token: "synthetic", user: { role: "USER", name: "Synthetic" } };
guestEntries = [];

// ---------------- Plan comparison ----------------
const plan = (id, availability, price, extra = {}) => ({
  id,
  label: "1 Month",
  durationDays: 30,
  variant: {
    plan: "Plus",
    access: "PERSONAL",
    fulfillment: "ACCOUNT",
    delivery: "AUTOMATIC",
    warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" },
    region: "UNSPECIFIED",
    quota: "UNSPECIFIED",
  },
  price,
  salePrice: null,
  effectivePrice: price,
  onSale: false,
  discountPercent: 0,
  currency: "IRR",
  availableStock: availability === "OUT_OF_STOCK" ? 0 : 3,
  availability,
  inStock: availability !== "OUT_OF_STOCK",
  ...extra,
});
const compare = renderToStaticMarkup(
  React.createElement(HomeCompare, {
    locale: "fa",
    products: [
      {
        name: "ChatGPT",
        slug: "chatgpt",
        plans: [
          plan("request", "ON_REQUEST", 0, { quoteRequired: true }),
          plan("stocked", "LOCAL_STOCK", 14900000),
        ],
      },
      { name: "Gemini", slug: "gemini", plans: [plan("g1", "SUPPLIER_STOCK", 9900000)] },
    ],
  }),
);
assert.match(compare, /role="tablist"/);
assert.match(compare, /aria-selected="true"[^>]*><bdi>ChatGPT/);
// The in-stock plan is recommended even when a priced-on-request plan comes first.
assert.match(compare, /data-recommended="true"[^>]*>اختصاصی/);
assert.match(compare, /۱٬۴۹۰٬۰۰۰ تومان/);
assert.match(compare, /قیمت با استعلام/);
assert.match(compare, /href="\/fa\/products\/chatgpt\?plan=stocked"/);
assert.match(compare, /<caption class="sr-only">/);
assert.doesNotMatch(compare, /Gemini.*?g1.*?aria-selected="true"/);

// ---------------- Device sessions ----------------
const devices = renderToStaticMarkup(React.createElement(AccountSessions, { locale: "fa" }));
assert.match(devices, /دستگاه‌های واردشده/);
assert.match(devices, /این دستگاه/);
assert.match(devices, /خروج از همهٔ دستگاه‌های دیگر/);
assert.match(devices, /aria-label="خروج Chrome روی Windows"/);
assert.match(devices, /85\.185\.x\.x/);
// The current device can't be signed out from its own row (only via "everywhere").
assert.equal((devices.match(/aria-label="خروج /g) ?? []).length, 1);
sessionData = { sessions: [sessions[0]], currentTracked: true };
const alone = renderToStaticMarkup(React.createElement(AccountSessions, { locale: "en" }));
assert.doesNotMatch(alone, /Sign out all other devices/);
assert.match(alone, /Sign out everywhere, including here/);
sessionData = { sessions: [], currentTracked: false };
const legacy = renderToStaticMarkup(React.createElement(AccountSessions, { locale: "en" }));
assert.match(legacy, /Signed in before this update/);

// ---------------- Ticket screenshots ----------------
const file = (type, size, name = "shot") => ({ type, size, name });
assert.equal(ticketImageError(null, true), null);
assert.equal(ticketImageError(file("image/png", 1024), false), null);
assert.match(ticketImageError(file("image/gif", 1024), false), /JPG, PNG or WebP/);
assert.match(ticketImageError(file("application/pdf", 1024), true), /JPG/);
assert.match(ticketImageError(file("image/webp", 5 * 1024 * 1024 + 1), false), /5 MB/);
assert.match(ticketImageError(file("image/jpeg", 0), false), /empty/);

// ---------------- Review spam hint ----------------
assert.equal(looksPromotional(null), false);
assert.equal(looksPromotional("تحویل سریع بود، ممنون"), false);
for (const spam of [
  "ارزان‌تر: https://x.example",
  "t.me/cheapdeal",
  "پیام بده 09121234567",
  "@cheapacc",
])
  assert.equal(looksPromotional(spam), true, spam);

// ---------------- Catalog filters ----------------
assert.deepEqual(readExtraFilters({}), { access: "", delivery: "", inStock: false });
assert.deepEqual(readExtraFilters({ access: "TEAM", delivery: "MANUAL", inStock: "true" }), {
  access: "TEAM",
  delivery: "MANUAL",
  inStock: true,
});
assert.deepEqual(readExtraFilters({ access: ["TEAM"], delivery: "admin", inStock: "1" }), {
  access: "",
  delivery: "",
  inStock: false,
});

console.log(
  "PASS: cart layout, plan comparison, device sessions, ticket screenshots, review hints and catalog filters",
);
