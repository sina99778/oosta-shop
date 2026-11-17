/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit opt-in: checks a deployed read-only preview, never part of local verify.
const assert = require("node:assert/strict");
const origin = new URL(process.argv[2]);
assert(["http:", "https:"].includes(origin.protocol));

async function check(path, status, options = {}, fingerprintedAsset = false) {
  const response = await fetch(new URL(path, origin), {
    ...options,
    signal: AbortSignal.timeout(25000),
  });
  assert.equal(response.status, status, `${options.method ?? "GET"} ${path}`);
  assert.match(
    response.headers.get("cache-control") ?? "",
    fingerprintedAsset ? /\bpublic\b.*\bimmutable\b/ : /no-store/,
  );
  assert.equal(response.headers.get("x-oosta-mode"), "preview-read-only");
  return response;
}

async function main() {
  const home = await check("/fa", 200);
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  // --content-indexed: home, catalog and blog are open to search engines
  // (oosta-content-indexing.conf); everything private must stay noindex.
  const contentIndexed = process.argv.includes("--content-indexed");
  const robots = (response) => response.headers.get("x-robots-tag") ?? "";
  assert.match(robots(home), contentIndexed ? /^index, follow$/ : /noindex/, "/fa robots");
  if (contentIndexed) {
    const blog = await check("/fa/blog", 200);
    const post = (await blog.text()).match(/href="(\/fa\/blog\/[a-z0-9-]+)"/);
    const open = ["/en", "/fa/products", "/en/products", ...(post ? [post[1]] : [])];
    assert.match(robots(blog), /^index, follow$/, "/fa/blog robots");
    for (const path of open)
      assert.match(robots(await check(path, 200)), /^index, follow$/, `${path} robots`);
    for (const path of [
      "/fa/login",
      "/fa/dashboard",
      "/fa/admin",
      "/fa/checkout/cancel",
      "/api/products",
    ])
      assert.match(robots(await check(path, 200)), /noindex/, `${path} robots`);
    // Search Console re-checks this file; removing it drops the verified property
    // (oosta-search-console.conf).
    const ownership = "/googlecc8e43ab596ea33a.html";
    assert.match(
      await (await check(ownership, 200)).text(),
      /^google-site-verification: googlecc8e43ab596ea33a\.html$/,
      `${ownership} content`,
    );
  }
  const html = await home.text();
  const asset = html.match(/(?:src|href)="(\/_next\/[^"]+)"/);
  assert(asset, "Missing frontend asset");
  await check(asset[1].replaceAll("&amp;", "&"), 200, {}, true);
  for (const path of ["/api/health/db", "/api/products", "/fa/products", "/fa/login"])
    await check(path, 200);
  for (const path of ["/api/orders", "/api/tickets", "/api/admin/stats"]) await check(path, 401);
  for (const path of [
    "/api/orders",
    "/api//orders",
    "/api/%6frders",
    "/api/payments/verify",
    "/api/admin/settings",
    "/fa",
  ])
    await check(path, 503, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  await check("/api/auth/signup", process.argv.includes("--supplier-wallet-ready") ? 400 : 503, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (process.argv.includes("--supplier-wallet-ready")) {
    for (const path of [
      "/api/supplier-checkout/quotes",
      "/api/supplier-checkout/orders",
      "/api/orders/synthetic/receipt",
    ])
      await check(path, 401, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
  }
  // Without --login-ready, expect credentials to remain blocked pending CDN origin TLS.
  await check("/api/auth/login", process.argv.includes("--login-ready") ? 400 : 503, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (process.argv.includes("--supplier-qa-ready")) {
    await check("/api/admin/suppliers/qa", 401);
    await check("/api/admin/suppliers/qa/attempts", 401, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestKey: "00000000-0000-4000-8000-000000000001" }),
    });
  }
  if (process.argv.includes("--admin-catalog-ready")) {
    await check("/api/admin/blu/status", 401);
    await check("/api/admin/products", 401, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await check("/api/admin/inventory/bulk", 401, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await check("/api/admin/products/example", 405, { method: "DELETE" });
    await check("/api/admin/blu/qa-invoice", 503, { method: "POST" });
  }
  if (process.argv.includes("--supplier-quotes-ready")) {
    await check("/api/supplier-quotes", 401, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  }
  await check("/.env.production", 404);
  console.log(
    "PASS: deployed preview, static asset, private access, no-store, blocked writes and login validation",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
