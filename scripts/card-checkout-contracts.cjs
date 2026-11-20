/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let state = "PENDING_REVIEW";
let failed = false;
let bluInvoice;
let cartPayment;
let manualSupplier;
let effects = [];
let refreshes = 0;
const fixture = {
  id: "synthetic-card-order",
  totalAmount: 4990000,
  currency: "IRR",
  paymentProvider: "CARD_TO_CARD",
  createdAt: "2026-11-05T00:00:00Z",
  items: [],
  cardToCard: { number: "0000000000000000", holder: "SYNTHETIC_DESTINATION", bank: "Fixture bank" },
  receipts: [
    {
      id: "synthetic-receipt",
      status: "PENDING",
      createdAt: "2026-11-05T00:00:00Z",
      reference: null,
      reviewerNote: null,
    },
  ],
};
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === "next/link")
    return ({ href, children, ...props }) => React.createElement("a", { ...props, href }, children);
  if (request === "react") return { ...React, useEffect: (callback) => effects.push(callback) };
  if (request === "@/lib/auth") return { useAuth: () => ({ token: "synthetic-token" }) };
  if (request === "@/lib/use-api")
    return {
      useApi: () => ({
        data: failed
          ? null
          : {
              order: { ...fixture, paymentStatus: state, bluInvoice, cartPayment, manualSupplier },
            },
        loading: false,
        error: failed ? new Error("Fixture outage") : null,
        refetch: () => {
          refreshes++;
        },
      }),
    };
  return load.call(this, request, ...args);
};
const { CardCheckout } = require("../apps/web/components/card-checkout.tsx");
Module._load = load;
const fa = require("../apps/web/app/[locale]/dictionaries/fa.json");
const en = require("../apps/web/app/[locale]/dictionaries/en.json");
const render = (locale = "fa", dict = fa) =>
  renderToStaticMarkup(React.createElement(CardCheckout, { locale, dict, orderId: fixture.id }));
const savedInterval = global.setInterval,
  savedClear = global.clearInterval;
const savedDocument = global.document;
try {
  const callbacks = new Map();
  let cancelled = 0;
  global.document = {
    visibilityState: "visible",
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  global.setInterval = (callback) => {
    const id = callbacks.size + 1;
    callbacks.set(id, callback);
    return id;
  };
  global.clearInterval = () => {
    cancelled++;
  };
  effects = [];
  render();
  const cleanups = effects.map((effect) => effect()).filter(Boolean);
  assert.equal(callbacks.size, 1, "A pending receipt must refresh automatically");
  callbacks.get(1)();
  assert.equal(refreshes, 1);
  global.document.visibilityState = "hidden";
  callbacks.get(1)();
  assert.equal(refreshes, 1, "Hidden payment tabs must not poll");
  cleanups.forEach((cleanup) => cleanup());
  assert.equal(cancelled, 1);
  callbacks.clear();
  effects = [];
  state = "PAID";
  render();
  effects.forEach((effect) => effect());
  assert.equal(callbacks.size, 0, "Paid orders must stop polling");
} finally {
  global.setInterval = savedInterval;
  global.clearInterval = savedClear;
  if (savedDocument === undefined) delete global.document;
  else global.document = savedDocument;
  state = "PENDING_REVIEW";
}
assert(
  !render().includes("SYNTHETIC_DESTINATION"),
  "A receipt awaiting review must not invite another transfer",
);
const activeStep = render().match(/<li[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/)?.[1];
assert(
  activeStep?.includes(fa.checkout.cardToCard.reviewStep),
  "A submitted receipt must advance to the review step",
);
for (state of ["PAID", "PAID_PENDING_FULFILLMENT", "REFUNDED", "EXPIRED"]) {
  const html = render();
  assert(
    !html.includes("SYNTHETIC_DESTINATION"),
    `${state} must conceal even a stale destination DTO`,
  );
  assert(!html.includes('type="file"'), `${state} must not accept another receipt`);
}
state = "PAID_PENDING_FULFILLMENT";
assert(
  render().includes("پرداخت دوباره"),
  "Captured payment awaiting delivery must explain not to pay again",
);
state = "PENDING";
assert(render().includes("SYNTHETIC_DESTINATION"));
assert(
  render().includes("۴۹۹٬۰۰۰"),
  "Rial amount must display in Toman without changing the order amount",
);
assert(render().includes('type="file"'));
assert(render("en", en).includes("4990000") || render("en", en).includes("4,990,000"));
bluInvoice = {
  baseAmount: 4990100,
  discount: 100,
  expiresAt: "2099-11-05T00:30:00Z",
  expired: false,
  remainingMs: 30000,
};
assert(render().includes("تخفیف مبلغ یکتا"), "Blu invoice displays its price adjustment");
assert(render().includes("مهلت واریز"), "Blu invoice displays its transfer deadline");
bluInvoice = { ...bluInvoice, expired: true, remainingMs: 0 };
assert(!render().includes("SYNTHETIC_DESTINATION"), "Expired invoices conceal a stale card DTO");
assert(render().includes('type="file"'), "Expired invoices accept a receipt for a late payment");
bluInvoice = undefined;
cartPayment = { expiresAt: "2026-11-05T00:30:00Z", remainingMs: 0 };
assert(
  !render().includes('type="file"'),
  "An expired cart still waiting for payment blocks uploads",
);
state = "REJECTED";
fixture.receipts[0] = {
  ...fixture.receipts[0],
  status: "REJECTED",
  reviewerNote: "SYNTHETIC_REVIEWER_NOTE",
};
const rejected = render();
assert(rejected.includes('type="file"'), "A rejected cart receipt can be replaced after expiry");
assert(rejected.includes("SYNTHETIC_REVIEWER_NOTE"));
assert(!rejected.includes("SYNTHETIC_DESTINATION"), "An expired cart hides bank details");
manualSupplier = { ...cartPayment, deliveryHours: null };
cartPayment = undefined;
const manualRejected = render();
assert(!manualRejected.includes('type="file"'), "A rejected manual supplier order blocks uploads");
assert(
  manualRejected.includes("SYNTHETIC_REVIEWER_NOTE"),
  "Show the reviewer note without an upload form",
);
failed = true;
assert(render().includes("تلاش دوباره"), "Order fetch failure must offer retry");
console.log(
  "PASS: card checkout states conceal destinations, avoid repeat payment, preserve amount and support retry",
);
const { receiptFileError } = require("../apps/web/lib/receipt-file.ts");
assert.equal(receiptFileError({ type: "image/png", size: 5 * 1024 * 1024 }), null);
assert.equal(receiptFileError({ type: "application/pdf", size: 1024 }), null);
assert.equal(receiptFileError({ type: "image/png", size: 5 * 1024 * 1024 + 1 }), "size");
assert.equal(receiptFileError({ type: "image/svg+xml", size: 100 }), "type");
assert.equal(receiptFileError({ type: "image/png", size: 0 }), "empty");
console.log(
  "PASS: receipt selection accepts supported files and rejects oversized, empty and active formats",
);
