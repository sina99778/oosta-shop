/* eslint-disable @typescript-eslint/no-require-imports */
// Render the actual order view with synthetic API DTOs. No network or real accounts.
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ApiError } = require("../apps/web/lib/api.ts");
const { apiErrorMessage } = require("../apps/web/lib/api-error-message.ts");
assert.match(
  apiErrorMessage(new ApiError("Invalid credentials", 401, "UNAUTHORIZED"), "fa", "retry", "login"),
  /رمز عبور/,
);
assert.match(
  apiErrorMessage(new ApiError("Receipt upload limit", 429, "RECEIPT_LIMIT"), "fa", "retry"),
  /سقف ارسال رسید/,
);
assert.match(
  apiErrorMessage(new ApiError("Too many attempts", 429, "RATE_LIMITED"), "en", "retry"),
  /Too many attempts/,
);
assert.equal(
  apiErrorMessage(new ApiError("internal detail", 500, "UNKNOWN"), "fa", "retry"),
  "retry",
);
let fixture = {
  id: "synthetic-order",
  totalAmount: 100,
  currency: "IRR",
  createdAt: "2026-11-05T00:00:00Z",
  paymentProvider: "CARD_TO_CARD",
  paymentStatus: "REFUNDED",
  receipts: [],
  cardToCard: null,
  items: [
    {
      id: "synthetic-item",
      product: { name: "Synthetic product" },
      plan: { label: "Synthetic plan" },
      quantity: 1,
      lineTotal: 100,
      credentials: [],
    },
  ],
};
const originalLoad = Module._load;
let pathname = "/fa/products-extra";
let headerUser = null;
const ticket = {
  id: "fixture-ticket",
  subject: "پرسش آزمایشی",
  status: "CLOSED",
  createdAt: fixture.createdAt,
  updatedAt: fixture.createdAt,
  lastMessage: "داده نمونه",
  messages: [{ id: "msg", isStaff: true, body: "پاسخ نمونه", createdAt: fixture.createdAt }],
};
Module._load = function (request, ...args) {
  if (request.endsWith(".module.css"))
    return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  if (request === "@/lib/use-api")
    return {
      useApi: (url) => ({
        data:
          url === "/tickets"
            ? { tickets: [ticket] }
            : url?.startsWith("/tickets/")
              ? { ticket }
              : url === "/orders"
                ? { orders: [{ ...fixture, itemCount: 1 }] }
                : url === "/cart/count"
                  ? { count: 2 }
                  : { order: fixture },
        loading: false,
        error: null,
        refetch: () => {},
      }),
    };
  if (request === "next/navigation")
    return {
      useRouter: () => ({ push: () => {} }),
      useSearchParams: () => new URLSearchParams(),
      useParams: () => ({ locale: "fa" }),
      usePathname: () => pathname,
    };
  if (request === "@/lib/auth")
    return { useAuth: () => ({ token: "synthetic-token", user: headerUser }) };
  return originalLoad.call(this, request, ...args);
};
const { OrderDetail } = require("../apps/web/components/order-detail.tsx");
const { TicketList } = require("../apps/web/components/tickets/ticket-list.tsx");
const { TicketThread } = require("../apps/web/components/tickets/ticket-thread.tsx");
const { DashboardOrders } = require("../apps/web/components/dashboard-orders.tsx");
const { AccountRecoveryEmail } = require("../apps/web/components/account-recovery-email.tsx");
const { Button } = require("../apps/web/components/ui/button.tsx");
const { Header } = require("../apps/web/components/layout/header.tsx");
const { AuthForm } = require("../apps/web/components/auth-form.tsx");
const { PasswordRecoveryForm } = require("../apps/web/components/password-recovery-form.tsx");
const { Footer } = require("../apps/web/components/layout/footer.tsx");
const { ProductCard } = require("../apps/web/components/product-card.tsx");
Module._load = originalLoad;
for (const locale of ["en", "fa"]) {
  const dict = require(`../apps/web/app/[locale]/dictionaries/${locale}.json`);
  const login = renderToStaticMarkup(
    React.createElement(AuthForm, { mode: "login", locale, dict }),
  );
  assert.equal(login.split(`href="/${locale}/forgot-password"`).length, 2);
  const forgot = renderToStaticMarkup(
    React.createElement(PasswordRecoveryForm, { mode: "request", locale, dict }),
  );
  assert.match(forgot, /type="email"/);
  assert(forgot.includes(dict.auth.recovery.send));
  assert(forgot.includes(`href="/${locale}/login"`));
  const reset = renderToStaticMarkup(
    React.createElement(PasswordRecoveryForm, { mode: "reset", locale, dict }),
  );
  assert(reset.includes(dict.auth.recovery.resetTitle));
  assert.doesNotMatch(reset, /type="password"/);
}
const card = (availability) =>
  renderToStaticMarkup(
    React.createElement(ProductCard, {
      locale: "en",
      labels: { from: "From", left: "left", off: "off" },
      product: {
        name: "Fixture",
        slug: "fixture",
        type: "ACCOUNT",
        category: { name: "Fixture" },
        availability,
        currency: "IRT",
        priceFrom: 19,
        originalPriceFrom: 25,
        pricePlanId: availability === "LOCAL_STOCK" ? "monthly" : null,
        priceDurationDays: 30,
      },
    }),
  );
