/* eslint-disable @typescript-eslint/no-require-imports */
// The web image prerenders pages at build time. siteUrl() must already know the
// public origin then, or canonical/og/JSON-LD URLs on prerendered pages fall
// back to http://localhost:3000. The VPS overlay builds with
// NEXT_PUBLIC_API_URL=/api (no origin to derive from), so the origin has to be
// passed explicitly as NEXT_PUBLIC_WEB_URL.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// 1. Compose: the merged prod + VPS build args carry the public origin.
const prod = yaml.load(read("docker-compose.prod.yml"));
const vps = yaml.load(read("docker-compose.vps.yml"));
const args = { ...prod.services.web.build.args, ...(vps.services.web.build?.args ?? {}) };
assert.equal(args.NEXT_PUBLIC_WEB_URL, "${PUBLIC_ORIGIN}", "web build gets the public origin");
assert.equal(args.NEXT_PUBLIC_API_URL, "/api", "VPS keeps the same-origin API path");

// 2. Dockerfile: the arg reaches the environment of the build stage before
// `npm run build`, and is not copied into the runtime stage as a new default.
const dockerfile = read("apps/web/Dockerfile");
const [buildStage] = dockerfile.split(/^FROM .* AS runtime$/m);
const buildAt = buildStage.indexOf("RUN npm run build");
assert(buildAt > 0, "build stage runs the web build");
const argAt = buildStage.search(/^ARG NEXT_PUBLIC_WEB_URL(=.*)?$/m);
const envAt = buildStage.search(/^ENV NEXT_PUBLIC_WEB_URL=\$NEXT_PUBLIC_WEB_URL$/m);
assert(argAt >= 0 && argAt < buildAt, "ARG NEXT_PUBLIC_WEB_URL before the build");
assert(envAt > argAt && envAt < buildAt, "ENV NEXT_PUBLIC_WEB_URL before the build");

// 3. siteUrl(): with the VPS build env it returns the real origin; without the
// web URL it shows the localhost fallback this contract guards against.
process.env.TSX_TSCONFIG_PATH = path.resolve(root, "apps/web/tsconfig.json");
require("tsx/cjs");
function siteUrlWith(env) {
  const saved = { ...process.env };
  delete process.env.NEXT_PUBLIC_WEB_URL;
  delete process.env.WEB_BASE_URL;
  Object.assign(process.env, env);
  const file = require.resolve("../apps/web/lib/seo.ts");
  delete require.cache[file];
  try {
    return require(file).siteUrl();
  } finally {
    process.env = saved;
    delete require.cache[file];
  }
}
assert.equal(
  siteUrlWith({ NEXT_PUBLIC_API_URL: "/api", NEXT_PUBLIC_WEB_URL: "https://oostaai.store/" }),
  "https://oostaai.store",
);
assert.equal(siteUrlWith({ NEXT_PUBLIC_API_URL: "/api" }), "http://localhost:3000");

console.log(
  "PASS: web build receives NEXT_PUBLIC_WEB_URL so prerendered pages use the public origin",
);
