// In-process smoke test for the API. Uses light-my-request to inject requests
// directly into the Express handler (no network socket / no listen()), so it runs
// even where binding TCP ports is forbidden.
//
// Run: npm run smoke -w @oosta/api

import "dotenv/config";
import { inject, type Response as LightResponse } from "light-my-request";
import type { NextFunction, Request, Response } from "express";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { requireRole } from "../src/middleware/auth";
import { AppError } from "../src/utils/httpError";

const app = createApp();
// Per-actor IP, reassigned at the start of each test group so their auth rate-limit
// buckets stay independent (the limiter keys on client IP).
let ip = "127.0.0.1";

type Check = { name: string; pass: boolean; info: string };
const checks: Check[] = [];
function record(name: string, pass: boolean, info: string): void {
  checks.push({ name, pass, info });
}
function body(res: LightResponse): Record<string, unknown> {
  return JSON.parse(res.body) as Record<string, unknown>;
}
function obj(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function post(url: string, payload: unknown, token?: string): Promise<LightResponse> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return inject(app, {
    method: "POST",
    url,
    headers,
    payload: JSON.stringify(payload),
    remoteAddress: ip,
  });
}
function get(url: string, token?: string): Promise<LightResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return inject(app, { method: "GET", url, headers, remoteAddress: ip });
}
function patch(url: string, payload: unknown, token?: string): Promise<LightResponse> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return inject(app, {
    method: "PATCH",
    url,
    headers,
    payload: JSON.stringify(payload),
    remoteAddress: ip,
  });
}

async function testFoundation(): Promise<void> {
  const health = await inject(app, { method: "GET", url: "/health", remoteAddress: ip });
  record("GET /health -> 200", health.statusCode === 200, `status=${health.statusCode}`);
  record("x-powered-by removed", health.headers["x-powered-by"] === undefined, "");
  record(
    "helmet nosniff",
    health.headers["x-content-type-options"] === "nosniff",
    String(health.headers["x-content-type-options"]),
  );
  record(
    "rate-limit headers present",
    health.headers["ratelimit"] !== undefined || health.headers["ratelimit-policy"] !== undefined,
    String(health.headers["ratelimit"]),
  );

  const db = await get("/health/db");
  record(
    "GET /health/db connected",
    db.statusCode === 200 && body(db).database === "connected",
    db.body,
  );

  const nf = await get("/does-not-exist");
  const nfErr = body(nf).error as { code?: string } | undefined;
  record(
    "unknown route -> 404 NOT_FOUND",
    nf.statusCode === 404 && nfErr?.code === "NOT_FOUND",
    nf.body,
  );
}

async function testAuth(): Promise<void> {
  ip = "10.10.0.1";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");
  const email = `smoke_${suffix}@example.com`;
  const phone = `+1555${suffix}`;
  const password = "Smoke@12345";

  // Signup by email
  const signupEmail = await post("/auth/signup", { name: "Smoke Email", email, password });
  const seBody = body(signupEmail);
  const seUser = seBody.user as Record<string, unknown> | undefined;
  record(
    "signup(email) -> 201",
    signupEmail.statusCode === 201,
    `status=${signupEmail.statusCode}`,
  );
  record(
    "signup returns token",
    typeof seBody.token === "string",
    `tokenLen=${String(seBody.token).length}`,
  );
  record("signup user has id", typeof seUser?.id === "string", String(seUser?.id));
  record("signup does NOT leak passwordHash", seUser?.passwordHash === undefined, "");
  const emailToken = String(seBody.token);
  const emailUserId = String(seUser?.id);

  // Login by email
  const loginEmail = await post("/auth/login", { identifier: email, password });
  record(
    "login(email) -> 200 + token",
    loginEmail.statusCode === 200 && typeof body(loginEmail).token === "string",
    `status=${loginEmail.statusCode}`,
  );

  // Signup + login by phone
  const signupPhone = await post("/auth/signup", { name: "Smoke Phone", phone, password });
  record(
    "signup(phone) -> 201",
    signupPhone.statusCode === 201,
    `status=${signupPhone.statusCode}`,
  );
  const loginPhone = await post("/auth/login", { identifier: phone, password });
  record("login(phone) -> 200", loginPhone.statusCode === 200, `status=${loginPhone.statusCode}`);

  // /me with valid token
  const meOk = await get("/auth/me", emailToken);
  const meUser = body(meOk).user as Record<string, unknown> | undefined;
  record(
    "/me (valid token) -> 200 + same user",
    meOk.statusCode === 200 && meUser?.id === emailUserId,
    `status=${meOk.statusCode}`,
  );
  record("/me does NOT leak passwordHash", meUser?.passwordHash === undefined, "");

  // /me unauthorized cases
  const meNoToken = await get("/auth/me");
  record("/me (no token) -> 401", meNoToken.statusCode === 401, `status=${meNoToken.statusCode}`);
  const meBadToken = await get("/auth/me", "not.a.valid.token");
  record(
    "/me (bad token) -> 401",
    meBadToken.statusCode === 401,
    `status=${meBadToken.statusCode}`,
  );

  // Duplicate signup -> 409
  const dup = await post("/auth/signup", { name: "Dup", email, password });
  record("duplicate signup -> 409", dup.statusCode === 409, `status=${dup.statusCode}`);

  // Wrong password -> 401
  const wrong = await post("/auth/login", { identifier: email, password: "WrongPass123" });
  record("login wrong password -> 401", wrong.statusCode === 401, `status=${wrong.statusCode}`);

  // Validation: neither email nor phone -> 400
  const invalid = await post("/auth/signup", { name: "NoContact", password });
  const invErr = body(invalid).error as { code?: string } | undefined;
  record(
    "signup without email/phone -> 400 VALIDATION_ERROR",
    invalid.statusCode === 400 && invErr?.code === "VALIDATION_ERROR",
    invalid.body,
  );

  // Auth rate limiter trips after the limit (dedicated IP so other actors are unaffected)
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const attempt = await inject(app, {
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ identifier: "nobody@example.com", password: "x" }),
      remoteAddress: "10.99.0.1",
    });
    if (attempt.statusCode === 429) {
      limited = true;
      break;
    }
  }
  record("auth rate limiter trips (429)", limited, "");
}