assert.match(card("LOCAL_STOCK"), /href="\/en\/products\/fixture\?plan=monthly"/);
assert.match(card("LOCAL_STOCK"), /19 IRT/);
assert.match(card("LOCAL_STOCK"), /30 days/);
assert.match(card("ON_REQUEST"), /Price on request/);
assert.doesNotMatch(card("OUT_OF_STOCK"), /19 IRT|Price on request/);
const { formatPrice } = require("../apps/web/lib/format.ts");
assert.equal(formatPrice(190, "IRR", "fa"), "۱۹ تومان");
assert.equal(formatPrice(19, "IRT", "fa"), "۱۹ تومان");
const disabledButton = renderToStaticMarkup(
  React.createElement(
    Button,
    {
      type: "submit",
      variant: "outline",
      disabled: true,
      "aria-busy": true,
    },
    "Fixture",
  ),
);
assert.match(disabledButton, /class="[^"]*oosta-button/);
assert.match(disabledButton, /data-button-variant="outline"/);
assert.match(disabledButton, /type="submit"/);
assert.match(disabledButton, /disabled=""/);
assert.match(disabledButton, /aria-busy="true"/);
const dict = require("../apps/web/app/[locale]/dictionaries/fa.json");
const signup = renderToStaticMarkup(
  React.createElement(AuthForm, { mode: "signup", locale: "fa", dict }),
);
assert(signup.includes("ایمیل (اختیاری)") && signup.includes("شماره موبایل (اختیاری)"));
assert.match(signup, /aria-describedby="auth-password-hint"/);
assert.match(signup, /id="auth-password-hint"[^>]*>حداقل ۸ کاراکتر/);
assert.match(
  signup,
  /<fieldset[^>]*>\s*<legend[^>]*>[^<]+<\/legend>[\s\S]*?type="email"[\s\S]*?type="tel"[\s\S]*?<\/fieldset>/,
);
const header = () =>
  renderToStaticMarkup(
    React.createElement(Header, { locale: "fa", dict: dict.nav, themeLabel: "تم" }),
  );
