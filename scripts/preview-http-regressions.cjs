/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

(async () => {
  let privateCache = "private, no-store";
  let staticCache = "public, max-age=31536000, immutable";
  let walletReady = false;
  // Mirrors deploy/nginx/oosta-content-indexing.conf; `leak` marks a private page as indexable.
  let contentIndexed = false;
  let contactIndexed = false;
  let policiesIndexed = false;
  let leak = null;
  let ownershipFile = true;
  let trackingReady = false;
  const config = readFileSync(
    join(__dirname, "../deploy/nginx/oosta-content-indexing.conf"),
    "utf8",
  );
  const matcher = new RegExp(config.match(/^location ~ "([^"]+)" \{/m)[1]);
  const contact = /^\/fa\/p\/(?:about|contact)$/;
  const policy = /^\/fa\/p\/(?:terms|return-policy|privacy-policy)$/;
  for (const path of [
    "/fa/p/about",
    "/fa/p/contact",
    "/fa/p/terms",
    "/fa/p/return-policy",
    "/fa/p/privacy-policy",
  ])
    assert(matcher.test(path), path);
  for (const path of [
    "/en/p/about",
    "/en/p/contact",
    "/en/p/terms",
    "/en/p/return-policy",
    "/en/p/privacy-policy",
    "/fa/p/terms-extra",
    "/fa/p/terms/sub",
    "/fa/p/contact-2",
    "/fa/p/about/sub",
  ])
    assert(!matcher.test(path), path);
  const server = createServer((req, res) => {
    const asset = req.url.startsWith("/_next/");
    res.setHeader("cache-control", asset ? staticCache : privateCache);
    res.setHeader("x-oosta-mode", "preview-read-only");
    res.setHeader("x-frame-options", "DENY");
    const path = req.url.split("?")[0];
    res.setHeader(
      "x-robots-tag",
      (contentIndexed &&
        matcher.test(path) &&
        (contactIndexed || !contact.test(path)) &&
        (policiesIndexed || !policy.test(path))) ||
        path === leak
        ? "index, follow"
        : "noindex, nofollow",
    );
    res.statusCode =
      req.url === "/api/track" && trackingReady
        ? req.method === "POST"
          ? 204
          : 405
        : walletReady && req.method === "POST" && req.url === "/api/auth/signup"
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
    res.end(
      req.url === "/fa"
        ? '<script src="/_next/static/synthetic.js"></script>'
        : req.url === "/fa/blog"
          ? '<a href="/fa/blog/synthetic-post">post</a>'
          : req.url === "/googlecc8e43ab596ea33a.html" && ownershipFile
            ? "google-site-verification: googlecc8e43ab596ea33a.html"
            : "{}",
    );
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
    // Content indexing: open pages must say "index, follow", private ones must not.
    await assert.rejects(run(process.execPath, [...args, "--content-indexed"]), /\/fa robots/);
    contentIndexed = true;
    await run(process.execPath, [...args, "--content-indexed"]);
    const contactArgs = [...args, "--content-indexed", "--contact-indexed"];
    await assert.rejects(run(process.execPath, contactArgs), /\/fa\/p\/about robots/);
    contactIndexed = true;
    await run(process.execPath, contactArgs);
    const policyArgs = [...contactArgs, "--policies-indexed"];
    await assert.rejects(run(process.execPath, policyArgs), /\/fa\/p\/terms robots/);
    policiesIndexed = true;
    await run(process.execPath, policyArgs);
    leak = "/en/p/terms";
    await assert.rejects(run(process.execPath, policyArgs), /\/en\/p\/terms robots/);
    leak = null;
    policiesIndexed = false;
    await assert.rejects(
      run(process.execPath, [...args, "--content-indexed"]),
      /\/fa\/p\/about robots/,
    );
    contactIndexed = false;
    await assert.rejects(run(process.execPath, args), /\/fa robots/);
    leak = "/fa/dashboard";
    await assert.rejects(
      run(process.execPath, [...args, "--content-indexed"]),
      /\/fa\/dashboard robots/,
    );
    leak = null;
    // Visit beacon: blocked (503) until the tracking location is installed.
    await assert.rejects(
      run(process.execPath, [...args, "--content-indexed", "--tracking-ready"]),
      /POST \/api\/track/,
    );
    trackingReady = true;
    await run(process.execPath, [...args, "--content-indexed", "--tracking-ready"]);
    trackingReady = false;
    ownershipFile = false;
    await assert.rejects(
      run(process.execPath, [...args, "--content-indexed"]),
      /googlecc8e43ab596ea33a\.html content/,
    );
    ownershipFile = true;
    contentIndexed = false;
    privateCache = "public, max-age=60";
    await assert.rejects(run(process.execPath, args), /no-store/);
    privateCache = "private, no-store";
    staticCache = "private, no-store";
    await assert.rejects(run(process.execPath, args), /immutable/);
    console.log(
      "PASS: preview accepts immutable assets, indexes only home/catalog/blog when opened, accepts the visit beacon only when enabled, and rejects public caching of private routes or uncached fingerprinted assets",
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
