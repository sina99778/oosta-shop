/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only sample catalog for reviewing the real storefront without a database.
// Never used by the production server. No authentication or purchase mutations.
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const supplierVariants = process.argv.includes("--supplier-variants");
const categories = [
  { id: "preview-ai", slug: "ai-accounts", name: "هوش مصنوعی", productCount: 2 },
  {
    id: "preview-software",
    slug: "software-licenses",
    name: "نرم‌افزار و لایسنس",
    productCount: 1,
  },
  { id: "preview-gift", slug: "gift-cards", name: "گیفت‌کارت", productCount: 1 },
];
const products = [
  ["chatgpt-plus", "ChatGPT Plus", "ACCOUNT", 0, 4990000, true],
  ["claude-pro", "Claude Pro", "ACCOUNT", 0, 12900000, true],
  ["windows-11-pro", "Windows 11 Pro", "LICENSE", 1, 7950000, true],
  ["google-play", "Google Play Gift Card", "GIFTCARD", 2, 12000000, false],
].map(([slug, name, type, categoryIndex, price, inStock]) => ({
  id: `preview-${slug}`,
  slug,
  name,
  type,
  category: categories[categoryIndex],
  image: null,
  hasImage: false,
  priceFrom: price,
  originalPriceFrom: null,
  discountPercent: 0,
  currency: "IRR",
  availableStock: inStock ? 5 : 0,
  inStock,
  lowStock: false,
  isFeatured: false,
  ratingAverage: 0,
  ratingCount: 0,
}));
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3101");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const url = new URL(req.url, "http://127.0.0.1:4401");
  if (url.pathname === "/track") return res.writeHead(204).end();
  if (req.method !== "GET")
    return res
      .writeHead(405)
      .end(JSON.stringify({ error: { code: "PREVIEW_ONLY", message: "Read-only preview" } }));
  let body;
  if (url.pathname === "/site-settings")
    body = {
      settings: {
        announcementFa: "پیش‌نمایش طراحی · محصولات و قیمت‌ها نمونه‌اند؛ خرید فعال نیست.",
        announcementEn: "Design preview · Sample products and prices. Purchasing is disabled.",
      },
      enamadBadge: false,
    };
  else if (url.pathname === "/categories") body = { categories };
  else if (url.pathname === "/products/bestselling") body = { products };
  else if (url.pathname === "/products") {
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();
    const selected = products.filter(
      (p) =>
        (!url.searchParams.get("category") ||
          p.category.slug === url.searchParams.get("category")) &&
        (!search || p.name.toLowerCase().includes(search)),
    );
    const sort = url.searchParams.get("sort");
    if (sort === "price_asc") selected.sort((a, b) => a.priceFrom - b.priceFrom);
    if (sort === "price_desc") selected.sort((a, b) => b.priceFrom - a.priceFrom);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.max(1, Math.min(50, Number(url.searchParams.get("pageSize")) || 12));
    body = {
      items: selected.slice((page - 1) * pageSize, page * pageSize),
      pagination: {
        page,
        pageSize,
        total: selected.length,
        totalPages: Math.max(1, Math.ceil(selected.length / pageSize)),
      },
    };
  } else if (url.pathname.startsWith("/products/")) {
    const product = products.find((p) => p.slug === url.pathname.split("/").pop());
    if (product)
      body = {
        product: {
          ...product,
          shortDescription: "محصول نمونه برای بازبینی طراحی؛ فروش فعال نیست.",
          description: "این داده فقط در پیش‌نمایش محلی استفاده می‌شود.",
          metaTitle: null,
          metaDescription: null,
          specs: [],
          galleryImageIds: [],
          reviews: [],
          related: [],
          rating: { average: 0, count: 0 },
          plans: [
            {
              id: `plan-${product.id}`,
              label: "پلن نمونه",
              durationDays: 30,
              price: product.priceFrom,
              salePrice: null,
              effectivePrice: product.priceFrom,
              onSale: false,
              discountPercent: 0,
              currency: "IRR",
              availableStock: product.availableStock,
              inStock: product.inStock,
            },
          ],
        },
      };
  } else if (url.pathname === "/payments/config")
    body = { online: false, cardToCard: false, card: null };
  else if (url.pathname === "/blog") body = { posts: [] };
  else if (url.pathname === "/pages") body = { pages: [] };
  if (!body)
    return res
      .writeHead(404)
      .end(
        JSON.stringify({ error: { code: "NOT_FOUND", message: "Preview endpoint unavailable" } }),
      );
  if (supplierVariants && body.product) {
    body.product.quoteRequired = true;
    body.product.priceFrom = 0;
    body.product.plans = [
      [
        "personal-none",
        "PERSONAL",
        "ACCOUNT",
        "AUTOMATIC",
        { kind: "NONE", days: 0, coverage: "NONE" },
      ],
      [
        "personal-warranty",
        "PERSONAL",
        "ACCOUNT",
        "AUTOMATIC",
        { kind: "WARRANTED", days: 30, coverage: "FULL" },
      ],
      ["invite", "TEAM", "INVITE", "MANUAL", { kind: "NONE", days: 0, coverage: "NONE" }],
    ].map(([id, access, fulfillment, delivery, warranty]) => ({
      id,
      label: "Plus · 30 days",
      durationDays: 30,
      source: "SUPPLIER",
      quoteRequired: true,
      price: 0,
      effectivePrice: 0,
      salePrice: null,
      onSale: false,
      discountPercent: 0,
      currency: "IRR",
      inStock: true,
      availableStock: 5,
      variant: {
        plan: "PLUS",
        access,
        fulfillment,
        delivery,
        warranty,
        region: "GLOBAL",
        quota: "STANDARD",
      },
    }));
  }
  res.end(JSON.stringify(body));
});
server.listen(4401, "127.0.0.1", () => console.log("Read-only preview API: http://127.0.0.1:4401"));
const web = spawn(
  process.execPath,
  [
    "--use-system-ca",
    path.join(root, "node_modules/next/dist/bin/next"),
    "dev",
    path.join(root, "apps/web"),
    "-p",
    "3101",
    "-H",
    "127.0.0.1",
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:4401",
      API_INTERNAL_URL: "http://127.0.0.1:4401",
      WEB_BASE_URL: "http://127.0.0.1:3101",
      NODE_USE_SYSTEM_CA: "1",
    },
  },
);
console.log("Storefront preview: http://127.0.0.1:3101/fa");
function stop() {
  web.kill();
  server.close();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", () => server.close());
web.on("error", (error) => {
  console.error(error.message);
  server.close();
  process.exitCode = 1;
});
