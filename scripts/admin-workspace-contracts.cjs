/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const fa = require("../apps/web/app/[locale]/dictionaries/fa.json");
const en = require("../apps/web/app/[locale]/dictionaries/en.json");
const today = new Date().toISOString();
let pathname = "/fa/admin";
let mode = "success";
let evidence = "waiting";
let receiptOrderStatus = "PENDING_REVIEW";
let emptyLastPage = false;
const stats = {
  currency: "IRR",
  revenueTotal: 1000000,
  revenue30: 100000,
  paidOrders: 2,
  totalOrders: 5,
  pendingReview: 3,
  customers: 1,
  salesByDay: [
    {
      day: new Date(Date.parse(today) - 13 * 86400000).toISOString().slice(0, 10),
      count: 1,
      revenue: 8000000,
    },
    { day: today.slice(0, 10), count: 1, revenue: 100000 },
  ],
  recentOrders: [
    {
      id: "sample-order-abc123",
      paymentStatus: "PAID",
      totalAmount: 100000,
      currency: "IRR",
      createdAt: today,
      user: { name: "مشتری آزمایشی", email: "private@example.invalid", phone: "09000000000" },
    },
  ],
  topProducts: [{ id: "test-product", name: "Canva Pro", unitsSold: 9 }],
  lowStock: [{ id: "test-product", name: "Canva Pro", stock: 1 }],
};

const load = Module._load;
Module._load = function (request, ...args) {
  if (request.endsWith(".module.css"))
    return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  if (request === "next/link")
    return ({ children, ...props }) => React.createElement("a", props, children);
  if (request === "next/image") return (props) => React.createElement("img", props);
  if (request === "next/navigation")
    return { usePathname: () => pathname, useParams: () => ({ locale: pathname.split("/")[1] }) };
  if (request === "@/lib/auth")
    return { useAuth: () => ({ token: "test-session", logout: () => {} }) };
  if (request === "@/lib/use-api")
    return {
      useApi: (url, token) => {
        assert.equal(token, "test-session");
        if (url === "/admin/blu/status")
          return { data: { state: "idle", checkedAt: today }, loading: false, refetch: () => {} };
        const pagination = { page: emptyLastPage ? 2 : 1, pageSize: 50, total: 1, totalPages: 1 };
        if (url.startsWith("/admin/orders?"))
          return {
            data: { items: emptyLastPage ? [] : stats.recentOrders, pagination },
            loading: false,
          };
        if (url.startsWith("/admin/receipts?")) {
          assert.match(url, /status=PENDING/);
          return {
            data: {
              items: emptyLastPage
                ? []
                : [
                    {
                      id: "preview-receipt",
                      status: "PENDING",
                      bankEvidence: evidence,
                      createdAt: today,
                      mimeType: "image/png",
                      reference: "001234",
                      order: { ...stats.recentOrders[0], paymentStatus: receiptOrderStatus },
                    },
                  ],
              pendingCount: 1,
              pagination,
            },
            loading: false,
            refetch: () => {},
          };
        }
        if (url.startsWith("/admin/products?"))
          return {
            data: {
              products: [
                {
                  id: "test-product",
                  name: "Canva Pro",
                  slug: "canva-pro",
                  isActive: true,
                  category: { name: "طراحی" },
                  planCount: 2,
                  inventoryCount: 3,
                  inventory: { available: 1, reserved: 1, sold: 1, paused: 2 },
                  sources: { internal: 1, supplier: 1 },
                },
              ],
            },
            loading: false,
          };
        assert.equal(url, "/admin/stats");
        return {
          data: mode === "success" ? stats : null,
          loading: mode === "loading",
          error: mode === "error" ? new Error("Fixture error") : null,
          refetch: () => {},
        };
      },
    };
  return load.call(this, request, ...args);
};
const { AdminNav } = require("../apps/web/components/admin/admin-nav.tsx");
const { AdminDashboard } = require("../apps/web/components/admin/admin-dashboard.tsx");
const { AdminOrders } = require("../apps/web/components/admin/admin-orders.tsx");
const { AdminReceipts } = require("../apps/web/components/admin/admin-receipts.tsx");
const { AdminProducts } = require("../apps/web/components/admin/admin-products.tsx");
Module._load = load;

const labels = {
  products: fa.admin.products,
  orders: fa.admin.orders,
  receipts: fa.admin.receipts.tab,
  reviews: fa.admin.reviews.tab,
  tickets: fa.admin.ticketsTab,
  blog: fa.admin.blogTab,
  api: fa.admin.apiTab,
  settings: fa.admin.settingsTab,
};
const nav = () => renderToStaticMarkup(React.createElement(AdminNav, { locale: "fa", labels }));
for (const [route, active] of [
  ["/fa/admin", "/fa/admin"],
  ["/fa/admin/dashboard", "/fa/admin"],
  ["/fa/admin/products/test-product", "/fa/admin/products"],
  ["/fa/admin/receipts", "/fa/admin/receipts"],
]) {
  pathname = route;
  const html = nav();
  const current = html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
  assert(current?.includes('href="' + active + '"'));
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert(html.includes('aria-controls="admin-navigation"'));
  assert(html.includes("خروج"));
}
const dashboard = (locale, dict) =>
  renderToStaticMarkup(React.createElement(AdminDashboard, { locale, dict }));
const html = dashboard("fa", fa);
assert(html.includes("نمای کلی فروشگاه"));
assert(html.includes('href="/fa/admin/receipts"'));
assert(html.includes('href="/fa/admin/products/test-product"'));
assert(html.includes("۱۰٬۰۰۰ تومان"));
assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) || []).length, 7);
assert(!html.includes("۸۰۰٬۰۰۰ تومان"));
assert(html.includes('style="height:100%"'));
assert(!html.includes("private@example.invalid"));
assert(!html.includes("09000000000"));
assert(dashboard("en", en).includes("Store overview"));
mode = "loading";
assert(dashboard("fa", fa).includes('role="status"'));
mode = "error";
const failed = dashboard("fa", fa);
assert(failed.includes('role="alert"'));
assert(failed.includes("تلاش دوباره"));
assert(!failed.includes("Canva Pro"));

const screen = (Component) =>
  renderToStaticMarkup(React.createElement(Component, { locale: "fa", dict: fa }));
const orders = screen(AdminOrders);
assert(orders.includes("وضعیت سفارش"));
assert(orders.includes("private@example.invalid"));
const approveButton = () => screen(AdminReceipts).match(/<button\b[^>]*>تأیید<\/button>/)?.[0];
assert(approveButton()?.includes('disabled=""'));
evidence = "review";
assert(approveButton()?.includes('disabled=""'));
evidence = "matched";
assert(approveButton() && !approveButton().includes('disabled=""'));
receiptOrderStatus = "PAID";
assert(approveButton()?.includes('disabled=""'));
const products = screen(AdminProducts);
assert(products.includes('type="search"'));
assert(products.includes("۱ آزاد داخلی"));
assert(products.includes("۱ رزرو"));
assert(products.includes("۲ در پلن غیرفعال"));
assert(products.includes("موجودی داخلی کم یا صفر"));
assert(products.includes('href="/fa/admin/products/test-product"'));
emptyLastPage = true;
assert(screen(AdminOrders).includes("بازگشت به صفحهٔ اول"));
assert(screen(AdminReceipts).includes("بازگشت به صفحهٔ اول"));
assert(!screen(AdminReceipts).includes("رسیدی در صف بررسی نیست"));
console.log(
  "PASS: admin navigation, receipt and stock links, sales data, private display, and load/error states",
);
