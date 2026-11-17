/* eslint-disable @typescript-eslint/no-require-imports */
// Render the actual order view with synthetic API DTOs. No network or real accounts.
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
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
                : { order: fixture },
        loading: false,
        error: null,
        refetch: () => {},
      }),
    };
  if (request === "next/navigation")
    return {
      useRouter: () => ({ push: () => {} }),
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
const { Button } = require("../apps/web/components/ui/button.tsx");
const { Header } = require("../apps/web/components/layout/header.tsx");
const { Footer } = require("../apps/web/components/layout/footer.tsx");
Module._load = originalLoad;
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
headerUser = { role: "USER", name: "Fixture" };
assert(!header().includes('href="/fa/admin"'));
headerUser = { role: "ADMIN", name: "Fixture admin" };
assert(header().includes('href="/fa/admin"'));
const footer = renderToStaticMarkup(
  React.createElement(Footer, {
    locale: "fa",
    dict: dict.footer,
    nav: dict.nav,
    config: { settings: {}, enamadBadge: false },
  }),
);
assert(footer.includes('href="#oosta-page-top"'));
assert(!footer.includes("/site-assets/enamad"));
assert(footer.includes('href="/fa/support"'));
const withBadge = renderToStaticMarkup(
  React.createElement(Footer, {
    locale: "fa",
    dict: dict.footer,
    nav: dict.nav,
    config: { settings: { enamadLink: "javascript:blocked" }, enamadBadge: true },
  }),
);
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
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
