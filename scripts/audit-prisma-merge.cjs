/* eslint-disable @typescript-eslint/no-require-imports */
// Exercise the exact merge dependency used by Prisma's config loader.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const fromPrisma = createRequire(require.resolve("@prisma/config"));
const { deepmerge } = fromPrisma("deepmerge-ts");
const left = { value: 1 },
  right = { other: 2 };
left.self = left;
right.self = right;
assert.doesNotThrow(
  () => deepmerge(left, right),
  "Prisma config merge must handle circular input without exhausting the stack",
);
assert.deepEqual(
  deepmerge({ datasource: { url: "fixture" } }, { datasource: { shadowDatabaseUrl: "shadow" } }),
  { datasource: { url: "fixture", shadowDatabaseUrl: "shadow" } },
);
console.log("PASS: Prisma config merge handles recursive input and retains nested configuration");
