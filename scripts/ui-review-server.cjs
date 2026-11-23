/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable UI fixture API + real Next dev server. Never connects to a DB.
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const calls = [];
const category = { id: "fixture-category", slug: "fixture", name: "دسته آزمایشی", productCount: 1 };
const product = {
  id: "fixture-product",
  slug: "fixture-product",
  name: "محصول آزمایشی اتصال رابط",
  image: "http://127.0.0.1:4400/fixture.svg",
  hasImage: false,
  type: "LICENSE",
  category,
  priceFrom: 350000,
  originalPriceFrom: null,
  discountPercent: 0,
  currency: "IRR",
  availableStock: 4,
  inStock: true,
  lowStock: true,
  isFeatured: true,
  ratingAverage: 0,
  ratingCount: 0,
  shortDescription: "داده ساختگی؛ خرید و پرداخت واقعی انجام نمی‌شود.",
  description: "این محصول فقط برای بازبینی محلی رابط کاربری است.",
  specs: [],
  galleryImageIds: [],
  plans: [
    {
      id: "fixture-plan",
      label: "اشتراک یک ماهه آزمایشی",
      durationDays: 30,
      price: 350000,
      salePrice: null,
      effectivePrice: 350000,
      onSale: false,
      discountPercent: 0,
      currency: "IRR",
      availableStock: 4,
      inStock: true,
    },
  ],
  rating: { average: 0, count: 0 },
  reviews: [],
  related: [],
};
const server = http.createServer((req, res) => {
  calls.push({ method: req.method, url: req.url });
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1:4400");
  if (url.pathname === "/products/fixture-unavailable") {
    res.writeHead(503, {"Content-Type": "application/json"}); res.end(JSON.stringify({error:{code:"UNAVAILABLE",message:"Synthetic outage"}})); return;
  }
  if (url.pathname === "/fixture.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#123456"/><text x="100" y="160" fill="white" font-size="32">Fixture image</text></svg>',
    );
    return;
  }
  res.setHeader("Content-Type", "application/json");
  let body;
  if (url.pathname === "/site-settings") body = { settings: {}, enamadBadge: false };
  else if (url.pathname === "/categories") body = { categories: [category] };
  else if (url.pathname === "/products/bestselling") body = { products: [product] };
  else if (url.pathname === "/products/fixture-product") body = { product };
  else if (url.pathname === "/products")
    body = { items: [product], pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 } };
  else if (url.pathname === "/payments/config")
    body = { online: false, cardToCard: false, card: null };
  else if (url.pathname === "/track") {
    res.writeHead(204).end();
    return;
  } else if (url.pathname === "/blog") body = { posts: [] };
  else if (url.pathname === "/pages") body = { pages: [] };
  else {
    res.statusCode = 404;
    body = {
      error: { code: "FIXTURE_ONLY", message: "Only synthetic read endpoints are available" },
    };
  }
  res.end(JSON.stringify(body));
});
server.listen(4400, "127.0.0.1", () => console.log("UI fixture API: http://127.0.0.1:4400"));
const web = spawn(
  process.execPath,
  [
    "--use-system-ca",
    path.join(root, "node_modules/next/dist/bin/next"),
    "dev",
    path.join(root, "apps/web"),
    "-p",
    "3100",
    "-H",
    "127.0.0.1",
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:4400",
      API_INTERNAL_URL: "http://127.0.0.1:4400",
      WEB_BASE_URL: "http://127.0.0.1:3100",
      NODE_USE_SYSTEM_CA: "1",
    },
  },
);
console.log("UI_REVIEW_PIDS", JSON.stringify({ fixture: process.pid, next: web.pid }));
process.on("SIGINT", () => {
  fs.writeFileSync(path.join(root, "ui-review-requests.json"), JSON.stringify(calls, null, 2));
  web.kill();
  server.close();
  process.exit(0);
});