function testRoleGuard(): void {
  const runGuard = (role: "USER" | "ADMIN" | undefined): unknown => {
    const guard = requireRole("ADMIN");
    const req = { user: role ? { id: "x", role } : undefined } as unknown as Request;
    const res = {} as unknown as Response;
    let captured: unknown = "NEXT_NOT_CALLED";
    const next: NextFunction = (err?: unknown) => {
      captured = err;
    };
    guard(req, res, next);
    return captured;
  };

  const userBlocked = runGuard("USER");
  record(
    "requireRole(ADMIN) blocks USER -> 403",
    userBlocked instanceof AppError && userBlocked.statusCode === 403,
    String(userBlocked),
  );
  const adminAllowed = runGuard("ADMIN");
  record("requireRole(ADMIN) allows ADMIN", adminAllowed === undefined, String(adminAllowed));
  const anonBlocked = runGuard(undefined);
  record(
    "requireRole blocks anonymous -> 401",
    anonBlocked instanceof AppError && anonBlocked.statusCode === 401,
    String(anonBlocked),
  );
}

async function testCatalog(): Promise<void> {
  const cats = await get("/categories");
  const catList = body(cats).categories as Array<Record<string, unknown>> | undefined;
  record("GET /categories -> 200", cats.statusCode === 200, `status=${cats.statusCode}`);
  record(
    "categories: 3 with productCount",
    Array.isArray(catList) && catList.length === 3 && typeof catList[0]?.productCount === "number",
    JSON.stringify(catList?.map((c) => c.slug)),
  );

  const all = await get("/products");
  const allBody = body(all) as { items?: unknown[]; pagination?: Record<string, unknown> };
  record(
    "GET /products -> total 4",
    all.statusCode === 200 && allBody.pagination?.total === 4,
    JSON.stringify(allBody.pagination),
  );

  const ai = await get("/products?category=ai-accounts");
  const aiBody = body(ai) as { pagination?: Record<string, unknown> };
  record(
    "filter category=ai-accounts -> total 2",
    aiBody.pagination?.total === 2,
    JSON.stringify(aiBody.pagination),
  );

  const asc = await get("/products?sort=price_asc&pageSize=50");
  const ascItems = (body(asc).items as Array<Record<string, unknown>>) ?? [];
  const firstPrice = Number(ascItems[0]?.priceFrom);
  const lastPrice = Number(ascItems[ascItems.length - 1]?.priceFrom);
  record(
    "sort=price_asc ascending",
    ascItems.length > 1 && firstPrice <= lastPrice,
    `first=${firstPrice} last=${lastPrice}`,
  );

  const paged = await get("/products?pageSize=2&page=1");
  const pagedBody = body(paged) as { items?: unknown[]; pagination?: Record<string, unknown> };
  record(
    "pagination pageSize=2 -> 2 items / totalPages 2",
    pagedBody.items?.length === 2 && pagedBody.pagination?.totalPages === 2,
    JSON.stringify(pagedBody.pagination),
  );

  const best = await get("/products/bestselling?limit=2");
  const bestList = body(best).products as unknown[] | undefined;
  record(
    "GET /products/bestselling -> 1..2 items",
    best.statusCode === 200 &&
      Array.isArray(bestList) &&
      bestList.length > 0 &&
      bestList.length <= 2,
    `len=${bestList?.length}`,
  );

  const detail = await get("/products/chatgpt-plus-account");
  const product = body(detail).product as Record<string, unknown> | undefined;
  const plans = product?.plans as Array<Record<string, unknown>> | undefined;
  record(
    "GET /products/:slug -> 200 with 2 plans",
    detail.statusCode === 200 && plans?.length === 2,
    `status=${detail.statusCode} plans=${plans?.length}`,
  );
  record(
    "plan exposes live stock (availableStock>0 & inStock)",
    Boolean(plans?.[0] && Number(plans[0].availableStock) > 0 && plans[0].inStock === true),
    JSON.stringify(plans?.map((p) => ({ label: p.label, stock: p.availableStock }))),
  );
  record(
    "product priceFrom = 350000",
    Number(product?.priceFrom) === 350000,
    String(product?.priceFrom),
  );

  const missing = await get("/products/nope-not-real");
  record("unknown product -> 404", missing.statusCode === 404, `status=${missing.statusCode}`);
}

