// Regressions for the storefront redesign features: device sessions, ticket order links
// and private screenshots, admin ticket customer summary, catalog filters and journal
// topics. Runs only through `npm run test:isolated` (disposable DB, synthetic users).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { createApiKey } from "../src/modules/admin/admin.service";
import { ipPrefix } from "../src/lib/userSessions";

const ORIGIN = env.corsOrigins[0];
const json = { "content-type": "application/json" };
let ipCounter = 1;
const nextIp = () => `198.19.0.${ipCounter++}`;
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

function cookieFrom(setCookie: string | string[] | undefined): string {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = values.find((value) => value.startsWith("oosta_session="));
  assert(cookie, "Expected an oosta_session cookie");
  return cookie.split(";")[0];
}

const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.from("0000000d49484452000000010000000108060000001f15c489", "hex"),
]);

function multipart(
  fields: Record<string, string>,
  file?: { name: string; type: string; data: Buffer },
) {
  const boundary = "----oosta" + randomUUID().replace(/-/g, "");
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields))
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  if (file)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.data,
      Buffer.from("\r\n"),
    );
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` };
}

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1", "Use the isolated test runner");
  const app = createApp();

  // ---------------- Device sessions ----------------
  assert.equal(ipPrefix("85.185.12.9"), "85.185.x.x");
  assert.equal(ipPrefix("::ffff:10.20.30.40"), "10.20.x.x");
  assert.equal(ipPrefix("2001:db8:1:2::5"), "2001:db8:…");
  assert.equal(ipPrefix("not an ip"), null);

  const email = "devices@example.invalid";
  const password = "Devices-Pass-1";
  const signup = await inject(app, {
    method: "POST",
    url: "/auth/signup",
    remoteAddress: nextIp(),
    headers: { ...json, origin: ORIGIN, "user-agent": CHROME },
    payload: JSON.stringify({ name: "Device owner", email, password }),
  });
  assert.equal(signup.statusCode, 201, signup.body);
  const desktop = cookieFrom(signup.headers["set-cookie"]);
  const owner = await prisma.user.findUniqueOrThrow({ where: { email } });

  const login = (ua: string) =>
    inject(app, {
      method: "POST",
      url: "/auth/login",
      remoteAddress: "85.185.12.9",
      headers: { ...json, origin: ORIGIN, "user-agent": ua },
      payload: JSON.stringify({ identifier: email, password }),
    });
  const phoneLogin = await login(SAFARI);
  assert.equal(phoneLogin.statusCode, 200, phoneLogin.body);
  const phone = cookieFrom(phoneLogin.headers["set-cookie"]);
  const tabletLogin = await login(CHROME);
  const tablet = cookieFrom(tabletLogin.headers["set-cookie"]);

  const as = (cookie: string, method: "GET" | "POST" | "DELETE", url: string) =>
    inject(app, {
      method,
      url,
      headers: { cookie, origin: ORIGIN, ...(method === "GET" ? {} : json) },
      remoteAddress: nextIp(),
      ...(method === "POST" ? { payload: "{}" } : {}),
    });

  const listed = await as(phone, "GET", "/auth/sessions");
  assert.equal(listed.statusCode, 200, listed.body);
  assert.match(String(listed.headers["cache-control"]), /no-store/);
  const sessions = listed.json().sessions as {
    id: string;
    browser: string;
    os: string;
    ipPrefix: string | null;
    current: boolean;
  }[];
  assert.equal(sessions.length, 3);
  assert.equal(sessions.filter((s) => s.current).length, 1);
  const currentPhone = sessions.find((s) => s.current)!;
  assert.deepEqual([currentPhone.browser, currentPhone.os], ["Safari", "iOS"]);
  assert.equal(currentPhone.ipPrefix, "85.185.x.x");
  // Raw user agents and full addresses never leave the server.
  assert.doesNotMatch(listed.body, /AppleWebKit|85\.185\.12\.9/);

  // Revoking one device ends only that device.
  const desktopRow = await prisma.userSession.findFirstOrThrow({
    where: { userId: owner.id, userAgent: CHROME },
    orderBy: { createdAt: "asc" },
  });
  assert.equal((await as(phone, "DELETE", `/auth/sessions/${desktopRow.id}`)).statusCode, 204);
  assert.equal((await as(desktop, "GET", "/auth/me")).statusCode, 401);
  assert.equal((await as(phone, "GET", "/auth/me")).statusCode, 200);
  assert.equal((await as(tablet, "GET", "/auth/me")).statusCode, 200);

  // Another account cannot see or end this account's devices.
  const intruderSignup = await inject(app, {
    method: "POST",
    url: "/auth/signup",
    remoteAddress: nextIp(),
    headers: { ...json, origin: ORIGIN, "user-agent": CHROME },
    payload: JSON.stringify({
      name: "Intruder",
      email: "intruder@example.invalid",
      password: "Intruder-Pass-1",
    }),
  });
  const intruder = cookieFrom(intruderSignup.headers["set-cookie"]);
  const tabletRow = await prisma.userSession.findFirstOrThrow({
    where: { userId: owner.id, revokedAt: null, userAgent: CHROME },
  });
  assert.equal((await as(intruder, "DELETE", `/auth/sessions/${tabletRow.id}`)).statusCode, 404);
  assert.equal((await as(tablet, "GET", "/auth/me")).statusCode, 200);
  const intruderList = await as(intruder, "GET", "/auth/sessions");
  assert.equal(intruderList.json().sessions.length, 1);
  // Malformed ids are rejected before reaching the database.
  assert.equal((await as(phone, "DELETE", "/auth/sessions/x")).statusCode, 400);

  // API keys are automation credentials and cannot manage browser sessions.
  const ownerAdmin = await prisma.user.create({
    data: { name: "Key admin", passwordHash: "unused", role: "ADMIN" },
  });
  const key = await createApiKey(ownerAdmin.id, "sessions");
  const byKey = await inject(app, {
    method: "GET",
    url: "/auth/sessions",
    headers: { "x-api-key": key.key },
  });
  assert.equal(byKey.statusCode, 403);

  // "Sign out other devices" keeps the caller.
  const others = await as(phone, "POST", "/auth/sessions/revoke-others");
  assert.equal(others.statusCode, 200, others.body);
  assert.equal(others.json().revoked, 1);
  assert.equal((await as(tablet, "GET", "/auth/me")).statusCode, 401);
  assert.equal((await as(phone, "GET", "/auth/me")).statusCode, 200);

  // Logout ends the device row, so a copied cookie stops working too.
  assert.equal((await as(phone, "POST", "/auth/logout")).statusCode, 204);
  assert.equal((await as(phone, "GET", "/auth/me")).statusCode, 401);

  // Tokens issued before device sessions (no sid) keep working until a revocation.
  const legacy = signAccessToken({ sub: owner.id, role: "USER", sv: 0 });
  const legacyMe = await inject(app, {
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${legacy}` },
  });
  assert.equal(legacyMe.statusCode, 200, legacyMe.body);
  const legacyList = await inject(app, {
    method: "GET",
    url: "/auth/sessions",
    headers: { authorization: `Bearer ${legacy}` },
  });
  assert.equal(legacyList.json().currentTracked, false);
  // A token naming a session of another account is refused.
  const intruderRow = await prisma.userSession.findFirstOrThrow({
    where: { user: { email: "intruder@example.invalid" } },
  });
  const forged = signAccessToken({ sub: owner.id, role: "USER", sv: 0, sid: intruderRow.id });
  assert.equal(
    (
      await inject(app, {
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${forged}` },
      })
    ).statusCode,
    401,
  );

  // A password change ends every other device and continues on a fresh session.
  const fresh = cookieFrom((await login(CHROME)).headers["set-cookie"]);
  const second = cookieFrom((await login(SAFARI)).headers["set-cookie"]);
  const changed = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: fresh, origin: ORIGIN },
    payload: JSON.stringify({ currentPassword: password, newPassword: "Devices-Pass-2" }),
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const renewed = cookieFrom(changed.headers["set-cookie"]);
  assert.equal((await as(second, "GET", "/auth/me")).statusCode, 401);
  assert.equal((await as(renewed, "GET", "/auth/me")).statusCode, 200);
  const afterChange = (await as(renewed, "GET", "/auth/sessions")).json().sessions;
  assert.equal(afterChange.length, 1);
  assert.equal(afterChange[0].current, true);

  // ---------------- Tickets: order link and private screenshots ----------------
  const ownOrder = await prisma.order.create({
    data: { userId: owner.id, totalAmount: 1200, paymentStatus: "PAID" },
  });
  const intruderUser = await prisma.user.findUniqueOrThrow({
    where: { email: "intruder@example.invalid" },
  });
  const foreignOrder = await prisma.order.create({
    data: { userId: intruderUser.id, totalAmount: 900 },
  });
  const ticketPost = (
    cookie: string,
    fields: Record<string, string>,
    file?: Parameters<typeof multipart>[1],
  ) => {
    const body = multipart(fields, file);
    return inject(app, {
      method: "POST",
      url: "/tickets",
      headers: { cookie, origin: ORIGIN, "content-type": body.type },
      payload: body.payload,
    });
  };
  const ticketCountBefore = await prisma.ticket.count();
  const foreign = await ticketPost(renewed, {
    subject: "Probe",
    body: "x",
    orderId: foreignOrder.id,
  });
  assert.equal(foreign.statusCode, 404, foreign.body);
  assert.equal(foreign.json().error.code, "ORDER_NOT_FOUND");
  assert.equal(await prisma.ticket.count(), ticketCountBefore);

  const empty = await ticketPost(renewed, { subject: "Empty", body: "" });
  assert.equal(empty.statusCode, 400, empty.body);

  const spoofed = await ticketPost(
    renewed,
    { subject: "Spoof", body: "" },
    { name: "x.png", type: "image/png", data: Buffer.from("<svg onload=alert(1)>") },
  );
  assert.equal(spoofed.statusCode, 400);
  assert.equal(spoofed.json().error.code, "BAD_FILE_TYPE");
  const gif = await ticketPost(
    renewed,
    { subject: "Gif", body: "" },
    { name: "a.gif", type: "image/gif", data: Buffer.from("GIF89a....") },
  );
  assert.equal(gif.statusCode, 400);

  const oversized = await ticketPost(
    renewed,
    { subject: "Oversized", body: "" },
    {
      name: "large.png",
      type: "image/png",
      data: Buffer.alloc(5 * 1024 * 1024 + 1),
    },
  );
  assert.equal(oversized.statusCode, 400, oversized.body);
  assert.equal(oversized.json().error.code, "UPLOAD_ERROR");
  assert.equal(oversized.json().error.message, "File is too large (max 5 MB)");
  assert.equal(await prisma.ticket.count(), ticketCountBefore);

  // A malformed multipart body is a client error, not a server fault.
  const malformed = await ticketPost(
    renewed,
    { subject: "Broken", body: "" },
    { name: "bad\u0007name.png", type: "image/png", data: PNG },
  );
  assert.equal(malformed.statusCode, 400, malformed.body);
  assert.equal(malformed.json().error.code, "UPLOAD_ERROR");

  const created = await ticketPost(
    renewed,
    { subject: "Login problem", body: "", orderId: ownOrder.id },
    { name: "../../etc/<screen>shot.png", type: "image/png", data: PNG },
  );
  assert.equal(created.statusCode, 201, created.body);
  const ticketId = created.json().id as string;
  const detail = await as(renewed, "GET", `/tickets/${ticketId}`);
  assert.equal(detail.statusCode, 200, detail.body);
  const ticket = detail.json().ticket;
  assert.equal(ticket.order.id, ownOrder.id);
  assert.equal(ticket.order.totalAmount, 1200);
  const message = ticket.messages[0];
  assert.deepEqual(message.attachment, {
    name: "screenshot.png",
    mime: "image/png",
    size: PNG.length,
  });
  // Ticket JSON never carries screenshot bytes.
  assert.doesNotMatch(detail.body, /attachmentData/);
  const list = await as(renewed, "GET", "/tickets");
  assert.equal(list.json().tickets[0].orderId, ownOrder.id);

  const attachmentUrl = `/tickets/${ticketId}/messages/${message.id}/attachment`;
  const download = await as(renewed, "GET", attachmentUrl);
  assert.equal(download.statusCode, 200);
  assert.equal(download.headers["content-type"], "image/png");
  assert.equal(download.headers["x-content-type-options"], "nosniff");
  assert.match(String(download.headers["cache-control"]), /private, no-store/);
  assert.deepEqual(download.rawPayload, PNG);
  assert.equal((await as(intruder, "GET", attachmentUrl)).statusCode, 404);
  assert.equal((await inject(app, { method: "GET", url: attachmentUrl })).statusCode, 401);

  // Replies can carry a screenshot instead of text.
  const reply = multipart({ body: "" }, { name: "b.png", type: "image/png", data: PNG });
  const replied = await inject(app, {
    method: "POST",
    url: `/tickets/${ticketId}/messages`,
    headers: { cookie: renewed, origin: ORIGIN, "content-type": reply.type },
    payload: reply.payload,
  });
  assert.equal(replied.statusCode, 200, replied.body);
  assert.equal(replied.json().ticket.messages.length, 2);
  const intruderReply = multipart({ body: "hi" });
  const blocked = await inject(app, {
    method: "POST",
    url: `/tickets/${ticketId}/messages`,
    headers: { cookie: intruder, origin: ORIGIN, "content-type": intruderReply.type },
    payload: intruderReply.payload,
  });
  assert.equal(blocked.statusCode, 404);

  // ---------------- Admin ticket customer summary ----------------
  const admin = await prisma.user.create({
    data: { name: "Ticket admin", passwordHash: "unused", role: "ADMIN" },
  });
  const adminAuth = {
    authorization: `Bearer ${signAccessToken({ sub: admin.id, role: "ADMIN" })}`,
  };
  const adminDetail = await inject(app, {
    method: "GET",
    url: `/admin/tickets/${ticketId}`,
    headers: adminAuth,
  });
  assert.equal(adminDetail.statusCode, 200, adminDetail.body);
  const adminTicket = adminDetail.json().ticket;
  assert.equal(adminTicket.customer.orderCount, 1);
  assert(adminTicket.customer.memberSince);
  assert.equal(adminTicket.order.id, ownOrder.id);
  assert.doesNotMatch(adminDetail.body, /passwordHash|attachmentData/);
  const adminFile = await inject(app, {
    method: "GET",
    url: `/admin/tickets/${ticketId}/messages/${message.id}/attachment`,
    headers: adminAuth,
  });
  assert.equal(adminFile.statusCode, 200);
  const customerOnAdmin = await as(renewed, "GET", `/admin/tickets/${ticketId}`);
  assert.equal(customerOnAdmin.statusCode, 403);

  // ---------------- Catalog filters ----------------
  const category = await prisma.category.create({
    data: { name: "Filter fixture", slug: "filters-" + randomUUID().slice(0, 8) },
  });
  const variant = (access: string, delivery: string) => ({
    plan: "Plus",
    access,
    fulfillment: "ACCOUNT",
    delivery,
    warranty: { kind: "NONE" },
    region: "",
    quota: "",
  });
  const product = (name: string, plans: Record<string, unknown>[]) =>
    prisma.product.create({
      data: {
        slug: name + "-" + randomUUID().slice(0, 6),
        name,
        description: "Synthetic filter regression",
        type: "ACCOUNT",
        categoryId: category.id,
        plans: { create: plans as never },
      },
      include: { plans: true },
    });
  const personal = await product("personal-auto", [
    { label: "P", price: 100, variant: variant("PERSONAL", "AUTOMATIC") },
  ]);
  const shared = await product("shared-manual", [
    { label: "S", price: 100, variant: variant("SHARED", "MANUAL") },
  ]);
  const legacyProduct = await product("legacy-local", [{ label: "L", price: 100 }]);
  await prisma.inventoryItem.createMany({
    data: [
      {
        productId: personal.id,
        planId: personal.plans[0].id,
        type: "ACCOUNT",
        status: "AVAILABLE",
      },
      {
        productId: legacyProduct.id,
        planId: legacyProduct.plans[0].id,
        type: "ACCOUNT",
        status: "AVAILABLE",
      },
    ],
  });
  const ids = async (params: Record<string, string>) => {
    const res = await inject(app, {
      method: "GET",
      url: "/products?" + new URLSearchParams({ category: category.slug, ...params }),
    });
    assert.equal(res.statusCode, 200, res.body);
    return new Set((res.json().items as { id: string }[]).map((item) => item.id));
  };
  assert.deepEqual(await ids({ access: "PERSONAL" }), new Set([personal.id]));
  assert.deepEqual(await ids({ delivery: "MANUAL" }), new Set([shared.id]));
  assert.deepEqual(await ids({ delivery: "AUTOMATIC" }), new Set([personal.id, legacyProduct.id]));
  assert.deepEqual(await ids({ inStock: "true" }), new Set([personal.id, legacyProduct.id]));
  assert.deepEqual(
    await ids({ inStock: "true", sort: "price_asc" }),
    new Set([personal.id, legacyProduct.id]),
  );
  assert.deepEqual(await ids({ inStock: "true", access: "SHARED" }), new Set());
  const mixed = await product("mixed-delivery", [
    { label: "Unavailable personal", price: 100, variant: variant("PERSONAL", "MANUAL") },
    { label: "Available shared", price: 120, variant: variant("SHARED", "AUTOMATIC") },
  ]);
  await prisma.inventoryItem.create({
    data: {
      productId: mixed.id,
      planId: mixed.plans.find((plan) => plan.label === "Available shared")!.id,
      type: "ACCOUNT",
      status: "AVAILABLE",
    },
  });
  assert.deepEqual(await ids({ access: "PERSONAL", inStock: "true" }), new Set([personal.id]));
  assert.deepEqual(await ids({ delivery: "MANUAL", inStock: "true" }), new Set());
  assert.deepEqual(
    await ids({ access: "SHARED", delivery: "AUTOMATIC", inStock: "true", q: "mixed" }),
    new Set([mixed.id]),
  );
  assert.deepEqual(
    await ids({ access: "PERSONAL", delivery: "AUTOMATIC", inStock: "true" }),
    new Set([personal.id]),
  );
  const totals = await inject(app, {
    method: "GET",
    url:
      "/products?" +
      new URLSearchParams({ category: category.slug, inStock: "true", pageSize: "1" }),
  });
  assert.equal(totals.json().pagination.total, 3);
  const bad = await inject(app, { method: "GET", url: "/products?access=ADMIN" });
  assert.equal(bad.statusCode, 400);

  // ---------------- Journal topics ----------------
  const post = (slug: string, tag: string | null, content: string) =>
    inject(app, {
      method: "POST",
      url: "/admin/blog",
      headers: { ...adminAuth, ...json },
      payload: JSON.stringify({ title: slug, slug, tag, content, status: "PUBLISHED" }),
    });
  const compare = await post(
    "compare-tools",
    "مقایسه",
    `${"واژه ".repeat(450)}\n[ببین](/fa/products/${personal.slug}) و [این](/products/${personal.slug}) و [نیست](/products/missing-product)`,
  );
  assert.equal(compare.statusCode, 201, compare.body);
  assert.equal((await post("compare-two", "مقایسه", "کوتاه")).statusCode, 201);
  assert.equal((await post("guide-one", "راهنمای خرید", "کوتاه")).statusCode, 201);
  assert.equal((await post("untagged", null, "کوتاه")).statusCode, 201);
  assert.equal((await post("too-long", "x".repeat(41), "کوتاه")).statusCode, 400);
  const customerPost = await inject(app, {
    method: "POST",
    url: "/admin/blog",
    headers: { cookie: renewed, origin: ORIGIN, ...json },
    payload: JSON.stringify({ title: "x", slug: "x-post", tag: "x", content: "x" }),
  });
  assert.equal(customerPost.statusCode, 403);

  const journal = (await inject(app, { method: "GET", url: "/blog" })).json();
  assert.deepEqual(journal.tags[0], { tag: "مقایسه", count: 2 });
  const filtered = await inject(app, {
    method: "GET",
    url: "/blog?tag=" + encodeURIComponent("مقایسه"),
  });
  assert.deepEqual((filtered.json().posts as { slug: string }[]).map((p) => p.slug).sort(), [
    "compare-tools",
    "compare-two",
  ]);
  const article = (await inject(app, { method: "GET", url: "/blog/compare-tools" })).json().post;
  assert.equal(article.readingMinutes, 2);
  assert.equal(article.related[0].slug, "compare-two");
  assert.equal(article.related.length, 3);
  assert.deepEqual(
    (article.products as { slug: string }[]).map((p) => p.slug),
    [personal.slug],
  );
  assert.doesNotMatch(JSON.stringify(article.related), /"content"/);

  console.log("design feature regressions passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
