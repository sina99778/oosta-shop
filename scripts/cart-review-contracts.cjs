/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("tsx/cjs");

const { cartReviewRecovery, isInvoiceExpired } = require("../apps/web/lib/cart-review.ts");

const now = 1_800_000_000_000;
assert.equal(isInvoiceExpired(new Date(now - 1).toISOString(), now), true);
assert.equal(isInvoiceExpired(new Date(now).toISOString(), now), true);
assert.equal(isInvoiceExpired(new Date(now + 1).toISOString(), now), false);
assert.equal(isInvoiceExpired("not-a-timestamp", now), true);

for (const code of ["CART_CHANGED", "SUPPLIER_QUOTE_EXPIRED", "INVOICE_EXPIRED"]) {
  assert.equal(cartReviewRecovery(code, true), "refresh");
  assert.equal(cartReviewRecovery(code, false), "refresh");
}
for (const code of ["OUT_OF_STOCK", "NOT_FOUND"]) {
  assert.equal(cartReviewRecovery(code, true), "cart_or_products");
  assert.equal(cartReviewRecovery(code, false), "cart_or_products");
}
for (const code of ["BLU_STOCK_ORDER_OPEN", "WELCOME_GIFT_PENDING"]) {
  assert.equal(cartReviewRecovery(code, true), "orders");
  assert.equal(cartReviewRecovery(code, false), "orders");
}
assert.equal(cartReviewRecovery("INVALID_DISCOUNT_CODE", true), null);
assert.equal(cartReviewRecovery("INVALID_DISCOUNT_CODE", false), "retry");
assert.equal(cartReviewRecovery(null, true), null);
assert.equal(cartReviewRecovery(null, false), "retry");

const component = fs.readFileSync(
  path.resolve(__dirname, "../apps/web/components/shopping-cart.tsx"),
  "utf8",
);
for (const snippet of [
  "invoice.expiresAt",
  "اعتبار فاکتور تا",
  "دریافت فاکتور تازه",
  "/dashboard#account-orders",
  "/products",
  "/cart",
]) {
  assert(component.includes(snippet), `Missing ${snippet} in shopping-cart.tsx`);
}

console.log(
  "PASS: invoice expiry timing, actionable recovery mapping and cart review links/actions",
);