async function testOrders(): Promise<void> {
  ip = "10.10.0.2";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");

  // Buyer
  const signup = await post("/auth/signup", {
    name: "Order Tester",
    email: `ord_${suffix}@example.com`,
    password: "Order@12345",
  });
  const token = String(body(signup).token);
  const userId = String(obj(body(signup).user).id);

  // Isolated catalog data — 1 unit per plan keeps concurrent claims single-row & deterministic.
  const category = await prisma.category.findUnique({ where: { slug: "ai-accounts" } });
  const product = await prisma.product.create({
    data: {
      name: `Smoke Product ${suffix}`,
      slug: `smoke-product-${suffix}`,
      description: "Ephemeral product for delivery-engine tests.",
      type: "ACCOUNT",
      categoryId: category!.id,
    },
  });
  const mkPlan = (label: string, price: number) =>
    prisma.productPlan.create({ data: { productId: product.id, label, durationDays: 30, price } });
  const planA = await mkPlan("A", 100000);
  const planB = await mkPlan("B", 150000);
  const planC = await mkPlan("C", 120000);
  const mkItem = (planId: string) => ({
    productId: product.id,
    planId,
    type: "ACCOUNT" as const,
    accountEmail: `acct_${planId}@smoke.local`,
    accountPassword: `pw_${planId}`,
  });
  await prisma.inventoryItem.createMany({
    data: [mkItem(planA.id), mkItem(planB.id), mkItem(planC.id)],
  });

  const soldCount = (planId: string) =>
    prisma.inventoryItem.count({ where: { planId, status: "SOLD" } });
  const availCount = (planId: string) =>
    prisma.inventoryItem.count({ where: { planId, status: "AVAILABLE" } });

  // Auth required
  const noAuth = await post("/orders", { items: [{ planId: planA.id, quantity: 1 }] });
  record(
    "POST /orders without token -> 401",
    noAuth.statusCode === 401,
    `status=${noAuth.statusCode}`,
  );

  // Happy path
  const create1 = await post("/orders", { items: [{ planId: planA.id, quantity: 1 }] }, token);
  const payment1 = obj(body(create1).payment);
  record("create order -> 201", create1.statusCode === 201, `status=${create1.statusCode}`);
  record(
    "order returns authority + redirectUrl",
    typeof payment1.authority === "string" && typeof payment1.redirectUrl === "string",
    JSON.stringify(payment1),
  );
  const authority1 = String(payment1.authority);
  const orderId1 = String(obj(body(create1).order).id);

  const verify1 = await post("/payments/verify", { authority: authority1, status: "OK" });
  record(
    "verify -> paid",
    verify1.statusCode === 200 && body(verify1).status === "paid",
    `status=${verify1.statusCode}`,
  );

  const detail1 = await get(`/orders/${orderId1}`, token);
  const ord1 = obj(body(detail1).order);
  const items1 = (ord1.items as Array<Record<string, unknown>>) ?? [];
  const creds1 = (items1[0]?.credentials as Array<Record<string, unknown>>) ?? [];
  record("order detail PAID", ord1.paymentStatus === "PAID", String(ord1.paymentStatus));
  record(
    "vault: credential delivered (accountEmail)",
    creds1.length === 1 && typeof creds1[0]?.accountEmail === "string",
    JSON.stringify(creds1.map((c) => c.type)),
  );
  record(
    "planA: 1 sold / 0 available",
    (await soldCount(planA.id)) === 1 && (await availCount(planA.id)) === 0,
    `sold=${await soldCount(planA.id)}`,
  );

  // Idempotent re-verify
  const reverify = await post("/payments/verify", { authority: authority1, status: "OK" });
  record(
    "re-verify idempotent (paid, no extra delivery)",
    reverify.statusCode === 200 &&
      body(reverify).status === "paid" &&
      (await soldCount(planA.id)) === 1,
    `sold=${await soldCount(planA.id)}`,
  );

  // Cancelled payment (Status != OK) — no delivery
  const createC = await post("/orders", { items: [{ planId: planC.id, quantity: 1 }] }, token);
  const authC = String(obj(body(createC).payment).authority);
  const verifyC = await post("/payments/verify", { authority: authC, status: "NOK" });
  record(
    "verify NOK -> failed, no delivery",
    verifyC.statusCode === 200 &&
      body(verifyC).status === "failed" &&
      (await soldCount(planC.id)) === 0,
    `sold=${await soldCount(planC.id)}`,
  );

  // Oversell: two concurrent paid orders for the single planB unit
  const createB1 = await post("/orders", { items: [{ planId: planB.id, quantity: 1 }] }, token);
  const createB2 = await post("/orders", { items: [{ planId: planB.id, quantity: 1 }] }, token);
  const authB1 = String(obj(body(createB1).payment).authority);
  const authB2 = String(obj(body(createB2).payment).authority);
  const [vB1, vB2] = await Promise.all([
    post("/payments/verify", { authority: authB1, status: "OK" }),
    post("/payments/verify", { authority: authB2, status: "OK" }),
  ]);
  const paidCount = [vB1, vB2].filter(
    (v) => v.statusCode === 200 && body(v).status === "paid",
  ).length;
  const oosCount = [vB1, vB2].filter((v) => v.statusCode === 409).length;
  record(
    "oversell: exactly one paid",
    paidCount === 1,
    `codes=${vB1.statusCode},${vB2.statusCode}`,
  );
  record(
    "oversell: exactly one 409 out-of-stock",
    oosCount === 1,
    `codes=${vB1.statusCode},${vB2.statusCode}`,
  );
  record(
    "no oversell: planB 1 sold / 0 available",
    (await soldCount(planB.id)) === 1 && (await availCount(planB.id)) === 0,
    `sold=${await soldCount(planB.id)} avail=${await availCount(planB.id)}`,
  );

  // Creation-time stock pre-check (planB now depleted)
  const createB3 = await post("/orders", { items: [{ planId: planB.id, quantity: 1 }] }, token);
  record(
    "order creation out-of-stock -> 409",
    createB3.statusCode === 409,
    `status=${createB3.statusCode}`,
  );

  // List my orders
  const list = await get("/orders", token);
  const myOrders = body(list).orders as unknown[] | undefined;
  record(
    "GET /orders lists my orders",
    list.statusCode === 200 && Array.isArray(myOrders) && myOrders.length >= 4,
    `count=${myOrders?.length}`,
  );

  // Cleanup (FK-safe)
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { productId: product.id } });
  await prisma.productPlan.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.user.delete({ where: { id: userId } });
}

