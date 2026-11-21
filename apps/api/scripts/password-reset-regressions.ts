import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { newWelcomeCode } from "../src/modules/orders/welcome-gift";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1", "Use the isolated test runner");
  const email = "password-reset@example.invalid";
  const password = "Original-password-1";
  const newPassword = "Replacement-password-2";
  const giftCode = newWelcomeCode();
  const resetEmails: { to: string; text: string; html?: string }[] = [];
  const verificationEmails: { to: string; text: string; html?: string }[] = [];
  const welcomeEmails: { to: string; text: string; html?: string }[] = [];
  let failSend = false;
  let ip = 1;
  const app = createApp({
    sendPasswordResetEmail: async (message) => {
      if (message.subject === "Verify your Oosta recovery email") verificationEmails.push(message);
      else if (message.subject === "Welcome to Oosta AI") welcomeEmails.push(message);
      else resetEmails.push(message);
      if (failSend) throw new Error("Synthetic SMTP failure");
    },
  });
  const post = (
    url: string,
    payload: object,
    remoteAddress = `198.18.10.${ip++}`,
    origin = env.corsOrigins[0],
  ) => inject(app, { method: "POST", url, remoteAddress, headers: { origin }, payload });
  const request = (address: string) =>
    post("/auth/forgot-password", { email: address, locale: "en" });
  const confirm = (token: string) => post("/auth/reset-password", { token, newPassword });
  async function messageAt(index: number) {
    for (let check = 0; check < 100 && !resetEmails[index]; check++) await delay(20);
    const message = resetEmails[index];
    assert(message, "Expected the synthetic reset email");
    assert.equal(message.to, email);
    const url = new URL(message.text.split("\n").at(-1)!);
    assert(message.html?.includes(`href="${url.href}"`));
    assert.match(message.html, /lang="en" dir="ltr"/);
    assert.equal(url.origin, new URL(env.WEB_BASE_URL).origin);
    assert.equal(url.pathname, "/en/reset-password");
    assert.equal(url.search, "");
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    assert.match(token ?? "", /^[A-Za-z0-9_-]{43}$/);
    return token!;
  }

  const user = await prisma.user.create({
    data: {
      name: "Reset fixture",
      email,
      passwordHash: await hashPassword(password),
      welcomeGift: { create: { code: giftCode } },
    },
  });
  const adminEmail = "reset-ineligible-admin@example.invalid";
  await prisma.user.create({
    data: {
      name: "Reset admin fixture",
      email: adminEmail,
      verifiedRecoveryEmail: adminEmail,
      role: "ADMIN",
      passwordHash: await hashPassword(password),
    },
  });
  const disabled = createApp();
  const disabledRequest = (address: string) =>
    inject(disabled, {
      method: "POST",
      url: "/auth/forgot-password",
      remoteAddress: `198.18.10.${ip++}`,
      payload: { email: address },
    });
  const unavailable = await disabledRequest(email);
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.json().error.code, "PASSWORD_RESET_UNAVAILABLE");
  assert.equal(unavailable.body, (await disabledRequest("unknown@example.invalid")).body);
  const login = await post("/auth/login", { identifier: email, password });
  assert.equal(login.statusCode, 200);
  const originalToken = login.json().token;
  const unknown = await request("nobody@example.invalid");
  assert.equal(unknown.statusCode, 202, unknown.body);
  assert.equal((await request(email)).body, unknown.body);
  await delay(50);
  assert.equal(
    resetEmails.length,
    0,
    "An unverified mailbox must not receive an account reset token",
  );

  const authPost = (url: string, payload: object, token = originalToken) =>
    inject(app, {
      method: "POST",
      url,
      remoteAddress: `198.18.10.${ip++}`,
      headers: { origin: env.corsOrigins[0], authorization: `Bearer ${token}` },
      payload,
    });
  const verificationRoute = "/auth/recovery-email/request";
  const verificationPayload = { currentPassword: password, locale: "en" };
  assert.equal((await post(verificationRoute, verificationPayload)).statusCode, 401);
  assert.equal(
    (
      await authPost(verificationRoute, {
        ...verificationPayload,
        currentPassword: "Wrong-password",
      })
    ).statusCode,
    400,
  );
  const enrollment = await authPost(verificationRoute, verificationPayload);
  assert.equal(enrollment.statusCode, 202);
  assert.deepEqual(enrollment.json(), { accepted: true, deliveryRequested: true });
  for (let check = 0; check < 100 && !verificationEmails[0]; check++) await delay(20);
  assert.equal(verificationEmails[0]?.to, email);
  const repeatedEnrollment = await authPost(verificationRoute, verificationPayload);
  assert.equal(repeatedEnrollment.statusCode, 202);
  assert.deepEqual(repeatedEnrollment.json(), { accepted: true, deliveryRequested: false });
  assert.equal(verificationEmails.length, 1);
  const verificationToken = verificationEmails[0].text.split("\n").at(-1)!;
  assert(verificationEmails[0].html?.includes(verificationToken));
  assert.equal(
    (await confirm(verificationToken)).statusCode,
    400,
    "A verification token cannot reset passwords",
  );
  const verificationConfirmRoute = "/auth/recovery-email/verify";
  assert.equal(
    (await post(verificationConfirmRoute, { token: verificationToken })).statusCode,
    401,
  );
  const otherEmail = "another-reset-account@example.invalid";
  await prisma.user.create({
    data: {
      name: "Other reset fixture",
      email: otherEmail,
      passwordHash: await hashPassword(password),
    },
  });
  const otherUser = await post("/auth/login", { identifier: otherEmail, password });
  assert.equal(otherUser.statusCode, 200);
  assert.equal(
    (await authPost(verificationConfirmRoute, { token: verificationToken }, otherUser.json().token))
      .statusCode,
    400,
  );
  assert.equal(
    (await authPost(verificationConfirmRoute, { token: "x".repeat(43) })).statusCode,
    400,
  );
  assert.equal(welcomeEmails.length, 0, "No offer before verifying ownership");
  const confirmations = await Promise.all([
    authPost(verificationConfirmRoute, { token: verificationToken, locale: "en" }),
    authPost(verificationConfirmRoute, { token: verificationToken, locale: "en" }),
  ]);
  assert.deepEqual(confirmations.map((reply) => reply.statusCode).sort(), [204, 400]);
  for (let check = 0; check < 100 && !welcomeEmails[0]; check++) await delay(20);
  assert.equal(welcomeEmails.length, 1);
  assert.equal(welcomeEmails[0].to, email);
  assert(welcomeEmails[0].text.includes(giftCode));
  assert(welcomeEmails[0].html?.includes(giftCode));
  assert.match(welcomeEmails[0].text, /15%/);
  const verified = await inject(app, {
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${originalToken}` },
  });
  assert.equal(verified.json().user.recoveryEmailVerified, true);
  assert(!("verifiedRecoveryEmail" in verified.json().user));
  const adminRequest = await request(adminEmail);
  assert.equal(adminRequest.statusCode, 202, adminRequest.body);
  assert.equal(adminRequest.body, unknown.body);
  assert.equal(await prisma.passwordReset.findFirst({ where: { email: adminEmail } }), null);
  const known = await request(`  ${email.toUpperCase()}  `);
  assert.equal(known.statusCode, 202, known.body);
  assert.equal(known.body, unknown.body);
  assert.equal(known.headers["cache-control"], "private, no-store");
  const token = await messageAt(0);
  await request(email);
  const stored = await prisma.passwordReset.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal(stored.tokenHash, createHash("sha256").update(token).digest("hex"));
  assert.equal(stored.expiresAt.getTime() - stored.requestedAt.getTime(), 15 * 60 * 1000);
  assert(!known.body.includes(token));
  await prisma.passwordReset.update({
    where: { userId: user.id },
    data: { requestedAt: new Date(0) },
  });
  await request(email);
  await delay(50);
  assert.equal(resetEmails.length, 1, "Repeated requests must not invalidate a usable link");
  for (const path of ["/auth/forgot-password", "/auth/reset-password"]) {
    const foreign = await post(
      path,
      { email, token, newPassword },
      undefined,
      "https://untrusted.example.invalid",
    );
    assert.equal(foreign.statusCode, 403);
  }
  assert.equal((await confirm("x".repeat(43))).statusCode, 400);
  assert.equal(
    (await post("/auth/reset-password", { token, newPassword: "short" })).statusCode,
    400,
  );
  await prisma.passwordReset.update({
    where: { userId: user.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await confirm(token)).statusCode, 400);
  assert.equal((await post("/auth/login", { identifier: email, password })).statusCode, 200);
  assert.equal(resetEmails.length, 1, "Per-account throttling applies across request IPs");

  await prisma.passwordReset.update({
    where: { userId: user.id },
    data: { requestedAt: new Date(0), expiresAt: new Date(0) },
  });
  failSend = true;
  assert.equal(
    (await request(email)).body,
    unknown.body,
    "SMTP failure preserves the public response",
  );
  await messageAt(1);
  await prisma.passwordReset.update({
    where: { userId: user.id },
    data: { requestedAt: new Date(0), expiresAt: new Date(0) },
  });
  failSend = false;
  await request(email);
  const freshToken = await messageAt(2);
  assert.equal((await confirm(token)).statusCode, 400);
  await prisma.user.update({ where: { id: user.id }, data: { email: "changed@example.invalid" } });
  assert.equal(
    (await confirm(freshToken)).statusCode,
    400,
    "A previously verified mailbox cannot reset a changed account email",
  );
  await prisma.user.update({ where: { id: user.id }, data: { email } });
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  assert.equal(
    (await confirm(freshToken)).statusCode,
    400,
    "An account promoted since issuance cannot use customer reset",
  );
  await prisma.user.update({ where: { id: user.id }, data: { role: "USER" } });
  const attempts = await Promise.all([confirm(freshToken), confirm(freshToken)]);
  assert.deepEqual(attempts.map(({ statusCode }) => statusCode).sort(), [204, 400]);
  assert.equal((await confirm(freshToken)).statusCode, 400);
  assert.equal((await post("/auth/login", { identifier: email, password })).statusCode, 401);
  assert.equal(
    (await post("/auth/login", { identifier: email, password: newPassword })).statusCode,
    200,
  );
  const revoked = await inject(app, {
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${originalToken}` },
  });
  assert.equal(revoked.statusCode, 401);

  const limitIp = "198.18.20.1";
  for (let index = 0; index < 10; index++) {
    assert.equal(
      (await post("/auth/forgot-password", { email: `unknown-${index}@example.invalid` }, limitIp))
        .statusCode,
      202,
    );
  }
  assert.equal((await post("/auth/forgot-password", { email }, limitIp)).statusCode, 429);
  console.log(
    "PASS: password reset is private, throttled, single-use, expiring, and revokes sessions",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
