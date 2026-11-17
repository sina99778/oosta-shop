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
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === "@/lib/auth")
    return { useAuth: () => ({ token: "synthetic", user: { id: "fixture" } }) };
  if (name === "@/lib/use-api")
    return {
      useApi: () => ({
        loading: false,
        error: null,
        refetch: () => {},
        data: {
          suppliers: [],
          pricing: null,
          fx: {
            configured: true,
            source: "NAVASAN_FREE",
            snapshot: {
              fetchedAt: "2026-11-07T12:00:00Z",
              rates: { USD: { irr: "1000000", updatedAt: "2026-11-07T10:00:00Z" } },
            },
            usedLast31Days: 1,
            budget: 100,
            intervalHours: 8,
            nextAttemptAt: "2026-11-07T20:00:00Z",
            expiresAt: "2027-02-07T12:00:00Z",
            blocked: false,
            lastError: null,
          },
        },
      }),
    };
  return load.call(this, name, ...args);
};
const { AdminSuppliers } = require("../apps/web/components/admin/admin-suppliers.tsx");
const { quoteErrorMessage } = require("../apps/web/components/supplier-quote-panel.tsx");
const { ApiError } = require("../apps/web/lib/api.ts");
Module._load = load;
const html = renderToStaticMarkup(React.createElement(AdminSuppliers, { locale: "fa" }));
assert(html.includes("نوسان رایگان"), "Admin must see free FX source and quota status");
assert(html.includes("هر ۸ ساعت"));
assert(html.includes("NAVASAN_FREE"));
assert(html.includes("زمان نرخ منبع"));
assert(!html.includes("SYNTHETIC-NAVASAN-KEY"));
assert.equal(
  quoteErrorMessage(new ApiError("private upstream text", 503, "PRICING_UNAVAILABLE"), true),
  "قیمت‌گذاری موقتاً در دسترس نیست؛ کمی بعد دوباره استعلام بگیر.",
);
assert.equal(
  quoteErrorMessage(new ApiError("private upstream text", 409, "NO_CURRENT_OFFER"), true),
  "این ترکیب فعلاً نزد تأمین‌کننده موجود نیست؛ گزینهٔ دیگری انتخاب کن.",
);
assert(!quoteErrorMessage(new ApiError("private upstream text", 500), false).includes("private"));
console.log("PASS: administrator sees sampled free FX timing, quota and explicit pricing source");