async function testAdmin(): Promise<void> {
  ip = "10.10.0.3";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");

  // Seeded admin
  const adminLogin = await post("/auth/login", {
    identifier: "admin@oosta.local",
    password: "Admin@12345",
  });
  record("admin login -> 200", adminLogin.statusCode === 200, `status=${adminLogin.statusCode}`);
  const adminToken = String(body(adminLogin).token);

  // Plain user (for authz)
  const userSignup = await post("/auth/signup", {
    name: "Plain User",
    email: `plain_${suffix}@example.com`,
    password: "Plain@12345",
  });
  const userToken = String(body(userSignup).token);
  const userId = String(obj(body(userSignup).user).id);

  // Authorization
  const noAuth = await get("/admin/products");
  record("admin route no token -> 401", noAuth.statusCode === 401, `status=${noAuth.statusCode}`);
  const asUser = await get("/admin/products", userToken);
  record("admin route as USER -> 403", asUser.statusCode === 403, `status=${asUser.statusCode}`);

  // Category
  const catRes = await post(
    "/admin/categories",
    { name: `Smoke Cat ${suffix}`, slug: `smoke-cat-${suffix}` },
    adminToken,
  );
  const categoryId = String(obj(body(catRes).category).id);
  record("create category -> 201", catRes.statusCode === 201, `status=${catRes.statusCode}`);

  // Product (LICENSE)
  const slug = `smoke-admin-${suffix}`;
  const prodRes = await post(
    "/admin/products",
    {
      name: `Smoke Admin ${suffix}`,
      slug,
      description: "Admin-created product.",
      type: "LICENSE",
      categoryId,
    },
    adminToken,
  );
  const productId = String(obj(body(prodRes).product).id);
  record("create product -> 201", prodRes.statusCode === 201, `status=${prodRes.statusCode}`);

  // Plan
  const planRes = await post(
    `/admin/products/${productId}/plans`,
    { label: "Lifetime", price: 500000 },
    adminToken,
  );
  const planId = String(obj(body(planRes).plan).id);
  record("create plan -> 201", planRes.statusCode === 201, `status=${planRes.statusCode}`);

  // Bulk import (LICENSE -> licenseKey)
  const bulkRes = await post(
    "/admin/inventory/bulk",
    {
      planId,
      items: [
        { licenseKey: `KEY-${suffix}-1` },
        { licenseKey: `KEY-${suffix}-2` },
        { licenseKey: `KEY-${suffix}-3` },
      ],
    },
    adminToken,
  );
  record(
    "bulk import -> created 3",
    bulkRes.statusCode === 201 && body(bulkRes).created === 3,
    `status=${bulkRes.statusCode}`,
  );

  // Bulk import with wrong credential type -> 400
  const badBulk = await post(
    "/admin/inventory/bulk",
    { planId, items: [{ accountEmail: "x@y.com", accountPassword: "p" }] },
    adminToken,
  );
  record(
    "bulk import wrong type -> 400",
    badBulk.statusCode === 400,
    `status=${badBulk.statusCode}`,
  );

  // List inventory
  const invList = await get(`/admin/inventory?planId=${planId}&status=AVAILABLE`, adminToken);
  const invBody = body(invList) as { pagination?: Record<string, unknown> };
  record(
    "list inventory -> total 3",
    invList.statusCode === 200 && invBody.pagination?.total === 3,
    JSON.stringify(invBody.pagination),
  );

  // Public catalog reflects the new product + live stock
  const publicDetail = await get(`/products/${slug}`);
  const pd = obj(body(publicDetail).product);
  const pdPlans = (pd.plans as Array<Record<string, unknown>>) ?? [];
  record(
    "public catalog shows new product (stock 3)",
    publicDetail.statusCode === 200 && Number(pdPlans[0]?.availableStock) === 3,
    `status=${publicDetail.statusCode}`,
  );
  record("product detail exposes hasImage=false", pd.hasImage === false, String(pd.hasImage));

  // No image uploaded yet -> image endpoint 404
  const noImg = await get(`/products/${productId}/image`);
  record("product image (none) -> 404", noImg.statusCode === 404, `status=${noImg.statusCode}`);

  // Deactivate -> disappears from public catalog
  const deact = await patch(`/admin/products/${productId}`, { isActive: false }, adminToken);
  record(
    "update product isActive=false -> 200",
    deact.statusCode === 200,
    `status=${deact.statusCode}`,
  );
  const publicAfter = await get(`/products/${slug}`);
  record(
    "inactive product -> 404 on public catalog",
    publicAfter.statusCode === 404,
    `status=${publicAfter.statusCode}`,
  );

  // Orders overview
  const overview = await get("/admin/orders", adminToken);
  record(
    "admin orders overview -> 200",
    overview.statusCode === 200 && Array.isArray((body(overview) as { items?: unknown[] }).items),
    `status=${overview.statusCode}`,
  );

  // AI SEO assistant status (disabled in tests — no GEMINI_API_KEY)
  const aiStatus = await get("/admin/ai/status", adminToken);
  record(
    "admin ai status -> 200 enabled=false",
    aiStatus.statusCode === 200 && body(aiStatus).enabled === false,
    `status=${aiStatus.statusCode}`,
  );
  const aiGen = await post("/admin/seo/generate", { name: "Test product" }, adminToken);
  record("seo generate without key -> 400", aiGen.statusCode === 400, `status=${aiGen.statusCode}`);

  // Sales dashboard stats
  const statsRes = await get("/admin/stats", adminToken);
  const statsBody = body(statsRes);
  record(
    "admin stats -> 200 with metrics",
    statsRes.statusCode === 200 &&
      typeof statsBody.revenueTotal === "number" &&
      Array.isArray(statsBody.salesByDay) &&
      Array.isArray(statsBody.topProducts),
    `status=${statsRes.statusCode}`,
  );

  // Cleanup
  await prisma.inventoryItem.deleteMany({ where: { productId } });
  await prisma.productPlan.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function testCardToCard(): Promise<void> {
  ip = "10.10.0.5";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");

  const signup = await post("/auth/signup", {
    name: "C2C Tester",
    email: `c2c_${suffix}@example.com`,
    password: "C2c@12345",
  });
  const token = String(body(signup).token);
  const userId = String(obj(body(signup).user).id);

  // Public payment config (card-to-card disabled by default in tests)
  const cfg = await get("/payments/config");
  const cfgBody = body(cfg);
  record("GET /payments/config -> 200", cfg.statusCode === 200, `status=${cfg.statusCode}`);
  record(
    "payment-config: online true + cardToCard boolean",
    cfgBody.online === true && typeof cfgBody.cardToCard === "boolean",
    JSON.stringify(cfgBody),
  );

  // Product with one unit so an order can be created
  const category = await prisma.category.findUnique({ where: { slug: "ai-accounts" } });
  const product = await prisma.product.create({
    data: {
      name: `C2C ${suffix}`,
      slug: `c2c-${suffix}`,
      description: "Card-to-card test product.",
      type: "ACCOUNT",
      categoryId: category!.id,
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "P", price: 100000 },
  });
  await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      planId: plan.id,
      type: "ACCOUNT",
      accountEmail: `c_${suffix}@s.local`,
      accountPassword: "p",
    },
  });

  // Card-to-card disabled -> 400 (guarded)
  const disabled = await post(
    "/orders",
    { items: [{ planId: plan.id, quantity: 1 }], method: "card_to_card" },
    token,
  );
  record(
    "card_to_card while disabled -> 400",
    disabled.statusCode === 400,
    `status=${disabled.statusCode}`,
  );

  // Online order, then receipt upload with no file -> 400 (route is wired + validated)
  const online = await post(
    "/orders",
    { items: [{ planId: plan.id, quantity: 1 }], method: "online" },
    token,
  );
  const orderId = String(obj(body(online).order).id);
  const noFile = await post(`/orders/${orderId}/receipt`, { reference: "x" }, token);
  record(
    "receipt upload without a file -> 400",
    noFile.statusCode === 400,
    `status=${noFile.statusCode}`,
  );

  // Admin receipts queue + history
  const adminLogin = await post("/auth/login", {
    identifier: "admin@oosta.local",
    password: "Admin@12345",
  });
  const adminToken = String(body(adminLogin).token);
  const rec = await get("/admin/receipts", adminToken);
  const recBody = body(rec) as { items?: unknown[]; pendingCount?: unknown };
  record(
    "GET /admin/receipts -> 200 items[] + pendingCount",
    rec.statusCode === 200 &&
      Array.isArray(recBody.items) &&
      typeof recBody.pendingCount === "number",
    `status=${rec.statusCode}`,
  );
  const recPending = await get("/admin/receipts?status=PENDING", adminToken);
  record(
    "GET /admin/receipts?status=PENDING -> 200",
    recPending.statusCode === 200,
    `status=${recPending.statusCode}`,
  );
  const recBad = await get("/admin/receipts?status=BOGUS", adminToken);
  record(
    "GET /admin/receipts bad status -> 400",
    recBad.statusCode === 400,
    `status=${recBad.statusCode}`,
  );
  const recNoAuth = await get("/admin/receipts");
  record(
    "GET /admin/receipts no token -> 401",
    recNoAuth.statusCode === 401,
    `status=${recNoAuth.statusCode}`,
  );

  // Cleanup
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { productId: product.id } });
  await prisma.productPlan.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.user.delete({ where: { id: userId } });
}

