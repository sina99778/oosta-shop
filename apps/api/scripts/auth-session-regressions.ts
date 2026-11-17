// Login-session hardening: httpOnly cookie sessions, CSRF origin checks for cookie
// auth, password change, and server-side revocation of every older token.
// Runs only through `npm run test:isolated` (disposable database, synthetic users).
import assert from "node:assert/strict";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { createApiKey } from "../src/modules/admin/admin.service";
import { prisma } from "../src/lib/prisma";

const ORIGIN = env.corsOrigins[0];
let ipCounter = 1;
// Each step gets its own synthetic client address so the auth limiter never masks a result.
const nextIp = () => `198.18.0.${ipCounter++}`;

function sessionCookie(setCookie: string | string[] | undefined): string {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = values.find((value) => value.startsWith("oosta_session="));
  assert(cookie, "Expected an oosta_session cookie");
  return cookie;
}
const cookiePair = (cookie: string) => cookie.split(";")[0];

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1", "Use the isolated test runner");
  const app = createApp();
  const email = "session-regression@example.invalid";
  const password = "Original-Pass-1";
  const json = { "content-type": "application/json" };

  // Signup issues an httpOnly, SameSite cookie scoped to the whole site.
  const signup = await inject(app, {
    method: "POST",
    url: "/auth/signup",
    remoteAddress: nextIp(),
    headers: { ...json, origin: ORIGIN },
    payload: JSON.stringify({ name: "Session user", email, password }),
  });
  assert.equal(signup.statusCode, 201, signup.body);
  const signupCookie = sessionCookie(signup.headers["set-cookie"]);
  assert.match(signupCookie, /;\s*HttpOnly/i);
  assert.match(signupCookie, /;\s*SameSite=Lax/i);
  assert.match(signupCookie, /;\s*Path=\//i);
  assert.match(signupCookie, /;\s*Max-Age=\d+/i);
  assert.doesNotMatch(signupCookie, /;\s*Secure/i, "Development cookies work over plain HTTP");
  assert.equal(signup.headers["cache-control"], "private, no-store");

  // Production cookies are Secure.
  const priorProduction = env.isProduction;
  env.isProduction = true;
  try {
    const prodLogin = await inject(app, {
      method: "POST",
      url: "/auth/login",
      remoteAddress: nextIp(),
      headers: { ...json, origin: ORIGIN },
      payload: JSON.stringify({ identifier: email, password }),
    });
    assert.equal(prodLogin.statusCode, 200, prodLogin.body);
    assert.match(sessionCookie(prodLogin.headers["set-cookie"]), /;\s*Secure/i);
  } finally {
    env.isProduction = priorProduction;
  }

  const login = await inject(app, {
    method: "POST",
    url: "/auth/login",
    remoteAddress: nextIp(),
    headers: { ...json, origin: ORIGIN },
    payload: JSON.stringify({ identifier: email, password }),
  });
  assert.equal(login.statusCode, 200, login.body);
  const oldCookie = cookiePair(sessionCookie(login.headers["set-cookie"]));
  const oldToken = (JSON.parse(login.body) as { token: string }).token;

  // The cookie alone authenticates reads.
  const me = await inject(app, { method: "GET", url: "/auth/me", headers: { cookie: oldCookie } });
  assert.equal(me.statusCode, 200, me.body);
  assert.equal((JSON.parse(me.body) as { user: { email: string } }).user.email, email);
  assert.doesNotMatch(me.body, /passwordHash|sessionVersion/);
  console.log("PASS: signup/login set an httpOnly SameSite session cookie (Secure in production)");

  // A malformed or forged cookie is rejected, not treated as a session.
  const forged = await inject(app, {
    method: "GET",
    url: "/auth/me",
    headers: { cookie: "oosta_session=not-a-jwt" },
  });
  assert.equal(forged.statusCode, 401);
  const noAuth = await inject(app, { method: "GET", url: "/auth/me" });
  assert.equal(noAuth.statusCode, 401);

  // Cookie-authenticated writes must come from the storefront origin (CSRF guard).
  const changeBody = JSON.stringify({ currentPassword: password, newPassword: "Rotated-Pass-2" });
  const crossSite = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: oldCookie, origin: "https://evil.example.invalid" },
    payload: changeBody,
  });
  assert.equal(crossSite.statusCode, 403, crossSite.body);
  assert.equal(
    (JSON.parse(crossSite.body) as { error: { code: string } }).error.code,
    "CSRF_REJECTED",
  );
  const noOrigin = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: oldCookie },
    payload: changeBody,
  });
  assert.equal(noOrigin.statusCode, 403, noOrigin.body);
  const badReferer = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: oldCookie, referer: "https://evil.example.invalid/x" },
    payload: changeBody,
  });
  assert.equal(badReferer.statusCode, 403, badReferer.body);
  const crossSiteOrder = await inject(app, {
    method: "POST",
    url: "/orders",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: oldCookie, origin: "https://evil.example.invalid" },
    payload: "{}",
  });
  assert.equal(crossSiteOrder.statusCode, 403, "Every cookie-authenticated write is guarded");
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash !== "",
    true,
  );
  const stillOld = await inject(app, {
    method: "POST",
    url: "/auth/login",
    remoteAddress: nextIp(),
    headers: { ...json, origin: ORIGIN },
    payload: JSON.stringify({ identifier: email, password }),
  });
  assert.equal(stillOld.statusCode, 200, "Rejected CSRF attempts change nothing");
  console.log("PASS: cookie-authenticated writes from foreign or missing origins are rejected");

  // Wrong current password fails and keeps every session.
  const wrongCurrent = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: oldCookie, origin: ORIGIN },
    payload: JSON.stringify({ currentPassword: "Not-The-Pass-9", newPassword: "Rotated-Pass-2" }),
  });
  assert.equal(wrongCurrent.statusCode, 400, "A valid session is not dropped by a typo");
  assert.equal(
    (JSON.parse(wrongCurrent.body) as { error: { code: string } }).error.code,
    "INVALID_CURRENT_PASSWORD",
  );
  const weakNew = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: oldCookie, origin: ORIGIN },
    payload: JSON.stringify({ currentPassword: password, newPassword: "short" }),
  });
  assert.equal(weakNew.statusCode, 400, weakNew.body);
  const unauthenticated = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, origin: ORIGIN },
    payload: changeBody,
  });
  assert.equal(unauthenticated.statusCode, 401);
  const stillValid = await inject(app, {
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${oldToken}` },
  });
  assert.equal(stillValid.statusCode, 200, "Failed attempts revoke nothing");

  // API keys are for automation; they cannot change the owner's password or sessions.
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const apiKey = await createApiKey(user.id, "session-regression");
  for (const url of ["/auth/change-password", "/auth/logout-all"]) {
    const viaKey = await inject(app, {
      method: "POST",
      url,
      remoteAddress: nextIp(),
      headers: { ...json, "x-api-key": apiKey.key },
      payload: changeBody,
    });
    assert.equal(viaKey.statusCode, 403, `${url} via API key: ${viaKey.body}`);
  }

  // Successful change: new cookie issued, every earlier token and cookie revoked.
  const changed = await inject(app, {
    method: "POST",
    url: "/auth/change-password",
    remoteAddress: nextIp(),
    headers: { ...json, cookie: oldCookie, origin: ORIGIN },
    payload: changeBody,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const newCookie = cookiePair(sessionCookie(changed.headers["set-cookie"]));
  assert.notEqual(newCookie, oldCookie);
  assert.doesNotMatch(changed.body, /passwordHash|sessionVersion/);
  for (const headers of [{ cookie: oldCookie }, { authorization: `Bearer ${oldToken}` }]) {
    const revoked = await inject(app, { method: "GET", url: "/auth/me", headers });
    assert.equal(revoked.statusCode, 401, "Tokens issued before the change are revoked");
  }
  const fresh = await inject(app, {
    method: "GET",
    url: "/auth/me",
    headers: { cookie: newCookie },
  });
  assert.equal(fresh.statusCode, 200);
  const oldPasswordLogin = await inject(app, {
    method: "POST",
    url: "/auth/login",
    remoteAddress: nextIp(),
    headers: { ...json, origin: ORIGIN },
    payload: JSON.stringify({ identifier: email, password }),
  });
  assert.equal(oldPasswordLogin.statusCode, 401);
  console.log("PASS: password change requires the current password and revokes older sessions");

  // Bearer clients (scripts, API automation) keep working without an Origin header.
  const bearerLogin = await inject(app, {
    method: "POST",
    url: "/auth/login",
    remoteAddress: nextIp(),
    headers: json,
    payload: JSON.stringify({ identifier: email, password: "Rotated-Pass-2" }),
  });
  assert.equal(bearerLogin.statusCode, 200, bearerLogin.body);
  const bearer = (JSON.parse(bearerLogin.body) as { token: string }).token;
  const bearerWrite = await inject(app, {
    method: "POST",
    url: "/orders",
    remoteAddress: nextIp(),
    headers: { ...json, authorization: `Bearer ${bearer}` },
    payload: "{}",
  });
  assert.equal(bearerWrite.statusCode, 400, "Bearer writes reach validation without an Origin");

  // Logout clears this browser's cookie; logout-all revokes every device.
  const logout = await inject(app, {
    method: "POST",
    url: "/auth/logout",
    headers: { cookie: newCookie, origin: ORIGIN },
  });
  assert.equal(logout.statusCode, 204);
  const cleared = sessionCookie(logout.headers["set-cookie"]);
  assert.match(cleared, /^oosta_session=;/);
  assert.match(cleared, /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  const logoutAll = await inject(app, {
    method: "POST",
    url: "/auth/logout-all",
    remoteAddress: nextIp(),
    headers: { cookie: newCookie, origin: ORIGIN },
  });
  assert.equal(logoutAll.statusCode, 204, logoutAll.body);
  for (const headers of [{ cookie: newCookie }, { authorization: `Bearer ${bearer}` }]) {
    const revoked = await inject(app, { method: "GET", url: "/auth/me", headers });
    assert.equal(revoked.statusCode, 401, "logout-all revokes every existing session");
  }
  console.log("PASS: logout clears the cookie and logout-all revokes every device");

  await prisma.apiKey.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
