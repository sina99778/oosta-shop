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
Module._load = function (request, ...args) {
  if (request === "@/lib/use-api")
    return {
      useApi: () => ({ data: { order: fixture }, loading: false, error: null, refetch: () => {} }),
    };
  if (request === "@/lib/auth") return { useAuth: () => ({ token: "synthetic-token" }) };
  return originalLoad.call(this, request, ...args);
};
const { OrderDetail } = require("../apps/web/components/order-detail.tsx");
Module._load = originalLoad;
const dict = require("../apps/web/app/[locale]/dictionaries/fa.json");
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
fixture = { ...fixture, paymentProvider: "ZARINPAL", paymentStatus: "PAID_PENDING_FULFILLMENT" };
assert(
  render().includes("پرداخت دوباره"),
  "Confirmed payment awaiting delivery must warn against paying again",
);
console.log(
  "PASS: actual order UI hides payment actions for closed/paid orders and explains pending fulfillment",
);

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