async function testRichness(): Promise<void> {
  ip = "10.10.0.6";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");

  const adminToken = String(
    body(await post("/auth/login", { identifier: "admin@oosta.local", password: "Admin@12345" }))
      .token,
  );
  const buyer = await post("/auth/signup", {
    name: "Rich Buyer",
    email: `rich_${suffix}@example.com`,
    password: "Rich@12345",
  });
  const buyerToken = String(body(buyer).token);
  const buyerId = String(obj(body(buyer).user).id);

  const feat = await get("/products?featured=true");
  record(
    "GET /products?featured=true -> 200",
    feat.statusCode === 200,
    `status=${feat.statusCode}`,
  );
  const gal404 = await get(`/product-images/nope_${suffix}`);
  record("gallery image bad id -> 404", gal404.statusCode === 404, `status=${gal404.statusCode}`);

  const category = await prisma.category.findUnique({ where: { slug: "ai-accounts" } });
  const product = await prisma.product.create({
    data: {
      name: `Rich ${suffix}`,
      slug: `rich-${suffix}`,
      description: "Richness test product.",
      type: "ACCOUNT",
      categoryId: category!.id,
      isFeatured: true,
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "P", price: 200000 },
  });
  await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      planId: plan.id,
      type: "ACCOUNT",
      accountEmail: `r_${suffix}@s.local`,
      accountPassword: "p",
    },
  });

  // Sale price via admin -> reflected in catalog + charged on order
  const setSale = await patch(`/admin/plans/${plan.id}`, { salePrice: 150000 }, adminToken);
  record("admin set salePrice -> 200", setSale.statusCode === 200, `status=${setSale.statusCode}`);
  const detail = obj(body(await get(`/products/rich-${suffix}`)).product);
  const dplan = (detail.plans as Array<Record<string, unknown>>)[0];
  record(
    "detail plan onSale + effective=150000 + 25% off",
    dplan.onSale === true && dplan.effectivePrice === 150000 && dplan.discountPercent === 25,
    JSON.stringify({ eff: dplan.effectivePrice, off: dplan.discountPercent }),
  );
  record("detail isFeatured true", detail.isFeatured === true, String(detail.isFeatured));

  const order = obj(
    body(await post("/orders", { items: [{ planId: plan.id, quantity: 1 }] }, buyerToken)).order,
  );
  record(
    "order total uses sale price (150000)",
    Number(order.totalAmount) === 150000,
    String(order.totalAmount),
  );

  // Reviews: submit -> moderate -> reflected in rating
  const sub = await post(
    `/products/${product.id}/reviews`,
    { rating: 5, comment: "great" },
    buyerToken,
  );
  record(
    "submit review -> 201 PENDING",
    sub.statusCode === 201 && body(sub).status === "PENDING",
    `status=${sub.statusCode}`,
  );
  const subNoAuth = await post(`/products/${product.id}/reviews`, { rating: 5 });
  record(
    "review submit no auth -> 401",
    subNoAuth.statusCode === 401,
    `status=${subNoAuth.statusCode}`,
  );

  const adminReviews = body(await get("/admin/reviews?status=PENDING", adminToken)) as {
    items?: Array<Record<string, unknown>>;
  };
  const mine = (adminReviews.items ?? []).find(
    (r) => (r.product as { slug?: string } | undefined)?.slug === `rich-${suffix}`,
  );
  record("admin reviews queue contains it", Boolean(mine), "");
  const approve = await post(`/admin/reviews/${String(mine?.id)}/approve`, {}, adminToken);
  record("approve review -> 200", approve.statusCode === 200, `status=${approve.statusCode}`);

  const detail2 = obj(body(await get(`/products/rich-${suffix}`)).product);
  const rating = obj(detail2.rating);
  record(
    "approved review reflected in rating (count1 avg5)",
    Number(rating.count) === 1 && Number(rating.average) === 5,
    JSON.stringify(rating),
  );
  record(
    "detail exposes related[] array",
    Array.isArray(detail2.related),
    `len=${(detail2.related as unknown[])?.length}`,
  );

  // Cleanup
  await prisma.review.deleteMany({ where: { productId: product.id } });
  await prisma.order.deleteMany({ where: { userId: buyerId } });
  await prisma.inventoryItem.deleteMany({ where: { productId: product.id } });
  await prisma.productPlan.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.user.delete({ where: { id: buyerId } });
}

