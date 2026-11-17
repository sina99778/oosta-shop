/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

(async () => {
  let privateCache = "private, no-store";
  let staticCache = "public, max-age=31536000, immutable";
  let walletReady = false;
  const server = createServer((req, res) => {
    const asset = req.url.startsWith("/_next/");
    res.setHeader("cache-control", asset ? staticCache : privateCache);
    res.setHeader("x-oosta-mode", "preview-read-only");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    res.statusCode =
      walletReady && req.method === "POST" && req.url === "/api/auth/signup"
        ? 400
        : walletReady &&
            req.method === "POST" &&
            [
              "/api/supplier-checkout/quotes",
              "/api/supplier-checkout/orders",
              "/api/orders/synthetic/receipt",
            ].includes(req.url)
          ? 401
          : req.method === "POST"
            ? req.url === "/api/auth/login"
              ? 400
              : 503
            : ["/api/orders", "/api/tickets", "/api/admin/stats"].includes(req.url)
              ? 401
              : req.url === "/.env.production"
                ? 404
                : 200;
    res.end(req.url === "/fa" ? '<script src="/_next/static/synthetic.js"></script>' : "{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const args = [
    "scripts/preview-http-check.cjs",
    `http://127.0.0.1:${server.address().port}`,
    "--login-ready",
  ];
  try {
    await run(process.execPath, args);
    walletReady = true;
    await run(process.execPath, [...args, "--supplier-wallet-ready"]);
    walletReady = false;
    await assert.rejects(run(process.execPath, [...args, "--supplier-wallet-ready"]));
    privateCache = "public, max-age=60";
    await assert.rejects(run(process.execPath, args), /no-store/);
    privateCache = "private, no-store";
    staticCache = "private, no-store";
    await assert.rejects(run(process.execPath, args), /immutable/);
    console.log(
      "PASS: preview accepts immutable assets and rejects public caching of private routes or uncached fingerprinted assets",
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
