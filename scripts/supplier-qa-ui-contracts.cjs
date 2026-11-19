/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"),
  Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = require("node:path").resolve(
  __dirname,
  "../apps/web/tsconfig.json",
);
require("tsx/cjs");
const React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
let policyEnabled = false;
let realStock = false;
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === "./account.module.css")
    return { __esModule: true, default: {} };
  if (name === "@/lib/auth") return { useAuth: () => ({ token: "fixture" }) };
  if (name === "@/lib/use-api")
    return {
      useApi: (url) => ({
        loading: false,
        error: null,
        refetch: () => {},
        data:
          url === "/admin/suppliers/qa"
            ? {
                configured: true,
                enabled: policyEnabled,
                authorizationId: "current",
                budgetUsd: null,
                profile: null,
                attempts: policyEnabled
                  ? [
                      {
                        id: "old",
                        authorizationId: "previous",
                        state: "DELIVERED",
                        expectedCost: "0.01",
                      },
                    ]
                  : [],
              }
            : {
                order: {
                  id: "fixture",
                  createdAt: "2026-11-08T00:00:00Z",
                  isSupplierQa: true,
                  supplierQaKind: realStock ? "REAL_STOCK" : "API_TEST",
                  totalAmount: 0,
                  currency: "IRR",
                  paymentStatus: "PAID",
                  items: [],
                  receipts: [],
                },
              },
      }),
    };
  return load.call(this, name, ...args);
};
const { SupplierQaPanel } = require("../apps/web/components/admin/supplier-qa-panel.tsx");
const { OrderDetail } = require("../apps/web/components/order-detail.tsx");
Module._load = load;
const html = renderToStaticMarkup(
  React.createElement(SupplierQaPanel, { token: "fixture", fa: true, locale: "fa" }),
);
assert(html.includes("خرید غیرفعال است"));
assert(html.includes("اشتراک واقعی نیست"));
assert(html.includes('disabled=""'));
policyEnabled = true;
const enabled = renderToStaticMarkup(
  React.createElement(SupplierQaPanel, { token: "fixture", fa: true, locale: "fa" }),
);
assert(
  !enabled.includes('disabled=""'),
  "Old authorizations must not disable a new bounded authorization",
);
const dict = require("../apps/web/app/[locale]/dictionaries/fa.json");
const order = renderToStaticMarkup(
  React.createElement(OrderDetail, { locale: "fa", orderId: "fixture", dict }),
);
assert(order.includes("پرداختی از مشتری دریافت نشده است"));
assert(order.includes("اشتراک واقعی نیست"));
realStock = true;
const stockOrder = renderToStaticMarkup(
  React.createElement(OrderDetail, { locale: "fa", orderId: "fixture", dict }),
);
assert(stockOrder.includes("خرید آزمایشی محصول واقعی"));
assert(!stockOrder.includes("اشتراک واقعی نیست"));
console.log(
  "PASS: QA purchase defaults disabled and customer order clearly discloses operator-funded test",
);
