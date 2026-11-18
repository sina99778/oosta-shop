/* eslint-disable @typescript-eslint/no-require-imports */
// The demo seed starts by deleting every row. It must refuse to run unless
// OOSTA_SEED_RESET names the exact target database (host:port/db), so a
// missing env file or the default apps/api/.env can never wipe a working DB.
// Uses an unreachable port: a refusal must happen before any connection.
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const target = "postgresql://nobody@127.0.0.1:9/oosta_guard_probe?schema=public";

function seed(extraEnv) {
  const env = { ...process.env, NODE_ENV: "development", DATABASE_URL: target, ...extraEnv };
  if (!("OOSTA_SEED_RESET" in extraEnv)) delete env.OOSTA_SEED_RESET;
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), "apps/api/prisma/seed.ts"],
    { cwd: root, env, encoding: "utf8", timeout: 60000 },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

const missing = seed({});
assert.notEqual(missing.status, 0);
assert.match(missing.output, /OOSTA_SEED_RESET=127\.0\.0\.1:9\/oosta_guard_probe/);
assert.doesNotMatch(missing.output, /Can't reach database server/);

const wrong = seed({ OOSTA_SEED_RESET: "localhost:5432/oosta" });
assert.notEqual(wrong.status, 0);
assert.match(wrong.output, /does not match/);
assert.doesNotMatch(wrong.output, /Can't reach database server/);

// The matching value passes the guard and only then tries to connect.
const confirmed = seed({ OOSTA_SEED_RESET: "127.0.0.1:9/oosta_guard_probe" });
assert.notEqual(confirmed.status, 0);
assert.match(confirmed.output, /Can't reach database server/);

console.log("PASS: demo seed refuses to reset a database it was not explicitly told to wipe");
