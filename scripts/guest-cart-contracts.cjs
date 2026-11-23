/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
require("tsx/cjs");
const { ApiError } = require("../apps/web/lib/api.ts");
const {
  addGuestCartItem,
  readGuestCart,
  removeGuestCartItem,
  transferGuestCart,
  guestCartKey,
  guestCartLifetime,
} = require("../apps/web/lib/guest-cart.ts");

const data = new Map();
global.window = new EventTarget();
global.window.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
};

async function main() {
  const now = Date.now();
  global.window.localStorage.setItem(
    guestCartKey,
    JSON.stringify([
      { planId: "expired", addedAt: now - guestCartLifetime },
      { planId: "<invalid>", addedAt: now },
      { planId: "future", addedAt: now + 60000 },
    ]),
  );
  assert.deepEqual(readGuestCart(), []);
  assert.equal(addGuestCartItem("duplicate"), "added");
  assert.equal(addGuestCartItem("duplicate"), "duplicate");
  assert.equal(addGuestCartItem("gone"), "added");
  assert.equal(addGuestCartItem("full"), "added");
  assert.equal(addGuestCartItem("keep"), "added");
  for (const entry of JSON.parse(global.window.localStorage.getItem(guestCartKey)))
    assert.deepEqual(Object.keys(entry).sort(), ["addedAt", "planId"]);
  const sent = [];
  const result = await transferGuestCart(
    async (planId) => {
      sent.push(planId);
      if (planId === "gone") throw new ApiError("Unavailable", 409, "OUT_OF_STOCK");
      if (planId === "full") throw new ApiError("Full", 409, "CART_FULL");
    },
    () => true,
  );
  assert.deepEqual(sent, ["duplicate", "gone", "full"]);
  assert.deepEqual(result, { status: "full", unavailable: 1 });
  assert.deepEqual(
    readGuestCart().map(({ planId }) => planId),
    ["full", "keep"],
  );
  assert.deepEqual(
    await transferGuestCart(
      async () => {
        throw new ApiError("Offline", 0);
      },
      () => true,
    ),
    { status: "error", unavailable: 0 },
  );
  assert.equal(readGuestCart().length, 2);
  const attempted = [];
  const partial = await transferGuestCart(
    async (planId) => {
      attempted.push(planId);
      if (planId === "full") throw new ApiError("Price unavailable", 503, "PRICING_UNAVAILABLE");
    },
    () => true,
  );
  assert.deepEqual(attempted, ["full", "keep"]);
  assert.deepEqual(partial, { status: "error", unavailable: 0 });
  assert.deepEqual(
    readGuestCart().map(({ planId }) => planId),
    ["full"],
  );
  let active = true;
  await transferGuestCart(
    async () => {
      active = false;
    },
    () => active,
  );
  assert.equal(readGuestCart().length, 1);
  removeGuestCartItem("full");
  removeGuestCartItem("keep");
  assert.deepEqual(readGuestCart(), []);
  for (let index = 0; index < 10; index++) assert.equal(addGuestCartItem("plan-" + index), "added");
  assert.equal(addGuestCartItem("overflow"), "full");
  assert.equal(readGuestCart().length, 10);
  console.log("PASS: guest cart storage, expiry, deduplication, transfer retries and capacity");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
