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
const ip = "127.0.0.1";

type Check = { name: string; pass: boolean; info: string };
const checks: Check[] = [];
function record(name: string, pass: boolean, info: string): void {
  checks.push({ name, pass, info });
}
function body(res: LightResponse): Record<string, unknown> {
  return JSON.parse(res.body) as Record<string, unknown>;
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

async function main(): Promise<void> {
  await testFoundation();
  await testCatalog();
  await testAuth();
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
