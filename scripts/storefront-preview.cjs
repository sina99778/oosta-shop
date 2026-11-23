/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only sample catalog for reviewing the real storefront without a database.
// Never used by the production server. No authentication or purchase mutations.
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const supplierVariants = process.argv.includes("--supplier-variants");
// Opt-in design review of account/admin screens with a synthetic, read-only session.
const previewRole = process.argv.includes("--admin")
  ? "ADMIN"
  : process.argv.includes("--signed-in")
    ? "USER"
    : null;
const previewUser = previewRole && {
  id: "preview-user",
  name: previewRole === "ADMIN" ? "مدیر نمونه" : "سارا",
  email: "preview@example.invalid",
  phone: null,
  role: previewRole,
  recoveryEmailVerified: true,
};
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
const sampleProducts = [
  ["chatgpt-plus", "ChatGPT Plus", "ACCOUNT", 0, 4990000, true],
  ["claude-pro", "Claude Pro", "ACCOUNT", 0, 12900000, true],
  ["windows-11-pro", "Windows 11 Pro", "LICENSE", 1, 7950000, true],
  ["google-play", "Google Play Gift Card", "GIFTCARD", 2, 12000000, false],
];
const products = sampleProducts.map(([slug, name, type, categoryIndex, price, inStock]) => ({
  id: `preview-${slug}`,
  slug,
  name,
  type,
  category: categories[categoryIndex],
  image: null,
  hasImage: false,
  priceFrom: !supplierVariants && inStock ? price : null,
  pricePlanId: !supplierVariants && inStock ? `plan-preview-${slug}` : null,
  priceDurationDays: !supplierVariants && inStock ? 30 : null,
  quoteRequired: supplierVariants && inStock,
  availability: !inStock ? "OUT_OF_STOCK" : supplierVariants ? "SUPPLIER_STOCK" : "LOCAL_STOCK",
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
// Sample journal articles for local design review only (no real content or covers).
const samplePosts = [
  ["compare-assistants", "مقایسهٔ سه دستیار محبوب هوش مصنوعی برای کارهای روزمره", "مقایسه", 8],
  ["canva-magic", "ساخت ارائه با Canva Magic در ۱۵ دقیقه", "آموزش", 7],
  ["email-prompts", "۱۰ پرامپت آماده برای نوشتن ایمیل کاری", "پرامپت", 4],
  ["before-buying", "قبل از خرید اشتراک هوش مصنوعی چه چیزهایی را چک کنیم؟", "راهنمای خرید", 6],
].map(([slug, title, tag, readingMinutes], index) => ({
  id: `preview-post-${index + 1}`,
  slug,
  title,
  excerpt: "متن نمونه برای بازبینی طراحی مجله؛ این مقاله واقعی نیست.",
  hasCover: false,
  coverAlt: null,
  tag,
  readingMinutes,
  publishedAt: `2026-11-${String(20 - index).padStart(2, "0")}T08:00:00Z`,
  updatedAt: `2026-11-${String(20 - index).padStart(2, "0")}T08:00:00Z`,
}));
const sampleArticle = [
  "این متن فقط برای بازبینی طراحی صفحهٔ مقاله در پیش‌نمایش محلی است.",
  "",
  "## چطور آزمودیم",
  "برای هر کار یک پرامپت یکسان نوشتیم و خروجی‌ها را مقایسه کردیم.",
  "",
  "> پرامپت خوب نیمی از جواب خوب است؛ ابزار نیم دیگرش.",
  "",
  "## نوشتن و ویرایش",
  "- Claude در لحن طبیعی فارسی قوی‌تر بود.",
  "- ChatGPT در ساختاردهی سریع جلوتر بود.",
  "",
  "## جمع‌بندی و پیشنهاد",
  "برای انتخاب نهایی، کاربرد اصلی‌ات را مشخص کن.",
].join("\n");
// Synthetic orders for the signed-in design preview (fake values only).
const previewOrders = [
  ["preview-order-1", 28799630, "PAID", ["ChatGPT Plus", "Spotify", "Windows 11 Pro"], 0],
  ["preview-order-2", 15800000, "PAID", ["Claude Pro"], 11],
  ["preview-order-3", 13900000, "PAID_PENDING_FULFILLMENT", ["Cursor Pro"], 20],
  ["preview-order-4", 6900000, "PENDING", ["Canva Pro"], 34],
  ["preview-order-5", 12900000, "FAILED", ["Midjourney"], 52],
].map(([id, totalAmount, paymentStatus, items, days]) => ({
  id,
  totalAmount,
  currency: "IRR",
  paymentStatus,
  itemCount: items.length,
  firstProductName: items[0],
  createdAt: new Date(Date.now() - days * 86400000).toISOString(),
  paidAt: paymentStatus === "PAID" ? new Date(Date.now() - days * 86400000).toISOString() : null,
  items,
}));
const previewOrderDetail = (order) => ({
  id: order.id,
  totalAmount: order.totalAmount,
  currency: "IRR",
  paymentStatus: order.paymentStatus,
  paymentProvider: "zarinpal",
  paymentRefId: "PREVIEW-REF",
  createdAt: order.createdAt,
  paidAt: order.paidAt,
  receipts: [],
  cardToCard: null,
  items: order.items.map((name, index) => ({
    id: `${order.id}-item-${index + 1}`,
    product: { id: `preview-${index}`, name, slug: "chatgpt-plus", type: "ACCOUNT" },
    plan: { id: `preview-plan-${index}`, label: "یک‌ماهه", variant: null, durationDays: 30 },
    quantity: 1,
    unitPrice: Math.round(order.totalAmount / order.items.length),
    lineTotal: Math.round(order.totalAmount / order.items.length),
    credentials:
      order.paymentStatus === "PAID"
        ? [
            {
              id: `${order.id}-cred-${index + 1}`,
              type: "ACCOUNT",
              accountEmail: "sample-account@example.invalid",
              accountPassword: "sample-password",
              licenseKey: null,
              giftCardCode: null,
              deliveryInstructions: "این اطلاعات نمونه است و به هیچ حسابی تعلق ندارد.",
            },
          ]
        : [],
    renewal:
      order.paymentStatus === "PAID"
        ? { estimatedEndAt: "2026-12-09T08:00:00Z", daysRemaining: 16, planId: null }
        : null,
  })),
});
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3101");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const url = new URL(req.url, "http://127.0.0.1:4401");
  if (url.pathname === "/track") return res.writeHead(204).end();
  if (req.method !== "GET")
    return res
      .writeHead(405)
      .end(JSON.stringify({ error: { code: "PREVIEW_ONLY", message: "Read-only preview" } }));
  let body;
  // The preview has no accounts: answer as signed out so guest flows render.
  if (url.pathname === "/auth/me" && previewUser) body = { user: previewUser };
  else if (url.pathname === "/auth/me")
    return res
      .writeHead(401)
      .end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Signed out" } }));
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
    if (sort === "price_asc")
      selected.sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
    if (sort === "price_desc")
      selected.sort((a, b) => (b.priceFrom ?? -Infinity) - (a.priceFrom ?? -Infinity));
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
              price: sampleProducts.find(([slug]) => slug === product.slug)[4],
              salePrice: null,
              effectivePrice: sampleProducts.find(([slug]) => slug === product.slug)[4],
              onSale: false,
              discountPercent: 0,
              currency: "IRR",
              availableStock: product.availableStock,
              inStock: product.inStock,
            },
          ],
        },
      };
  } else if (url.pathname === "/cart/guest-preview") {
    // Read-only prices for guest-cart plan IDs saved in this browser (sample data only).
    const ids = (url.searchParams.get("planIds") || "").split(",").slice(0, 10);
    body = {
      items: products
        .filter((product) => ids.includes(`plan-${product.id}`))
        .map((product) => ({
          planId: `plan-${product.id}`,
          product: product.name,
          slug: product.slug,
          label: "پلن نمونه",
          availability: product.inStock ? "LOCAL_STOCK" : "OUT_OF_STOCK",
          currency: "IRR",
          amount: sampleProducts.find(([slug]) => slug === product.slug)[4],
          indicativePrice: null,
        })),
    };
  } else if (url.pathname === "/payments/config")
    body = { online: false, cardToCard: false, card: null };
  else if (url.pathname === "/blog") {
    const tag = url.searchParams.get("tag");
    body = {
      posts: samplePosts.filter((post) => !tag || post.tag === tag),
      tags: [...new Set(samplePosts.map((post) => post.tag))].map((name) => ({
        tag: name,
        count: samplePosts.filter((post) => post.tag === name).length,
      })),
    };
  } else if (url.pathname.startsWith("/blog/")) {
    const post = samplePosts.find((item) => item.slug === url.pathname.split("/").pop());
    if (post)
      body = {
        post: {
          ...post,
          content: sampleArticle,
          related: samplePosts.filter((item) => item.id !== post.id).slice(0, 3),
          products: [
            {
              id: "preview-chatgpt-plus",
              slug: "chatgpt-plus",
              name: "ChatGPT Plus",
              type: "AI_ACCOUNT",
            },
          ],
        },
      };
  } else if (previewUser && url.pathname === "/cart/count") body = { count: 2 };
  else if (previewUser && url.pathname === "/auth/notifications/count") body = { count: 2 };
  else if (previewUser && url.pathname === "/auth/inbox") body = { welcomeGift: null };
  else if (previewRole === "ADMIN" && url.pathname === "/admin/suppliers/manual/pending")
    body = { enabled: true, count: 3 };
  else if (previewRole === "ADMIN" && url.pathname === "/admin/stats")
    body = {
      currency: "IRR",
      revenueTotal: 9100000000,
      revenue30: 4820000000,
      paidOrders: 312,
      totalOrders: 340,
      pendingReview: 4,
      customers: 1284,
      salesByDay: [14, 18, 12, 13, 9, 10, 8].map((count, index) => ({
        day: new Date(Date.now() - (6 - index) * 86400000).toISOString().slice(0, 10),
        count,
        revenue: count * 140000000,
      })),
      topProducts: [
        ["ChatGPT Plus", 128],
        ["Claude Pro", 94],
        ["Canva Pro", 61],
        ["CapCut Pro", 42],
      ].map(([name, unitsSold], index) => ({ id: `preview-top-${index}`, name, unitsSold })),
      lowStock: [
        ["Spotify Premium · ۳ ماهه", 2],
        ["Windows 11 Pro", 5],
        ["NordVPN · سالانه", 7],
      ].map(([name, stock], index) => ({ id: `preview-low-${index}`, name, stock })),
      recentOrders: previewOrders.slice(0, 4).map((order, index) => ({
        id: order.id,
        totalAmount: order.totalAmount,
        currency: "IRR",
        paymentStatus: order.paymentStatus,
        itemCount: order.itemCount,
        createdAt: order.createdAt,
        user: { name: ["سارا م.", "علی ک.", "مهسا ر.", "رضا ا."][index], email: null, phone: null },
      })),
    };
  else if (previewUser && url.pathname === "/auth/notifications")
    body = {
      unreadCount: 2,
      notifications: [
        ["کد تأیید ورود Claude", "کد ۶ رقمی نمونه — تا ۱۰ دقیقه معتبر است.", null, 2],
        [
          "تحویل سفارش انجام شد",
          "اطلاعات ChatGPT Plus در گاوصندوق سفارش قرار گرفت.",
          null,
          60 * 24,
        ],
        [
          "پاسخ پشتیبانی",
          "پشتیبانی به تیکت «مشکل ورود» پاسخ داد.",
          "2026-11-20T10:00:00Z",
          60 * 72,
        ],
        [
          "یادآوری تمدید",
          "اشتراک Canva Pro تا ۱۶ روز دیگر تمام می‌شود.",
          "2026-11-16T10:00:00Z",
          60 * 24 * 7,
        ],
      ].map(([title, text, readAt, minutes], index) => ({
        id: `preview-notice-${index + 1}`,
        title,
        body: text,
        href: index === 2 ? "/fa/support/preview-ticket-1" : "/fa/dashboard/orders/preview-order-1",
        readAt,
        createdAt: new Date(Date.now() - minutes * 60000).toISOString(),
      })),
    };
  else if (previewUser && url.pathname === "/auth/sessions")
    body = {
      currentTracked: true,
      sessions: [
        ["Chrome", "Windows", "85.185.x.x", 0, true],
        ["Safari", "iOS", "5.122.x.x", 120, false],
        ["Firefox", "Linux", null, 60 * 24 * 5, false],
      ].map(([browser, os, ipPrefix, minutes, current], index) => ({
        id: `preview-session-${index + 1}`,
        browser,
        os,
        ipPrefix,
        createdAt: "2026-11-15T08:00:00Z",
        lastSeenAt: new Date(Date.now() - minutes * 60000).toISOString(),
        current,
      })),
    };
  else if (previewUser && url.pathname === "/orders")
    body = { orders: previewOrders.map(({ items: _items, ...order }) => order) };
  else if (previewUser && url.pathname.startsWith("/orders/")) {
    const order = previewOrders.find((item) => item.id === url.pathname.split("/").pop());
    if (order) body = { order: previewOrderDetail(order) };
  } else if (previewUser && url.pathname === "/tickets")
    body = {
      tickets: [
        ["مشکل ورود به Cursor Pro", "ANSWERED", "preview-order-3", 3],
        ["درخواست تمدید زودتر Canva", "OPEN", "preview-order-4", 1],
        ["فاکتور رسمی برای شرکت", "CLOSED", null, 4],
      ].map(([subject, status, orderId, messageCount], index) => ({
        id: `preview-ticket-${index + 1}`,
        subject,
        status,
        orderId,
        messageCount,
        lastMessage: "پیام نمونه برای بازبینی طراحی.",
        updatedAt: `2026-11-${String(22 - index * 4).padStart(2, "0")}T10:20:00Z`,
      })),
    };
  else if (previewUser && url.pathname.startsWith("/tickets/"))
    body = {
      ticket: {
        id: url.pathname.split("/").pop(),
        subject: "مشکل ورود به Cursor Pro",
        status: "ANSWERED",
        createdAt: "2026-11-22T22:14:00Z",
        updatedAt: "2026-11-23T10:20:00Z",
        order: {
          id: "preview-order-3",
          createdAt: "2026-10-25T10:00:00Z",
          totalAmount: 13900000,
          currency: "IRR",
          paymentStatus: "PAID",
        },
        messages: [
          {
            id: "preview-message-1",
            body: "سلام، بعد از ورود پیام «Plan not active» نمایش داده می‌شود. (متن نمونه)",
            isStaff: false,
            createdAt: "2026-11-22T22:14:00Z",
            attachment: { name: "screenshot-error.png", mime: "image/png", size: 215040 },
          },
          {
            id: "preview-message-2",
            body: "سلام، اشتراک روی حساب فعال شد؛ یک بار خارج و دوباره وارد شو. (متن نمونه)",
            isStaff: true,
            createdAt: "2026-11-23T10:20:00Z",
            attachment: null,
          },
        ],
      },
    };
  else if (url.pathname === "/pages") body = { pages: [] };
  if (!body) {
    if (previewUser) console.log(`[preview 404] ${req.method} ${url.pathname}${url.search}`);
    return res
      .writeHead(404)
      .end(
        JSON.stringify({ error: { code: "NOT_FOUND", message: "Preview endpoint unavailable" } }),
      );
  }
  if (body.product?.quoteRequired) {
    body.product.quoteRequired = true;
    body.product.priceFrom = null;
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
    ".",
    "-p",
    "3101",
    "-H",
    "127.0.0.1",
  ],
  {
    // next.config.ts imports local TypeScript modules, which Next resolves from the app root.
    cwd: path.join(root, "apps/web"),
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
