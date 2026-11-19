/* eslint-disable @typescript-eslint/no-require-imports */
// Offline probes: actual API client and backend schemas, synthetic responses only.
require("tsx/cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { api } = require("../apps/web/lib/api.ts");
const { signupSchema } = require("../apps/api/src/modules/auth/auth.schemas.ts");
const schemas = require("../apps/api/src/modules/admin/admin.schemas.ts");
const checks = [];
const record = (name, result) => {
  checks.push({ name, result });
  console.log(name, JSON.stringify(result));
};
function luminance(hex) {
  const rgb = hex
    .match(/[0-9a-f]{2}/gi)
    .map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
async function main() {
  let requestOptions;
  global.fetch = async (_url, options) => {
    requestOptions = options;
    return new Response("<html>upstream error</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
  const response = await api.get("/synthetic-endpoint");
  assert.deepEqual(response, {});
  record("SUCCESS_WITH_INVALID_JSON_ACCEPTED", {
    returned: response,
    requestHasAbortSignal: Boolean(requestOptions.signal),
  });
  const persianPhone = signupSchema.safeParse({
    name: "Synthetic",
    phone: "۰۹۱۲۱۲۳۴۵۶۷",
    password: "SyntheticPassword123",
  });
  const latinPhone = signupSchema.safeParse({
    name: "Synthetic",
    phone: "09121234567",
    password: "SyntheticPassword123",
  });
  assert(!persianPhone.success && latinPhone.success);
  record("PHONE_DIGIT_CONTRACT", {
    persianDigitsAccepted: persianPhone.success,
    latinDigitsAccepted: latinPhone.success,
  });
  record("ADMIN_DEFAULT_PAGINATION", {
    receipts: schemas.receiptsQuerySchema.parse({}),
    reviews: schemas.reviewsQuerySchema.parse({}),
    tickets: schemas.ticketsQuerySchema.parse({}),
  });
  record(
    "WHITE_ON_PRIMARY_GRADIENT_CONTRAST",
    ["ff4d00", "ff7a00"].map((color) => ({
      background: `#${color}`,
      ratio: Number((1.05 / (luminance(color) + 0.05)).toFixed(3)),
    })),
  );
  fs.writeFileSync(
    path.join(__dirname, "../ui-review-contract-results.json"),
    JSON.stringify(checks, null, 2),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
