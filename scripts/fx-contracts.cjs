/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  normalizeNavasan,
  fetchNavasan,
  usableFxRates,
  mayAttempt,
  FX_INTERVAL_MS,
} = require("../apps/api/src/modules/suppliers/navasan.ts");
const now = new Date("2026-11-07T12:00:00Z");
const stamp = Math.floor(now.getTime() / 1000) - 7200;
const raw = {
  usd_sell: { value: "100000", timestamp: stamp },
  usdt: { value: "101000", timestamp: stamp - 60 },
};
const snapshot = normalizeNavasan(raw, now);
assert.equal(snapshot.rates.USD.irr, "1000000");
assert.equal(snapshot.rates.USDT.irr, "1010000");
assert.equal(snapshot.rates.USD.updatedAt, new Date(stamp * 1000).toISOString());
assert.equal(usableFxRates(snapshot, now.getTime()).USD, "1000000");
assert.deepEqual(usableFxRates(snapshot, now.getTime() + 11 * 3600000), {});
assert.throws(() => normalizeNavasan({ error: "fixture" }, now));
assert.throws(() => normalizeNavasan({ usd_sell: { value: "-1", timestamp: stamp } }, now));
assert.throws(() => normalizeNavasan({ usd_sell: { value: "1", timestamp: stamp + 8000 } }, now));
const partial = normalizeNavasan({ usd_sell: raw.usd_sell }, now);
assert(!partial.rates.USDT, "Never peg USDT to USD");
const state = {
  attempts: [],
  createdAt: now.toISOString(),
  expiresAt: "2027-02-07T12:00:00Z",
  blocked: false,
  snapshot: null,
  lastError: null,
};
assert(mayAttempt(state, now.getTime()));
assert(
  !mayAttempt({ ...state, attempts: [now.toISOString()] }, now.getTime() + FX_INTERVAL_MS - 1),
);
assert(!mayAttempt({ ...state, blocked: true }, now.getTime()));
assert(!mayAttempt({ ...state, expiresAt: now.toISOString() }, now.getTime()));
assert(
  !mayAttempt(
    { ...state, attempts: Array(100).fill(new Date(now.getTime() - 86400000).toISOString()) },
    now.getTime(),
  ),
);
assert(
  mayAttempt(
    { ...state, attempts: [new Date(now.getTime() - 32 * 86400000).toISOString()] },
    now.getTime(),
  ),
);
async function transport() {
  const before = global.fetch;
  try {
    global.fetch = async (url, options) => {
      const u = new URL(url);
      assert.equal(u.origin, "https://api.navasan.tech");
      assert.equal(u.pathname, "/latest/");
      assert.equal(u.searchParams.get("api_key"), "SYNTHETIC-FX-KEY");
      assert.equal(options.redirect, "error");
      assert.equal(options.method, "GET");
      return new Response(JSON.stringify(raw), { status: 200 });
    };
    assert.equal((await fetchNavasan("SYNTHETIC-FX-KEY", now)).rates.USD.irr, "1000000");
    for (const status of [401, 429, 500]) {
      global.fetch = async () => new Response("SYNTHETIC-FX-KEY", { status });
      await assert.rejects(
        () => fetchNavasan("SYNTHETIC-FX-KEY", now),
        (e) =>
          !JSON.stringify(e).includes("SYNTHETIC-FX-KEY") &&
          !e.message.includes("SYNTHETIC-FX-KEY"),
      );
    }
    global.fetch = async () => {
      throw new Error("https://api.navasan.tech/?api_key=SYNTHETIC-FX-KEY");
    };
    await assert.rejects(
      () => fetchNavasan("SYNTHETIC-FX-KEY", now),
      (e) => !e.message.includes("SYNTHETIC-FX-KEY"),
    );
    console.log(
      "PASS: free FX units, source timestamps, partial currencies, quota pacing and sanitized HTTPS transport",
    );
  } finally {
    global.fetch = before;
  }
}
transport().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