async function testBlog(): Promise<void> {
  ip = "10.10.0.9";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");
  const slug = `how-to-${suffix}`;
  const adminToken = String(
    body(await post("/auth/login", { identifier: "admin@oosta.local", password: "Admin@12345" }))
      .token,
  );

  // Create as DRAFT
  const create = await post(
    "/admin/blog",
    { title: "How to buy", slug, content: "# Guide\n\nSome **content**.", status: "DRAFT" },
    adminToken,
  );
  record("create blog post -> 201", create.statusCode === 201, `status=${create.statusCode}`);
  const id = String(body(create).id);

  // Draft is NOT public
  const pubListBefore = body(await get("/blog")).posts as Array<{ slug: string }> | undefined;
  record(
    "draft not in public list",
    Array.isArray(pubListBefore) && !pubListBefore.some((p) => p.slug === slug),
    "",
  );
  record("public draft slug -> 404", (await get(`/blog/${slug}`)).statusCode === 404, "");

  // Publish
  const pub = await patch(`/admin/blog/${id}`, { status: "PUBLISHED" }, adminToken);
  record(
    "publish post -> PUBLISHED",
    pub.statusCode === 200 && obj(body(pub).post).status === "PUBLISHED",
    `status=${pub.statusCode}`,
  );

  // Now public
  const detail = await get(`/blog/${slug}`);
  record(
    "public published post -> 200 with content",
    detail.statusCode === 200 && typeof obj(body(detail).post).content === "string",
    `status=${detail.statusCode}`,
  );
  const pubList = body(await get("/blog")).posts as Array<{ slug: string }> | undefined;
  record(
    "published in public list",
    (pubList ?? []).some((p) => p.slug === slug),
    "",
  );

  // Media upload (multipart) + serve
  const boundary = "----blog" + suffix;
  const CRLF = "\r\n";
  const bytes = Buffer.from("FAKE-PNG-BLOG-MEDIA");
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="image"; filename="m.png"${CRLF}Content-Type: image/png${CRLF}${CRLF}`,
      "utf8",
    ),
    bytes,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf8"),
  ]);
  const upload = await inject(app, {
    method: "POST",
    url: "/admin/blog/media",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
    remoteAddress: ip,
  });
  const mediaId = String(body(upload).id);
  record(
    "blog media upload -> 201 + url",
    upload.statusCode === 201 && typeof body(upload).url === "string",
    `status=${upload.statusCode}`,
  );
  const mediaServe = await get(`/blog-media/${mediaId}`);
  record(
    "blog media serves png bytes",
    mediaServe.statusCode === 200 && Buffer.from(mediaServe.rawPayload).equals(bytes),
    `status=${mediaServe.statusCode}`,
  );

  // Admin requires auth
  record("admin blog list no token -> 401", (await get("/admin/blog")).statusCode === 401, "");

  // Cleanup
  await prisma.blogMedia.deleteMany({ where: { id: mediaId } });
  await prisma.blogPost.deleteMany({ where: { id } });
}

async function testApiKeys(): Promise<void> {
  ip = "10.10.0.8";
  const adminToken = String(
    body(await post("/auth/login", { identifier: "admin@oosta.local", password: "Admin@12345" }))
      .token,
  );

  // Create a key
  const created = await post("/admin/api-keys", { name: "Smoke Key" }, adminToken);
  const createdBody = body(created);
  const rawKey = String(createdBody.key);
  record(
    "create api key -> 201 + raw key",
    created.statusCode === 201 && rawKey.startsWith("oosta_sk_"),
    `status=${created.statusCode}`,
  );

  // Use the key via X-API-Key to reach an admin endpoint
  const viaHeader = await inject(app, {
    method: "GET",
    url: "/admin/products",
    headers: { "x-api-key": rawKey },
    remoteAddress: ip,
  });
  record(
    "api key (X-API-Key) reaches admin -> 200",
    viaHeader.statusCode === 200,
    `status=${viaHeader.statusCode}`,
  );

  // Use the key via Authorization: Bearer
  const viaBearer = await inject(app, {
    method: "GET",
    url: "/admin/stats",
    headers: { authorization: `Bearer ${rawKey}` },
    remoteAddress: ip,
  });
  record(
    "api key (Bearer) reaches admin -> 200",
    viaBearer.statusCode === 200,
    `status=${viaBearer.statusCode}`,
  );

  // Invalid key -> 401
  const bad = await inject(app, {
    method: "GET",
    url: "/admin/products",
    headers: { "x-api-key": "oosta_sk_invalidkey" },
    remoteAddress: ip,
  });
  record("invalid api key -> 401", bad.statusCode === 401, `status=${bad.statusCode}`);

  // List (no raw secret leaked)
  const list = body(await get("/admin/api-keys", adminToken)) as {
    keys?: Array<Record<string, unknown>>;
  };
  const mine = (list.keys ?? []).find((k) => k.name === "Smoke Key");
  record(
    "list api keys (no secret)",
    Boolean(mine) && mine?.key === undefined && mine?.keyHash === undefined,
    "",
  );

  // Revoke -> key stops working
  const id = String(createdBody.id);
  const del = await inject(app, {
    method: "DELETE",
    url: `/admin/api-keys/${id}`,
    headers: { authorization: `Bearer ${adminToken}` },
    remoteAddress: ip,
  });
  record("revoke api key -> 200", del.statusCode === 200, `status=${del.statusCode}`);
  const afterRevoke = await inject(app, {
    method: "GET",
    url: "/admin/products",
    headers: { "x-api-key": rawKey },
    remoteAddress: ip,
  });
  record(
    "revoked api key -> 401",
    afterRevoke.statusCode === 401,
    `status=${afterRevoke.statusCode}`,
  );
}

async function testPagesAndSettings(): Promise<void> {
  ip = "10.10.0.6";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");
  const slug = `about-${suffix}`;
  const adminToken = String(
    body(await post("/auth/login", { identifier: "admin@oosta.local", password: "Admin@12345" }))
      .token,
  );

  // ---- CMS pages ----
  const create = await post(
    "/admin/pages",
    { title: "About us", slug, content: "# Hello\n\nWe sell **digital** goods." },
    adminToken,
  );
  record("create page -> 201", create.statusCode === 201, `status=${create.statusCode}`);
  const pageId = String(body(create).id);

  const pub = await get(`/pages/${slug}`);
  record(
    "public page by slug -> 200 with content",
    pub.statusCode === 200 && typeof obj(body(pub).page).content === "string",
    `status=${pub.statusCode}`,
  );

  const draft = await patch(`/admin/pages/${pageId}`, { status: "DRAFT" }, adminToken);
  record(
    "unpublish page -> DRAFT",
    draft.statusCode === 200 && obj(body(draft).page).status === "DRAFT",
    `status=${draft.statusCode}`,
  );
  record("draft page -> public 404", (await get(`/pages/${slug}`)).statusCode === 404, "");
  record("admin pages no token -> 401", (await get("/admin/pages")).statusCode === 401, "");

  const delPage = await inject(app, {
    method: "DELETE",
    url: `/admin/pages/${pageId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    remoteAddress: ip,
  });
  record("delete page -> 200", delPage.statusCode === 200, `status=${delPage.statusCode}`);

  // ---- Site settings ----
  const patched = await patch(
    "/admin/settings",
    { themePrimary: "#7c3aed", heroTitleFa: `تست ${suffix}` },
    adminToken,
  );
  record(
    "patch settings -> stored",
    patched.statusCode === 200 && obj(body(patched).settings).themePrimary === "#7c3aed",
    `status=${patched.statusCode}`,
  );
  const pubSettings = await get("/site-settings");
  record(
    "public settings expose override",
    pubSettings.statusCode === 200 && obj(body(pubSettings).settings).themePrimary === "#7c3aed",
    `status=${pubSettings.statusCode}`,
  );
  const badColor = await patch("/admin/settings", { themePrimary: "red" }, adminToken);
  record("invalid hex color -> 400", badColor.statusCode === 400, `status=${badColor.statusCode}`);
  // Clear via "" (the AI-agent form) and null (the REST form) — both must work.
  const cleared = await patch(
    "/admin/settings",
    { themePrimary: "", heroTitleFa: null },
    adminToken,
  );
  record(
    "clear settings -> override removed",
    cleared.statusCode === 200 && obj(body(cleared).settings).themePrimary === undefined,
    `status=${cleared.statusCode}`,
  );
  record(
    "patch settings no token -> 401",
    (await patch("/admin/settings", { themePrimary: "#000000" })).statusCode === 401,
    "",
  );

  // ---- Visit tracking ----
  const before = await prisma.visit.count();
  const track = await inject(app, {
    method: "POST",
    url: "/track",
    headers: {
      "content-type": "application/json",
      "x-country-code": "ir",
      "user-agent": "Mozilla/5.0 (smoke test)",
      "ar-real-ip": "5.5.5.5",
    },
    payload: JSON.stringify({ path: `/fa/products?x=1#y` }),
    remoteAddress: ip,
  });
  const visits = await prisma.visit.findMany({ orderBy: { createdAt: "desc" }, take: 1 });
  record(
    "track -> 204, country+clean path stored",
    track.statusCode === 204 &&
      (await prisma.visit.count()) === before + 1 &&
      visits[0]?.country === "IR" &&
      visits[0]?.path === "/fa/products",
    `status=${track.statusCode} country=${visits[0]?.country} path=${visits[0]?.path}`,
  );
  const trackBot = await inject(app, {
    method: "POST",
    url: "/track",
    headers: { "content-type": "application/json", "user-agent": "Googlebot/2.1" },
    payload: JSON.stringify({ path: "/fa" }),
    remoteAddress: ip,
  });
  record(
    "track ignores bots",
    trackBot.statusCode === 204 && (await prisma.visit.count()) === before + 1,
    "",
  );
  await prisma.visit.deleteMany({ where: { id: visits[0]?.id ?? "" } });

  // ---- Enamad badge upload / serve / delete ----
  const eBoundary = "----enamad" + suffix;
  const CRLF2 = "\r\n";
  const eBytes = Buffer.from("FAKE-ENAMAD-PNG");
  const ePayload = Buffer.concat([
    Buffer.from(
      `--${eBoundary}${CRLF2}Content-Disposition: form-data; name="image"; filename="e.png"${CRLF2}Content-Type: image/png${CRLF2}${CRLF2}`,
      "utf8",
    ),
    eBytes,
    Buffer.from(`${CRLF2}--${eBoundary}--${CRLF2}`, "utf8"),
  ]);
  const eUp = await inject(app, {
    method: "POST",
    url: "/admin/settings/enamad",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": `multipart/form-data; boundary=${eBoundary}`,
    },
    payload: ePayload,
    remoteAddress: ip,
  });
  const eServe = await get("/site-assets/enamad");
  const eFlag = body(await get("/site-settings")).enamadBadge;
  record(
    "enamad upload -> served publicly + flag true",
    eUp.statusCode === 200 &&
      eServe.statusCode === 200 &&
      Buffer.from(eServe.rawPayload).equals(eBytes) &&
      eFlag === true,
    `up=${eUp.statusCode} serve=${eServe.statusCode}`,
  );
  const eDel = await inject(app, {
    method: "DELETE",
    url: "/admin/settings/enamad",
    headers: { authorization: `Bearer ${adminToken}` },
    remoteAddress: ip,
  });
  record(
    "enamad delete -> 404 after",
    eDel.statusCode === 200 && (await get("/site-assets/enamad")).statusCode === 404,
    "",
  );

  // New settings keys validate.
  record(
    "enamadLink must be a URL -> 400",
    (await patch("/admin/settings", { enamadLink: "not-a-url" }, adminToken)).statusCode === 400,
    "",
  );
  const eLink = await patch(
    "/admin/settings",
    { enamadLink: "https://trustseal.enamad.ir/?id=123", contactEmail: "info@oostaai.store" },
    adminToken,
  );
  record(
    "contact/enamad settings stored",
    eLink.statusCode === 200 &&
      obj(body(eLink).settings).enamadLink === "https://trustseal.enamad.ir/?id=123",
    `status=${eLink.statusCode}`,
  );
  await patch("/admin/settings", { enamadLink: null, contactEmail: null }, adminToken);

  // ---- Payment gateway runtime config ----
  const gwGet = await get("/admin/settings/payments", adminToken);
  record(
    "gateway config GET -> provider present",
    gwGet.statusCode === 200 && typeof obj(body(gwGet).payments).provider === "string",
    `status=${gwGet.statusCode}`,
  );
  const gwPatch = await patch(
    "/admin/settings/payments",
    { cardEnabled: true, cardNumber: "6219-8610 1234 5678", cardHolder: "Smoke", cardBank: "Test" },
    adminToken,
  );
  record(
    "gateway PATCH normalizes card number",
    gwPatch.statusCode === 200 && obj(body(gwPatch).payments).cardNumber === "6219861012345678",
    `status=${gwPatch.statusCode} card=${obj(body(gwPatch).payments).cardNumber}`,
  );
  const pubPay = await get("/payments/config");
  record(
    "public payment config reflects runtime card-to-card",
    pubPay.statusCode === 200 &&
      body(pubPay).cardToCard === true &&
      obj(body(pubPay).card).number === "6219861012345678",
    `status=${pubPay.statusCode}`,
  );
  record(
    "bad card number -> 400",
    (await patch("/admin/settings/payments", { cardNumber: "123" }, adminToken)).statusCode === 400,
    "",
  );
  record(
    "gateway PATCH no token -> 401",
    (await patch("/admin/settings/payments", { cardEnabled: false })).statusCode === 401,
    "",
  );
  // Switching to the real gateway requires a real merchant id (placeholder is refused).
  const gwZp = await patch(
    "/admin/settings/payments",
    { provider: "zarinpal", zarinpalMerchantId: "merchant-12345678" },
    adminToken,
  );
  record(
    "zarinpal with real merchant -> 200",
    gwZp.statusCode === 200 && obj(body(gwZp).payments).provider === "zarinpal",
    `status=${gwZp.statusCode}`,
  );
  record(
    "placeholder merchant while zarinpal -> 400",
    (
      await patch(
        "/admin/settings/payments",
        { zarinpalMerchantId: "00000000-0000-0000-0000-000000000000" },
        adminToken,
      )
    ).statusCode === 400,
    "",
  );

  // Revert to env defaults.
  await patch(
    "/admin/settings/payments",
    {
      provider: null,
      zarinpalMerchantId: null,
      cardEnabled: null,
      cardNumber: null,
      cardHolder: null,
      cardBank: null,
    },
    adminToken,
  );

  // Internal prefs stored in the same table (agent.* model choices) must never
  // leak through the public settings endpoint.
  await prisma.siteSetting.upsert({
    where: { key: "agent.textModel" },
    create: { key: "agent.textModel", value: "smoke/test-model" },
    update: { value: "smoke/test-model" },
  });
  const leak = body(await get("/site-settings")).settings as Record<string, unknown>;
  record("agent.* prefs not leaked publicly", leak["agent.textModel"] === undefined, "");
  await prisma.siteSetting.deleteMany({ where: { key: "agent.textModel" } });

  // ---- Product sortOrder pins listing position ----
  const cats = (await prisma.category.findMany({ take: 1 })) as Array<{ id: string }>;
  if (cats.length > 0) {
    const mk = (n: string) =>
      post(
        "/admin/products",
        {
          name: `Sort ${n} ${suffix}`,
          slug: `sort-${n}-${suffix}`,
          description: "Sorting smoke product",
          type: "ACCOUNT",
          categoryId: cats[0].id,
        },
        adminToken,
      );
    const a = String(obj((await mk("a").then(body)).product).id);
    const b = String(obj((await mk("b").then(body)).product).id);
    // b was created later (newest-first would rank it before a); pin a above b.
    await patch(`/admin/products/${a}`, { sortOrder: 10 }, adminToken);
    const list = body(await get("/products?pageSize=50")).items as Array<{ id: string }>;
    const posA = list.findIndex((p) => p.id === a);
    const posB = list.findIndex((p) => p.id === b);
    record(
      "sortOrder pins product earlier",
      posA !== -1 && posB !== -1 && posA < posB,
      `posA=${posA} posB=${posB}`,
    );
    await prisma.product.deleteMany({ where: { id: { in: [a, b] } } });
  }
}