assert(!header().includes('aria-current="page"'));
pathname = "/fa/products/chatgpt";
assert.match(header(), /<a(?=[^>]*href="\/fa\/products")(?=[^>]*aria-current="page")[^>]+>/);
assert.match(header(), /aria-expanded="false" aria-controls="mobile-navigation"/);
assert.match(header(), /<nav id="mobile-navigation"[^>]*hidden=""/);
assert(!header().includes('href="/fa/admin"'));
assert(!header().includes('aria-label="سبد خرید (۲)"'));
headerUser = { role: "USER", name: "Fixture" };
assert(!header().includes('href="/fa/admin"'));
assert(header().includes('aria-label="سبد خرید (۲)"'));
const headerMarkup = header();
assert.equal((headerMarkup.match(/href="\/fa\/cart"/g) ?? []).length, 1);
assert.match(
  headerMarkup,
  /<div class="toolbar"><a[^>]*href="\/fa\/cart"[^>]*><svg[^>]*aria-hidden="true"/,
);
assert.doesNotMatch(headerMarkup, />سبد خرید</);
headerUser = { role: "ADMIN", name: "Fixture admin" };
assert(header().includes('href="/fa/admin"'));
assert(!header().includes('aria-label="سبد خرید (۲)"'));
const footer = renderToStaticMarkup(
  React.createElement(Footer, {
    locale: "fa",
    dict: dict.footer,
    nav: dict.nav,
    config: {
      settings: { contactTelegram: "http://t.me/m/FixtureSupport" },
      enamadBadge: false,
    },
  }),
);
assert(footer.includes('href="#oosta-page-top"'));
assert(!footer.includes("/site-assets/enamad"));
assert(footer.includes('href="/fa/support"'));
assert(footer.includes('href="https://t.me/m/FixtureSupport"'));
for (const slug of ["terms", "return-policy", "privacy-policy"]) {
  assert(footer.includes(`href="/fa/p/${slug}"`));
}
const withBadge = renderToStaticMarkup(
  React.createElement(Footer, {
    locale: "fa",
    dict: dict.footer,
    nav: dict.nav,
    config: {
      settings: { enamadLink: "javascript:blocked", contactTelegram: "https://t.me@other.invalid" },
      enamadBadge: true,
    },
  }),
);
assert(withBadge.includes('href="https://t.me/oostaAiSupport"'));
assert(!withBadge.includes("other.invalid"));
assert(withBadge.includes("/site-assets/enamad"));
assert(!withBadge.includes("javascript:"));
function render() {
  return renderToStaticMarkup(
    React.createElement(OrderDetail, { locale: "fa", orderId: fixture.id, dict }),
  );
}
for (const state of ["REFUNDED", "EXPIRED", "PAID_PENDING_FULFILLMENT", "PAID"]) {
  fixture = { ...fixture, paymentStatus: state };
  assert(
    !render().includes("/fa/checkout/card/synthetic-order"),
    `${state} must not offer another payment`,
  );
}
fixture = { ...fixture, paymentStatus: "PENDING" };
assert(render().includes("/fa/checkout/card/synthetic-order"));
fixture = { ...fixture, id: "synthetic12345678", bluInvoice: { expired: true, discount: 0 } };
assert(!render().includes("/fa/checkout/card/synthetic12345678"));
for (const type of ["manualSupplier", "cartPayment"]) {
  fixture = {
    ...fixture,
    bluInvoice: null,
    cartPayment: null,
    manualSupplier: null,
    [type]: { remainingMs: 0 },
  };
  assert(!render().includes("/fa/checkout/card/synthetic12345678"), `expires ${type}`);
  fixture[type].remainingMs = 1000;
  assert(render().includes("/fa/checkout/card/synthetic12345678"));
}
assert(render().includes("/fa/support?order=12345678#new-ticket"));
fixture = {
  ...fixture,
  bluInvoice: null,
  receipts: [
    {
      id: "synthetic-receipt",
      status: "REJECTED",
      createdAt: fixture.createdAt,
      reviewerNote: "Synthetic review",
      reference: "secret-test-ref",
    },
  ],
};
assert(render().includes("Synthetic review"));
assert(!render().includes("secret-test-ref"));
fixture = {
  ...fixture,
  paymentStatus: "REJECTED",
  cartPayment: { remainingMs: 0 },
};
const rejectedCart = render();
assert(rejectedCart.includes("/fa/checkout/card/synthetic12345678"));
assert(rejectedCart.includes("ارسال مجدد رسید"));
assert(rejectedCart.includes("Synthetic review"));
fixture = { ...fixture, cartPayment: null, manualSupplier: { remainingMs: 30000 } };
assert(!render().includes("/fa/checkout/card/synthetic12345678"));
fixture = { ...fixture, manualSupplier: { remainingMs: 0 } };
assert(!render().includes("/fa/checkout/card/synthetic12345678"));
fixture = { ...fixture, manualSupplier: null, bluInvoice: { expired: true, discount: 0 } };
assert(!render().includes("/fa/checkout/card/synthetic12345678"));
fixture = { ...fixture, paymentProvider: "ZARINPAL", paymentStatus: "PAID_PENDING_FULFILLMENT" };
assert(
  render().includes("پرداخت دوباره"),
  "Confirmed payment awaiting delivery must warn against paying again",
);
console.log(
  "PASS: actual order UI hides payment actions for closed/paid orders and explains pending fulfillment",
);
const customerPage = (component, props = {}) =>
  renderToStaticMarkup(React.createElement(component, { locale: "fa", dict, ...props }));
const support = customerPage(TicketList, { orderRef: "12345678" });
assert(support.includes("پیگیری سفارش #12345678"));
assert(support.includes("/fa/support/fixture-ticket"));
assert(support.includes("رمز حساب"));
const thread = customerPage(TicketThread, { ticketId: ticket.id });
assert(thread.includes("پاسخ نمونه"));
assert(thread.includes("ارسال پاسخ، تیکت را دوباره باز می‌کند"));
assert(!customerPage(TicketThread, { ticketId: "other-ticket" }).includes("پاسخ نمونه"));
assert(customerPage(DashboardOrders).includes("در حال پیگیری"));
headerUser = {
  role: "USER",
  name: "خریدار نمونه",
  email: "shop-fixture@example.invalid",
  phone: null,
};
const profile = customerPage(DashboardOrders);
assert(profile.includes("حساب من"));
assert(profile.includes("خریدار نمونه"));
assert(profile.includes("shop-fixture@example.invalid"));
assert(profile.includes('id="account-orders"'));
assert(profile.includes("/fa/dashboard/security#recovery-code"));
const security = customerPage(AccountRecoveryEmail);
assert.match(security, /name="code"[^>]*|autocomplete="one-time-code"/i);
assert(security.includes('id="recovery-code"'));
assert(security.includes('name="password"'));
headerUser = { ...headerUser, recoveryEmailVerified: true };
assert(!customerPage(AccountRecoveryEmail).includes('name="code"'));

const config = require("../apps/web/next.config.ts").default;
Promise.resolve(config.headers?.())
  .then((rules) => {
    const headers = Object.fromEntries(
      (rules?.find((rule) => rule.source === "/:path*")?.headers || []).map((header) => [
        header.key.toLowerCase(),
        header.value,
      ]),
    );
    assert.equal(headers["x-frame-options"], "DENY");
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.match(headers["content-security-policy"] || "", /frame-ancestors 'none'/);
    console.log("PASS: frontend responses block framing and MIME sniffing");
    require("./web-query-regressions.cjs");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