async function testTickets(): Promise<void> {
  ip = "10.10.0.7";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");

  const signup = await post("/auth/signup", {
    name: "Ticket User",
    email: `tkt_${suffix}@example.com`,
    password: "Tkt@12345",
  });
  const token = String(body(signup).token);
  const userId = String(obj(body(signup).user).id);

  const other = await post("/auth/signup", {
    name: "Other",
    email: `tkto_${suffix}@example.com`,
    password: "Tkt@12345",
  });
  const otherToken = String(body(other).token);
  const otherId = String(obj(body(other).user).id);

  // Auth required
  const noAuth = await post("/tickets", { subject: "x", body: "y" });
  record("POST /tickets no token -> 401", noAuth.statusCode === 401, `status=${noAuth.statusCode}`);

  // Create
  const create = await post("/tickets", { subject: "Help me", body: "It broke" }, token);
  record("create ticket -> 201", create.statusCode === 201, `status=${create.statusCode}`);
  const ticketId = String(body(create).id);

  // List + detail
  const list = body(await get("/tickets", token)).tickets as unknown[] | undefined;
  record("list my tickets >=1", Array.isArray(list) && list.length >= 1, `count=${list?.length}`);
  const detail = obj(body(await get(`/tickets/${ticketId}`, token)).ticket);
  record(
    "ticket detail has first message",
    (detail.messages as unknown[]).length === 1,
    `msgs=${(detail.messages as unknown[]).length}`,
  );

  // Cross-user cannot read
  const cross = await get(`/tickets/${ticketId}`, otherToken);
  record("cross-user ticket -> 404", cross.statusCode === 404, `status=${cross.statusCode}`);

  // User reply
  const reply = await post(`/tickets/${ticketId}/messages`, { body: "any update?" }, token);
  record(
    "user reply -> 2 messages",
    reply.statusCode === 200 && (obj(body(reply).ticket).messages as unknown[]).length === 2,
    `status=${reply.statusCode}`,
  );

  // Admin
  const adminToken = String(
    body(await post("/auth/login", { identifier: "admin@oosta.local", password: "Admin@12345" }))
      .token,
  );
  const adminList = body(await get("/admin/tickets?status=OPEN", adminToken)) as {
    items?: Array<Record<string, unknown>>;
  };
  record(
    "admin tickets queue contains it",
    (adminList.items ?? []).some((tk) => tk.id === ticketId),
    "",
  );
  const staffReply = await post(
    `/admin/tickets/${ticketId}/messages`,
    { body: "Fixed!" },
    adminToken,
  );
  record(
    "admin reply -> ANSWERED",
    staffReply.statusCode === 200 && obj(body(staffReply).ticket).status === "ANSWERED",
    `status=${staffReply.statusCode}`,
  );
  const close = await post(`/admin/tickets/${ticketId}/status`, { status: "CLOSED" }, adminToken);
  record(
    "admin close -> CLOSED",
    close.statusCode === 200 && obj(body(close).ticket).status === "CLOSED",
    `status=${close.statusCode}`,
  );

  // Cleanup (messages cascade with ticket)
  await prisma.ticket.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
}

async function testSecurity(): Promise<void> {
  ip = "10.10.0.4";
  const suffix = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");

  const signupA = await post("/auth/signup", {
    name: "Sec A",
    email: `seca_${suffix}@example.com`,
    password: "Sec@12345",
  });
  const signupB = await post("/auth/signup", {
    name: "Sec B",
    email: `secb_${suffix}@example.com`,
    password: "Sec@12345",
  });
  const tokenA = String(body(signupA).token);
  const tokenB = String(body(signupB).token);
  const userAId = String(obj(body(signupA).user).id);
  const userBId = String(obj(body(signupB).user).id);

  // Isolated product with one unit
  const category = await prisma.category.findUnique({ where: { slug: "ai-accounts" } });
  const product = await prisma.product.create({
    data: {
      name: `Sec ${suffix}`,
      slug: `sec-${suffix}`,
      description: "Security test product.",
      type: "ACCOUNT",
      categoryId: category!.id,
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "P", price: 100000 },
  });
  await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      planId: plan.id,
      type: "ACCOUNT",
      accountEmail: `x_${suffix}@s.local`,
      accountPassword: "p",
    },
  });

  // A creates an order
  const createA = await post("/orders", { items: [{ planId: plan.id, quantity: 1 }] }, tokenA);
  const orderAId = String(obj(body(createA).order).id);

  // B cannot read A's order
  const cross = await get(`/orders/${orderAId}`, tokenB);
  record("cross-user order access -> 404", cross.statusCode === 404, `status=${cross.statusCode}`);

  // Unknown payment authority
  const badVerify = await post("/payments/verify", {
    authority: `nonexistent_${suffix}`,
    status: "OK",
  });
  record(
    "verify unknown authority -> 404",
    badVerify.statusCode === 404,
    `status=${badVerify.statusCode}`,
  );

  // Invalid order payloads
  const q0 = await post("/orders", { items: [{ planId: plan.id, quantity: 0 }] }, tokenA);
  record("order quantity 0 -> 400", q0.statusCode === 400, `status=${q0.statusCode}`);
  const emptyItems = await post("/orders", { items: [] }, tokenA);
  record(
    "order empty items -> 400",
    emptyItems.statusCode === 400,
    `status=${emptyItems.statusCode}`,
  );

  // Cleanup
  await prisma.order.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  await prisma.inventoryItem.deleteMany({ where: { productId: product.id } });
  await prisma.productPlan.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
}

async function main(): Promise<void> {
  await testFoundation();
  await testCatalog();
  await testAuth();
  await testOrders();
  await testAdmin();
  await testCardToCard();
  await testRichness();
  await testApiKeys();
  await testBlog();
  await testPagesAndSettings();
  await testTickets();
  await testSecurity();
  testRoleGuard();

  let allPass = true;
  for (const c of checks) {
    if (!c.pass) allPass = false;
    console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}${c.info ? ` — ${c.info}` : ""}`);
  }
  console.log(
    `\n${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} (${checks.length} checks)`,
  );
  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
